import type { AiAskRequest, AiSource, ApiErrorBody } from '@sportsos/shared';

export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api').replace(/\/+$/, '');

export const TOKEN_KEY = 'sportsos.token';

export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (token) window.localStorage.setItem(TOKEN_KEY, token);
    else window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable (private mode) — the session simply won't persist */
  }
}

export type QueryValue = string | number | boolean | null | undefined;
export type Query = Record<string, QueryValue>;

export function buildQuery(query?: Query): string {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export interface FetchOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  query?: Query;
  signal?: AbortSignal;
}

function messageFrom(body: unknown, fallback: string): string {
  if (body && typeof body === 'object' && 'message' in body) {
    const msg = (body as ApiErrorBody).message;
    if (Array.isArray(msg)) return msg.join('; ');
    if (typeof msg === 'string' && msg) return msg;
  }
  return fallback;
}

function handleUnauthorized(path: string) {
  if (path.startsWith('/auth/login') || path.startsWith('/auth/register')) return;
  setToken(null);
  if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
    const next = encodeURIComponent(window.location.pathname);
    window.location.href = `/login?next=${next}`;
  }
}

export async function apiFetch<T>(path: string, opts: FetchOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}${buildQuery(opts.query)}`, {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: opts.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new ApiError(0, `Cannot reach the SportsOS API at ${API_URL}. Is the server running?`);
  }

  const text = await res.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  if (!res.ok) {
    if (res.status === 401) handleUnauthorized(path);
    throw new ApiError(res.status, messageFrom(body, `${res.status} ${res.statusText}`), body);
  }
  return body as T;
}

export const api = {
  get: <T>(path: string, query?: Query) => apiFetch<T>(path, { query }),
  post: <T>(path: string, body?: unknown) => apiFetch<T>(path, { method: 'POST', body: body ?? {} }),
  patch: <T>(path: string, body?: unknown) => apiFetch<T>(path, { method: 'PATCH', body: body ?? {} }),
  del: <T>(path: string) => apiFetch<T>(path, { method: 'DELETE' }),
};

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return 'Something went wrong';
}

// ---------------------------------------------------------------- SSE (AI streaming)

export type AskStreamEvent =
  | { type: 'sources'; sources: AiSource[] }
  | { type: 'delta'; text: string }
  | { type: 'done'; generatedBy: 'claude' | 'offline' }
  | { type: 'error'; message: string };

/**
 * POST /ai/ask/stream and invoke `onEvent` for every `data:` JSON line.
 * Resolves when the stream ends; rejects on HTTP or network errors.
 */
export async function streamAsk(
  request: AiAskRequest,
  onEvent: (event: AskStreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const token = getToken();
  const res = await fetch(`${API_URL}/ai/ask/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(request),
    signal,
  });

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => '');
    let body: unknown = text;
    try {
      body = JSON.parse(text);
    } catch {
      /* not JSON */
    }
    if (res.status === 401) handleUnauthorized('/ai/ask/stream');
    throw new ApiError(res.status, messageFrom(body, `Stream failed (${res.status})`), body);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const flushLine = (line: string) => {
    const trimmed = line.replace(/\r$/, '');
    if (!trimmed.startsWith('data:')) return;
    const payload = trimmed.slice(5).trim();
    if (!payload || payload === '[DONE]') return;
    try {
      onEvent(JSON.parse(payload) as AskStreamEvent);
    } catch {
      /* ignore malformed frame */
    }
  };

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 1);
      flushLine(line);
    }
  }
  buffer += decoder.decode();
  if (buffer) flushLine(buffer);
}
