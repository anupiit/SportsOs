import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

/**
 * Rotating session OTPs for verified attendance.
 *
 * HOTP (RFC 4226) over a time-step counter, i.e. TOTP (RFC 6238): the coach's
 * screen shows the code for the current step; a check-in is accepted for the
 * current step or the one before it, so a code read at the very end of its
 * window still works while it is being typed.
 */

export const OTP_DIGITS = 6;

export function newOtpSecret(): string {
  return randomBytes(20).toString('hex');
}

export function hotp(secretHex: string, counter: number, digits = OTP_DIGITS): string {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const mac = createHmac('sha1', Buffer.from(secretHex, 'hex')).update(buf).digest();
  const offset = mac[mac.length - 1] & 0x0f;
  const binary =
    ((mac[offset] & 0x7f) << 24) |
    ((mac[offset + 1] & 0xff) << 16) |
    ((mac[offset + 2] & 0xff) << 8) |
    (mac[offset + 3] & 0xff);
  return (binary % 10 ** digits).toString().padStart(digits, '0');
}

export function timeStep(nowMs: number, stepSeconds: number): number {
  return Math.floor(nowMs / 1000 / stepSeconds);
}

export function currentOtp(secretHex: string, stepSeconds: number, nowMs = Date.now()) {
  const step = timeStep(nowMs, stepSeconds);
  const expiresInSec = stepSeconds - (Math.floor(nowMs / 1000) % stepSeconds);
  return { code: hotp(secretHex, step), step, expiresInSec };
}

/** Accepts the current step and `lookBack` previous steps. Constant-time comparison. */
export function verifyOtp(
  secretHex: string,
  stepSeconds: number,
  candidate: string,
  nowMs = Date.now(),
  lookBack = 1,
): boolean {
  if (!/^\d{6}$/.test(candidate)) return false;
  const step = timeStep(nowMs, stepSeconds);
  let ok = false;
  for (let i = 0; i <= lookBack; i++) {
    const expected = Buffer.from(hotp(secretHex, step - i));
    // no early exit: every window is compared regardless of earlier matches
    ok = timingSafeEqual(expected, Buffer.from(candidate)) || ok;
  }
  return ok;
}
