import * as SecureStore from 'expo-secure-store';
import type { ApiErrorBody } from './types';

export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000/api').replace(/\/+$/, '');

const TOKEN_KEY = 'sportsos.accessToken';

/** Thrown for any non-2xx response, or with status 0 when the server is unreachable. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body?: ApiErrorBody,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

let cachedToken: string | null | undefined;
let unauthorizedHandler: (() => void) | null = null;

export async function getToken(): Promise<string | null> {
  if (cachedToken === undefined) {
    cachedToken = await SecureStore.getItemAsync(TOKEN_KEY);
  }
  return cachedToken;
}

export async function setToken(token: string | null): Promise<void> {
  cachedToken = token;
  if (token) await SecureStore.setItemAsync(TOKEN_KEY, token);
  else await SecureStore.deleteItemAsync(TOKEN_KEY);
}

/** Called when an authenticated request comes back 401 (expired or revoked token). */
export function onUnauthorized(handler: (() => void) | null) {
  unauthorizedHandler = handler;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Set false for login/register. */
  auth?: boolean;
}

export async function api<T>(path: string, { method = 'GET', body, auth = true }: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth) {
    const token = await getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, `Can't reach the SportsOS server at ${API_URL}. Check your connection and EXPO_PUBLIC_API_URL.`);
  }

  const text = await res.text();
  let data: unknown = undefined;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!res.ok) {
    const errBody = (typeof data === 'object' && data !== null ? data : undefined) as ApiErrorBody | undefined;
    const raw = errBody?.message ?? (typeof data === 'string' && data ? data : res.statusText);
    const message = Array.isArray(raw) ? raw.join('\n') : String(raw || `Request failed (${res.status})`);
    if (res.status === 401 && auth) unauthorizedHandler?.();
    throw new ApiError(res.status, message, errBody);
  }

  return data as T;
}

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return 'Something went wrong.';
}
