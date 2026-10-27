import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import Anthropic from '@anthropic-ai/sdk';
import type { AiAnswer, AiAskRequest, AiReport, AiSource, AiStatus } from '@sportsos/shared';
import { AnalyticsService } from '../analytics/analytics.service';
import { PrismaService } from '../prisma/prisma.service';
import { KnowledgeService } from './knowledge.service';
import { LocalBm25Store, PineconeStore, SearchHit, VectorStore } from './vector-store';

export type AskEvent =
  | { type: 'sources'; sources: AiSource[] }
  | { type: 'delta'; text: string }
  | { type: 'done'; generatedBy: 'claude' | 'offline' }
  | { type: 'error'; message: string };

const TOP_K = 6;

const SYSTEM_PROMPT = `You are SportsOS Assistant, the analytics and help desk for the sports ERP of IIT (ISM) Dhanbad.
You answer questions from students, coaches, staff and administrators about facilities, bookings, attendance, equipment, clubs, tournaments and operational statistics.

Ground every factual statement in the <context> documents supplied with the question; they are generated from the live ERP database. If the context does not contain the answer, say so plainly and suggest where in SportsOS the person can look (e.g. the Facilities page, Analytics, Inventory). Never invent numbers, names, bookings or schedules.

Keep answers short and practical: lead with the direct answer, then at most a few bullet points. Use IST times. When a question is about the future, cite the forecast and its uncertainty rather than stating a single number as fact.`;

const REPORT_PROMPT = `You are preparing an executive operations report for the Sports Officer, the General Secretary and the Dean (Students' Welfare) of IIT (ISM) Dhanbad from SportsOS data.

Write GitHub-flavoured Markdown with these sections: "## Summary" (3-4 sentences), "## Participation", "## Facilities", "## Equipment", "## Attendance integrity", "## Events", "## Recommended actions" (3-6 numbered, specific, data-backed actions).
Use only the numbers in the data block; quote them precisely, call out week-on-week changes and anomalies, and keep the whole report under 600 words. Use a table where it helps (e.g. facility utilisation). Do not add a title line; the page provides it.`;

@Injectable()
export class AiService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AiService.name);
  private readonly store: VectorStore;
  private readonly local = new LocalBm25Store();
  private readonly claude: Anthropic | null;
  private readonly model: string;
  private indexing: Promise<number> | null = null;

  constructor(
    config: ConfigService,
    private readonly knowledge: KnowledgeService,
    private readonly analytics: AnalyticsService,
    private readonly prisma: PrismaService,
  ) {
    const pineconeKey = config.get<string>('PINECONE_API_KEY');
    this.store = pineconeKey
      ? new PineconeStore(pineconeKey, config.get('PINECONE_INDEX', 'sportsos-knowledge'), config.get('PINECONE_NAMESPACE', 'iitism'))
      : this.local;
    const apiKey = config.get<string>('ANTHROPIC_API_KEY') || null;
    const authToken = config.get<string>('ANTHROPIC_AUTH_TOKEN') || null;
    this.claude = apiKey || authToken ? new Anthropic({ apiKey, authToken }) : null;
    this.model = config.get('CLAUDE_MODEL', 'claude-opus-5-5');
  }

  onApplicationBootstrap() {
    // build the index in the background; the API is usable before it finishes
    void this.reindex().catch((e) => this.logger.warn(`Initial knowledge index failed: ${(e as Error).message}`));
  }

  @Cron(CronExpression.EVERY_30_MINUTES)
  async scheduledReindex() {
    await this.reindex().catch((e) => this.logger.warn(`Scheduled reindex failed: ${(e as Error).message}`));
  }

  status(): AiStatus {
    return {
      llm: this.claude ? 'claude' : 'offline',
      model: this.claude ? this.model : null,
      vectorStore: this.store.name,
      indexedDocuments: this.store.count(),
    };
  }

  /** Rebuilds the retrieval corpus from live data. Concurrent calls share one run. */
  reindex(): Promise<number> {
    this.indexing ??= (async () => {
      try {
        const docs = await this.knowledge.build();
        await this.local.replaceAll(docs); // always kept warm as the fallback
        if (this.store !== this.local) await this.store.replaceAll(docs);
        this.logger.log(`Indexed ${docs.length} knowledge documents into ${this.store.name}`);
        return docs.length;
      } finally {
        this.indexing = null;
      }
    })();
    return this.indexing;
  }

  async ask(req: AiAskRequest): Promise<AiAnswer> {
    let answer = '';
    let sources: AiSource[] = [];
    let generatedBy: 'claude' | 'offline' = 'offline';
    for await (const ev of this.askStream(req)) {
      if (ev.type === 'sources') sources = ev.sources;
      else if (ev.type === 'delta') answer += ev.text;
      else if (ev.type === 'done') generatedBy = ev.generatedBy;
      else if (ev.type === 'error') answer ||= ev.message;
    }
    return { answer, sources, generatedBy };
  }

  async *askStream(req: AiAskRequest, signal?: AbortSignal): AsyncGenerator<AskEvent> {
    const hits = await this.retrieve(req.question);
    yield { type: 'sources', sources: hits.map((h) => ({ id: h.id, title: h.title, score: Math.round(h.score * 1000) / 1000 })) };

    if (!this.claude) {
      yield { type: 'delta', text: offlineAnswer(hits) };
      yield { type: 'done', generatedBy: 'offline' };
      return;
    }

    const context = hits.map((h) => `<document title="${h.title}">\n${h.text}\n</document>`).join('\n');
    const messages: Anthropic.Beta.BetaMessageParam[] = [
      ...sanitizeHistory(req.history),
      { role: 'user', content: `<context>\n${context}\n</context>\n\nQuestion (asked ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST): ${req.question}` },
    ];
    try {
      const stream = this.claude.beta.messages.stream(
        {
          model: this.model,
          max_tokens: 64000,
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
          output_config: { effort: 'medium' },
          system: SYSTEM_PROMPT,
          messages,
        },
        { signal },
      );
      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          yield { type: 'delta', text: event.delta.text };
        }
      }
      const final = await stream.finalMessage();
      if (final.stop_reason === 'refusal') {
        yield { type: 'delta', text: '\n\nI can’t help with that request. Try rephrasing it as a question about SportsOS data.' };
      }
      yield { type: 'done', generatedBy: 'claude' };
    } catch (e) {
      if (signal?.aborted) return;
      this.logger.error(`Claude request failed: ${describeError(e)}`);
      yield { type: 'error', message: 'The AI service is unavailable right now. Here is what SportsOS found:' };
      yield { type: 'delta', text: offlineAnswer(hits) };
      yield { type: 'done', generatedBy: 'offline' };
    }
  }

  /** Executive report from live analytics; written by Claude, or templated offline. */
  async report(period: 'week' | 'month'): Promise<AiReport> {
    const data = await this.reportData(period);
    const generatedAt = new Date().toISOString();
    if (this.claude) {
      try {
        const stream = this.claude.beta.messages.stream({
          model: this.model,
          max_tokens: 64000,
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
          output_config: { effort: 'high' },
          system: REPORT_PROMPT,
          messages: [{ role: 'user', content: `Reporting period: last ${period === 'week' ? '7' : '30'} days, generated ${generatedAt}.\n\n<data>\n${JSON.stringify(data, null, 1)}\n</data>` }],
        });
        const final = await stream.finalMessage();
        if (final.stop_reason !== 'refusal') {
          const markdown = final.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('').trim();
          if (markdown) return { period, markdown, generatedBy: 'claude', generatedAt };
        }
      } catch (e) {
        this.logger.error(`Claude report failed, using template: ${describeError(e)}`);
      }
    }
    return { period, markdown: templateReport(period, data), generatedBy: 'offline', generatedAt };
  }

  private async retrieve(question: string): Promise<SearchHit[]> {
    if (this.store.count() === 0 && this.local.count() === 0) await this.reindex();
    try {
      return await this.store.search(question, TOP_K);
    } catch (e) {
      this.logger.warn(`${this.store.name} search failed, using local index: ${(e as Error).message}`);
      return this.local.search(question, TOP_K);
    }
  }

  private async reportData(period: 'week' | 'month') {
    const days = period === 'week' ? 7 : 30;
    const [overview, participation, utilization, forecast, equipment, integrity, complaints, tournaments] = await Promise.all([
      this.analytics.overview(),
      this.analytics.participation(period === 'week' ? 4 : 8),
      this.analytics.utilization(days),
      this.analytics.forecast(undefined, 7, 56),
      this.analytics.equipment(),
      this.analytics.integrity(days),
      this.prisma.complaint.groupBy({ by: ['category', 'status'], _count: true, where: { createdAt: { gte: new Date(Date.now() - days * 86_400_000) } } }),
      this.prisma.tournament.findMany({ where: { OR: [{ status: 'ONGOING' }, { startDate: { gte: new Date(Date.now() - days * 86_400_000) } }] }, select: { name: true, sport: true, status: true, format: true } }),
    ]);
    return {
      overview,
      participation,
      facilityUtilization: utilization.facilities,
      forecastNext7Days: { model: forecast.model, days: forecast.points.filter((p) => p.actual === null) },
      equipmentRisk: equipment.slice(0, 8),
      integrity,
      complaints: complaints.map((c) => ({ category: c.category, status: c.status, count: c._count })),
      tournaments,
    };
  }
}

function sanitizeHistory(history: AiAskRequest['history']): Anthropic.Beta.BetaMessageParam[] {
  const turns = (history ?? []).filter((t) => t.content?.trim()).slice(-10);
  while (turns.length && turns[0].role !== 'user') turns.shift();
  return turns.map((t) => ({ role: t.role, content: t.content.slice(0, 4000) }));
}

function describeError(e: unknown) {
  if (e instanceof Anthropic.AuthenticationError) return 'invalid Anthropic credentials';
  if (e instanceof Anthropic.RateLimitError) return 'rate limited';
  if (e instanceof Anthropic.APIError) return `API error ${e.status}: ${e.message}`;
  return (e as Error)?.message ?? String(e);
}

function offlineAnswer(hits: SearchHit[]) {
  if (!hits.length) return 'I could not find anything in SportsOS about that. Try asking about a facility, equipment, a club, a tournament or participation trends.';
  return hits
    .slice(0, 3)
    .map((h) => `**${h.title}** — ${h.text.length > 600 ? `${h.text.slice(0, 600)}…` : h.text}`)
    .join('\n\n');
}

function templateReport(period: 'week' | 'month', d: Awaited<ReturnType<AiService['reportData']>>) {
  const o = d.overview;
  const last = d.participation.at(-1);
  const prev = d.participation.at(-2);
  const top = [...d.facilityUtilization].sort((a, b) => b.utilizationPct - a.utilizationPct);
  const rejected = Object.values(d.integrity.rejected).reduce((a, b) => a + b, 0);
  const forecastTotal = d.forecastNext7Days.days.reduce((a, p) => a + (p.forecast ?? 0), 0);
  const risky = d.equipmentRisk.filter((e) => e.daysToStockout !== null && e.daysToStockout < 60);
  const lines = [
    '## Summary',
    `Over the last ${period === 'week' ? '7' : '30'} days SportsOS recorded ${o.attendanceThisWeek} verified check-ins this week${o.attendanceChangePct === null ? '' : ` (${o.attendanceChangePct >= 0 ? '+' : ''}${o.attendanceChangePct}% week on week)`}, ${o.bookingsToday} bookings today and ${o.pendingApprovals} pending approvals. ${o.lowStockItems} equipment items are at or below reorder level and ${o.overdueIssues} loans are overdue.`,
    '',
    '## Participation',
    last ? `Latest week (from ${last.weekStart}): ${last.checkIns} check-ins by ${last.uniqueParticipants} students and ${last.bookings} bookings${prev ? `, against ${prev.checkIns} check-ins the week before` : ''}.` : 'No participation recorded yet.',
    '',
    '## Facilities',
    '| Facility | Utilisation | Booked h | Bookable h |',
    '|---|---|---|---|',
    ...top.map((f) => `| ${f.name} | ${f.utilizationPct}% | ${f.bookedHours} | ${f.availableHours} |`),
    '',
    `Forecast demand for the next 7 days: about ${Math.round(forecastTotal)} booked hours in total (Holt-Winters, MAPE ${d.forecastNext7Days.model.mape ?? 'n/a'}%).`,
    '',
    '## Equipment',
    risky.length ? risky.map((e) => `- ${e.name}: ${e.damageRatePct}% damaged/lost, about ${e.daysToStockout} days to stock-out.`).join('\n') : '- No item is on course to run out within 60 days.',
    '',
    '## Attendance integrity',
    `${d.integrity.accepted} check-ins accepted, ${rejected} rejected (${Object.entries(d.integrity.rejected).filter(([, v]) => v).map(([k, v]) => `${k.toLowerCase().replace(/_/g, ' ')}: ${v}`).join(', ') || 'none'}).`,
    '',
    '## Events',
    d.tournaments.length ? d.tournaments.map((t) => `- ${t.name} (${t.sport}) — ${t.status.toLowerCase()}`).join('\n') : '- No tournaments in this period.',
    '',
    '## Recommended actions',
    [
      o.lowStockItems ? `- Reorder the ${o.lowStockItems} low-stock equipment items.` : null,
      o.overdueIssues ? `- Follow up on ${o.overdueIssues} overdue equipment loans.` : null,
      top[0] && top[0].utilizationPct > 70 ? `- ${top[0].name} is ${top[0].utilizationPct}% utilised; consider extending its hours.` : null,
      d.integrity.rejected.DEVICE_REUSED ? `- Review ${d.integrity.rejected.DEVICE_REUSED} device-reuse alerts for possible proxy attendance.` : null,
    ]
      .filter(Boolean)
      .join('\n') || '- No urgent actions.',
    '',
    '_Generated offline from SportsOS data (configure ANTHROPIC_API_KEY for AI-written reports)._',
  ];
  return lines.join('\n');
}
