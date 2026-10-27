import { QR_PREFIX } from './types';

/**
 * Routes a scanned QR by its sportsos:// prefix (see QR_PREFIX in types.ts):
 *   sportsos://equipment/<qrCode>         equipment label
 *   sportsos://pass/<token>               booking gate pass
 *   sportsos://checkin?session=<id>       attendance session
 * The same URIs are app deep links, so the routes mirror them.
 */
export type QrPayload =
  | { kind: 'equipment'; code: string }
  | { kind: 'pass'; token: string }
  | { kind: 'session'; sessionId: string }
  | { kind: 'unknown'; raw: string };

function after(raw: string, prefix: string): string | null {
  if (!raw.toLowerCase().startsWith(prefix)) return null;
  const value = decodeURIComponent(raw.slice(prefix.length).split(/[?#&/]/, 1)[0] ?? '');
  return value || null;
}

export function parseQr(input: string): QrPayload {
  const raw = input.trim();

  const code = after(raw, QR_PREFIX.equipment);
  if (code) return { kind: 'equipment', code };

  const token = after(raw, QR_PREFIX.pass);
  if (token) return { kind: 'pass', token };

  const sessionId = after(raw, QR_PREFIX.checkin);
  if (sessionId) return { kind: 'session', sessionId };

  return { kind: 'unknown', raw };
}
