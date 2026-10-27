'use client';

import type { AiAskRequest, AiReport, AiSource, AiStatus } from '@sportsos/shared';
import clsx from 'clsx';
import {
  Bot,
  Copy,
  Database,
  Download,
  FileText,
  Mic,
  MicOff,
  Printer,
  RefreshCw,
  Send,
  Sparkles,
  Square,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useAuth } from '@/components/auth';
import { Markdown, markdownToPlain } from '@/components/markdown';
import { useToast } from '@/components/toast';
import { Badge, Button, Card, CardBody, CardHeader, EmptyState, PageHeader, Segmented, Skeleton, Spinner, Textarea } from '@/components/ui';
import { api, errorMessage, streamAsk } from '@/lib/api';
import { fmtDateTime } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import { getSpeechRecognition, speak, stopSpeaking, type SpeechRecognitionLike } from '@/lib/speech';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: AiSource[];
  generatedBy?: 'claude' | 'offline';
  pending?: boolean;
  error?: string;
}

const SUGGESTIONS = [
  'Which facilities are under maintenance right now?',
  'Which equipment is running low and when will it run out?',
  'Summarise attendance trends over the last month.',
  'When is the badminton hall least busy this week?',
  'How many proxy check-in attempts were blocked recently?',
  'What tournaments are live and who is leading?',
];

let nextId = 0;
const uid = () => `m${Date.now().toString(36)}${(nextId++).toString(36)}`;

function StatusCard() {
  const { can } = useAuth();
  const toast = useToast();
  const { data, isLoading, mutate } = useApi<AiStatus>('/ai/status');
  const [reindexing, setReindexing] = useState(false);

  async function reindex() {
    setReindexing(true);
    try {
      const res = await api.post<{ indexed: number }>('/ai/reindex');
      toast.success('Knowledge base refreshed', `${res.indexed} documents indexed`);
      await mutate();
    } catch (err) {
      toast.error(err);
    } finally {
      setReindexing(false);
    }
  }

  return (
    <Card>
      <CardHeader title="Engine status" icon={<Bot className="size-4" />} />
      <CardBody className="space-y-3 text-sm">
        {isLoading || !data ? (
          <Skeleton className="h-20" />
        ) : (
          <>
            <div className="flex items-center justify-between gap-2">
              <span className="text-text-2">Language model</span>
              {data.llm === 'claude' ? (
                <Badge tone="green" icon={<Sparkles className="size-3" />}>
                  Claude{data.model ? ` · ${data.model}` : ''}
                </Badge>
              ) : (
                <Badge tone="amber">Offline summariser</Badge>
              )}
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-text-2">Vector store (RAG)</span>
              <Badge tone={data.vectorStore === 'pinecone' ? 'blue' : 'neutral'} icon={<Database className="size-3" />}>
                {data.vectorStore === 'pinecone' ? 'Pinecone' : 'Local index'}
              </Badge>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-text-2">Indexed documents</span>
              <span className="font-semibold text-text tabular">{data.indexedDocuments}</span>
            </div>
            {data.llm === 'offline' && (
              <p className="text-xs text-muted">
                No Claude API key is configured on the server, so answers are assembled from retrieved records without an LLM.
              </p>
            )}
            {can('ai:report') && (
              <Button size="sm" icon={<RefreshCw className="size-3.5" />} loading={reindexing} onClick={reindex} className="w-full">
                Re-index live data
              </Button>
            )}
          </>
        )}
      </CardBody>
    </Card>
  );
}

function ReportPanel() {
  const toast = useToast();
  const [period, setPeriod] = useState<'week' | 'month'>('week');
  const [report, setReport] = useState<AiReport | null>(null);
  const [busy, setBusy] = useState(false);

  async function generate() {
    setBusy(true);
    try {
      const r = await api.post<AiReport>('/ai/report', { period });
      setReport(r);
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  }

  function download() {
    if (!report) return;
    const blob = new Blob([report.markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sportsos-${report.period}ly-report-${report.generatedAt.slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Card>
      <CardHeader title="Executive report" description="Automated briefing for the Sports Officer, Dean and Director" icon={<FileText className="size-4" />} />
      <CardBody className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Segmented<'week' | 'month'>
            ariaLabel="Report period"
            value={period}
            onChange={setPeriod}
            options={[
              { value: 'week', label: 'Weekly' },
              { value: 'month', label: 'Monthly' },
            ]}
          />
          <Button variant="primary" size="sm" loading={busy} onClick={generate} icon={<Sparkles className="size-3.5" />}>
            Generate
          </Button>
        </div>
        {busy && !report && <p className="text-xs text-muted">Compiling bookings, attendance, inventory and tournament data…</p>}
        {report && (
          <>
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted">
              <Badge tone={report.generatedBy === 'claude' ? 'green' : 'amber'}>{report.generatedBy === 'claude' ? 'Written by Claude' : 'Template report'}</Badge>
              <span>{fmtDateTime(report.generatedAt)}</span>
            </div>
            <div className="print-area max-h-[480px] overflow-y-auto rounded-lg border border-border bg-surface-2/40 p-4">
              <Markdown source={report.markdown} />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                icon={<Copy className="size-3.5" />}
                onClick={() => {
                  void navigator.clipboard?.writeText(report.markdown).then(
                    () => toast.success('Copied to clipboard'),
                    () => toast.error('Clipboard unavailable'),
                  );
                }}
              >
                Copy
              </Button>
              <Button size="sm" icon={<Download className="size-3.5" />} onClick={download}>
                Download .md
              </Button>
              <Button size="sm" icon={<Printer className="size-3.5" />} onClick={() => window.print()}>
                Print / PDF
              </Button>
            </div>
          </>
        )}
      </CardBody>
    </Card>
  );
}

export default function AssistantPage() {
  const { can } = useAuth();
  const toast = useToast();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [readAloud, setReadAloud] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<ChatMessage[]>([]);
  messagesRef.current = messages;

  useEffect(() => {
    setVoiceSupported(!!getSpeechRecognition());
    return () => {
      abortRef.current?.abort();
      recognitionRef.current?.abort();
      stopSpeaking();
    };
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const patch = (id: string, fn: (m: ChatMessage) => ChatMessage) => setMessages((list) => list.map((m) => (m.id === id ? fn(m) : m)));

  const ask = useCallback(
    async (question: string) => {
      const q = question.trim();
      if (!q || streaming) return;
      stopSpeaking();
      const history: AiAskRequest['history'] = messagesRef.current
        .filter((m) => !m.pending && !m.error && m.content)
        .slice(-10)
        .map((m) => ({ role: m.role, content: m.content }));
      const userMsg: ChatMessage = { id: uid(), role: 'user', content: q };
      const botId = uid();
      setMessages((list) => [...list, userMsg, { id: botId, role: 'assistant', content: '', pending: true }]);
      setInput('');
      setStreaming(true);
      const controller = new AbortController();
      abortRef.current = controller;
      let finalText = '';
      try {
        await streamAsk(
          { question: q, history },
          (ev) => {
            if (ev.type === 'sources') patch(botId, (m) => ({ ...m, sources: ev.sources }));
            else if (ev.type === 'delta') {
              finalText += ev.text;
              patch(botId, (m) => ({ ...m, content: m.content + ev.text }));
            } else if (ev.type === 'done') patch(botId, (m) => ({ ...m, pending: false, generatedBy: ev.generatedBy }));
            else if (ev.type === 'error') patch(botId, (m) => ({ ...m, pending: false, error: ev.message }));
          },
          controller.signal,
        );
        patch(botId, (m) => ({ ...m, pending: false }));
        if (readAloud && finalText) speak(markdownToPlain(finalText));
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          patch(botId, (m) => ({ ...m, pending: false, content: m.content || '_Stopped._' }));
        } else {
          patch(botId, (m) => ({ ...m, pending: false, error: errorMessage(err) }));
        }
      } finally {
        setStreaming(false);
        abortRef.current = null;
      }
    },
    [streaming, readAloud],
  );

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void ask(input);
  }

  function toggleVoice() {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const Ctor = getSpeechRecognition();
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = 'en-IN';
    rec.continuous = false;
    rec.interimResults = true;
    let finalTranscript = '';
    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalTranscript += r[0].transcript;
        else interim += r[0].transcript;
      }
      setInput((finalTranscript + interim).trim());
    };
    rec.onerror = (e) => {
      if (e.error !== 'aborted' && e.error !== 'no-speech') toast.error('Voice input failed', e.error === 'not-allowed' ? 'Microphone permission denied.' : e.error);
    };
    rec.onend = () => {
      setListening(false);
      recognitionRef.current = null;
      // Hands-free: send what was heard.
      if (finalTranscript.trim()) void ask(finalTranscript);
    };
    recognitionRef.current = rec;
    setListening(true);
    rec.start();
  }

  return (
    <div>
      <PageHeader
        eyebrow="AI analytics suite"
        title="SportsOS AI"
        description="Ask about facilities, attendance, equipment and tournaments in plain language — by typing or by voice. Answers are grounded in live SportsOS records (retrieval-augmented generation)."
      />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="flex min-h-[620px] flex-col xl:col-span-2">
          <div className="flex items-center justify-between gap-2 border-b border-border px-5 py-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-text">
              <Sparkles className="size-4 text-accent" /> Conversation
            </div>
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant="ghost"
                icon={readAloud ? <Volume2 className="size-3.5" /> : <VolumeX className="size-3.5" />}
                onClick={() => {
                  if (readAloud) stopSpeaking();
                  setReadAloud((v) => !v);
                }}
                aria-pressed={readAloud}
              >
                Read aloud {readAloud ? 'on' : 'off'}
              </Button>
              {messages.length > 0 && (
                <Button size="sm" variant="ghost" onClick={() => setMessages([])} disabled={streaming}>
                  Clear
                </Button>
              )}
            </div>
          </div>
          <div ref={scrollRef} className="flex-1 space-y-5 overflow-y-auto px-5 py-5" aria-live="polite">
            {!messages.length ? (
              <EmptyState
                icon={<Bot className="size-5" />}
                title="Ask anything about campus sport"
                description="Try one of these to get started."
                action={
                  <div className="flex max-w-xl flex-wrap justify-center gap-2">
                    {SUGGESTIONS.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => void ask(s)}
                        className="rounded-full border border-border bg-surface px-3 py-1.5 text-xs text-text-2 hover:border-accent hover:text-text"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                }
              />
            ) : (
              messages.map((m) =>
                m.role === 'user' ? (
                  <div key={m.id} className="flex justify-end">
                    <div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-sm text-primary-fg">{m.content}</div>
                  </div>
                ) : (
                  <div key={m.id} className="flex gap-3">
                    <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-ink">
                      <Sparkles className="size-3.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      {m.error ? (
                        <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-ink">{m.error}</p>
                      ) : m.content ? (
                        <Markdown source={m.content} />
                      ) : (
                        <div className="flex items-center gap-2 text-sm text-muted">
                          <Spinner className="size-4" /> Searching SportsOS records…
                        </div>
                      )}
                      {(m.sources?.length || m.generatedBy) && !m.pending ? (
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          {m.generatedBy && (
                            <Badge tone={m.generatedBy === 'claude' ? 'green' : 'amber'}>{m.generatedBy === 'claude' ? 'Claude' : 'Offline'}</Badge>
                          )}
                          {m.sources?.map((s) => (
                            <span
                              key={s.id}
                              title={`Retrieval score ${s.score.toFixed(2)}`}
                              className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-2 px-2 py-0.5 text-[11px] text-text-2"
                            >
                              <Database className="size-3" /> {s.title}
                            </span>
                          ))}
                          {m.content && (
                            <button
                              type="button"
                              onClick={() => speak(markdownToPlain(m.content))}
                              className="rounded p-1 text-muted hover:bg-surface-2 hover:text-text"
                              aria-label="Read this answer aloud"
                            >
                              <Volume2 className="size-3.5" />
                            </button>
                          )}
                        </div>
                      ) : null}
                    </div>
                  </div>
                ),
              )
            )}
          </div>
          <form onSubmit={onSubmit} className="border-t border-border p-3">
            <div className="flex items-end gap-2">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void ask(input);
                  }
                }}
                placeholder={listening ? 'Listening…' : 'Ask about bookings, attendance, equipment…'}
                className="min-h-[44px] flex-1 resize-none"
                rows={1}
                aria-label="Your question"
              />
              {voiceSupported && (
                <Button
                  variant={listening ? 'warn' : 'secondary'}
                  className={clsx('h-11', listening && 'animate-pulse')}
                  onClick={toggleVoice}
                  aria-pressed={listening}
                  aria-label={listening ? 'Stop voice input' : 'Speak your question'}
                  icon={listening ? <MicOff className="size-4" /> : <Mic className="size-4" />}
                />
              )}
              {streaming ? (
                <Button variant="secondary" className="h-11" onClick={() => abortRef.current?.abort()} icon={<Square className="size-4" />}>
                  Stop
                </Button>
              ) : (
                <Button type="submit" variant="primary" className="h-11" disabled={!input.trim()} icon={<Send className="size-4" />}>
                  Ask
                </Button>
              )}
            </div>
            {!voiceSupported && <p className="mt-1.5 text-[11px] text-muted">Voice input needs a browser with the Web Speech API (Chrome or Edge).</p>}
          </form>
        </Card>
        <div className="space-y-6">
          <StatusCard />
          {can('ai:report') && <ReportPanel />}
        </div>
      </div>
    </div>
  );
}
