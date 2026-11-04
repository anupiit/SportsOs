import { ConfigService } from '@nestjs/config';
import type { AnalyticsService } from '../analytics/analytics.service';
import type { PrismaService } from '../prisma/prisma.service';
import { AiService, AskEvent } from './ai.service';
import { mayRead } from './vector-store';

const STAFF = { id: 'u-staff', permissions: ['facility.view', 'inventory.view', 'analytics.view'] };
const STUDENT = { id: 'u-student', permissions: ['facility.view', 'inventory.view', 'ai.use'] };
import type { KnowledgeService } from './knowledge.service';

const DOCS = [
  { id: 'attendance-integrity', kind: 'analytics', title: 'Attendance integrity (last 30 days)', text: 'Rejected tennis check-ins: device reused 4, out of geofence 14.' },
  { id: 'facility-TN-1', kind: 'facility', title: 'Lawn Tennis Courts (TN-1)', text: 'Current status: MAINTENANCE — court 2 resurfacing.' },
  { id: 'equipment-badminton', kind: 'equipment', title: 'Badminton equipment stock', text: 'Shuttlecock tube: 3 available — LOW STOCK.' },
];

function service(env: Record<string, string>) {
  const config = new ConfigService(env);
  const knowledge = { build: jest.fn().mockResolvedValue(DOCS) } as unknown as KnowledgeService;
  return new AiService(config, knowledge, {} as AnalyticsService, {} as PrismaService);
}

/** Minimal stand-in for the SDK's BetaMessageStream. */
function fakeStream(texts: string[], stopReason = 'end_turn') {
  return {
    async *[Symbol.asyncIterator]() {
      for (const text of texts) yield { type: 'content_block_delta', delta: { type: 'text_delta', text } };
    },
    finalMessage: async () => ({ stop_reason: stopReason, content: [{ type: 'text', text: texts.join('') }] }),
  };
}

async function collect(gen: AsyncGenerator<AskEvent>) {
  const out: AskEvent[] = [];
  for await (const ev of gen) out.push(ev);
  return out;
}

describe('AiService', () => {
  it('answers offline from retrieved documents when no Anthropic key is set', async () => {
    const ai = service({});
    await ai.reindex();
    expect(ai.status()).toMatchObject({ llm: 'offline', vectorStore: 'local', indexedDocuments: 3 });
    const events = await collect(ai.askStream({ question: 'Is the tennis court open?' }, STAFF));
    expect(events[0]).toMatchObject({ type: 'sources' });
    expect((events[0] as { sources: { title: string }[] }).sources[0].title).toContain('Tennis');
    expect(events.at(-1)).toEqual({ type: 'done', generatedBy: 'offline' });
  });

  it('streams a grounded Claude answer with server-side fallback enabled', async () => {
    const ai = service({ ANTHROPIC_API_KEY: 'test-key' });
    await ai.reindex();
    const stream = jest.fn().mockReturnValue(fakeStream(['Court 2 is ', 'being resurfaced.']));
    (ai as unknown as { claude: unknown }).claude = { beta: { messages: { stream } } };

    const events = await collect(ai.askStream({ question: 'Is the tennis court open?', history: [{ role: 'assistant', content: 'dangling' }] }, STAFF));
    const params = stream.mock.calls[0][0];
    expect(params).toMatchObject({ model: 'claude-opus-5-5', fallbacks: 'default', betas: ['server-side-fallback-2026-07-01'], output_config: { effort: 'medium' } });
    expect(params.thinking).toBeUndefined();
    expect(params.messages).toHaveLength(1); // history must start with a user turn
    expect(params.messages[0].content).toContain('<document title="Lawn Tennis Courts (TN-1)">');
    expect(events.filter((e) => e.type === 'delta').map((e) => (e as { text: string }).text).join('')).toBe('Court 2 is being resurfaced.');
    expect(events.at(-1)).toEqual({ type: 'done', generatedBy: 'claude' });
  });

  it('tells the user when Claude declines', async () => {
    const ai = service({ ANTHROPIC_API_KEY: 'test-key' });
    await ai.reindex();
    (ai as unknown as { claude: unknown }).claude = { beta: { messages: { stream: () => fakeStream([], 'refusal') } } };
    const events = await collect(ai.askStream({ question: 'anything' }, STAFF));
    expect(events.some((e) => e.type === 'delta' && /can’t help/.test(e.text))).toBe(true);
  });

  it('falls back to retrieved facts if the API call fails', async () => {
    const ai = service({ ANTHROPIC_API_KEY: 'test-key' });
    await ai.reindex();
    // a stream that fails before yielding anything
    // eslint-disable-next-line require-yield
    const failing = { async *[Symbol.asyncIterator]() { throw new Error('network down'); }, finalMessage: async () => ({}) };
    (ai as unknown as { claude: unknown }).claude = { beta: { messages: { stream: () => failing } } };
    const events = await collect(ai.askStream({ question: 'shuttlecock stock' }, STAFF));
    expect(events.map((e) => e.type)).toEqual(['sources', 'error', 'delta', 'done']);
    expect(events.at(-1)).toEqual({ type: 'done', generatedBy: 'offline' });
  });

  describe('permission isolation', () => {
    it('never retrieves documents the asker cannot read through the API', async () => {
      const ai = service({});
      await ai.reindex();
      const events = await collect(ai.askStream({ question: 'tennis rejected check-ins device reused geofence integrity' }, STUDENT));
      const ids = (events[0] as { sources: { id: string }[] }).sources.map((s) => s.id);
      expect(ids).not.toContain('attendance-integrity');
      const text = events.filter((e) => e.type === 'delta').map((e) => (e as { text: string }).text).join('');
      expect(text).not.toMatch(/device reused/i);
    });

    it('withheld context never reaches Claude', async () => {
      const ai = service({ ANTHROPIC_API_KEY: 'test-key' });
      await ai.reindex();
      const stream = jest.fn().mockReturnValue(fakeStream(['ok']));
      (ai as unknown as { claude: unknown }).claude = { beta: { messages: { stream } } };
      await collect(ai.askStream({ question: 'attendance integrity device reused' }, STUDENT));
      const sent = JSON.stringify(stream.mock.calls[0][0].messages);
      expect(sent).not.toContain('device reused 4');
    });

    it('staff with analytics.view do receive analytics documents', async () => {
      const ai = service({});
      await ai.reindex();
      const events = await collect(ai.askStream({ question: 'attendance integrity device reused' }, STAFF));
      expect((events[0] as { sources: { id: string }[] }).sources.map((s) => s.id)).toContain('attendance-integrity');
    });

    it('denies unknown document ids by default', () => {
      expect(mayRead(['ai.use'], 'some-new-analytics-doc')).toBe(false);
      expect(mayRead(['ai.use'], 'policies')).toBe(true);
    });
  });
});
