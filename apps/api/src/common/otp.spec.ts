import { currentOtp, hotp, verifyOtp } from './otp';

// RFC 4226 Appendix D test vectors (secret "12345678901234567890").
const RFC_SECRET = Buffer.from('12345678901234567890').toString('hex');
const RFC_CODES = ['755224', '287082', '359152', '969429', '338314', '254676', '287922', '162583', '399871', '520489'];

describe('otp', () => {
  it('matches the RFC 4226 HOTP test vectors', () => {
    RFC_CODES.forEach((code, counter) => expect(hotp(RFC_SECRET, counter)).toBe(code));
  });

  it('accepts the current and previous step only', () => {
    const now = 1_800_000_000_000;
    const { code } = currentOtp(RFC_SECRET, 30, now);
    expect(verifyOtp(RFC_SECRET, 30, code, now)).toBe(true);
    expect(verifyOtp(RFC_SECRET, 30, code, now + 30_000)).toBe(true);
    expect(verifyOtp(RFC_SECRET, 30, code, now + 60_000)).toBe(false);
  });

  it('rejects malformed codes', () => {
    expect(verifyOtp(RFC_SECRET, 30, '12345')).toBe(false);
    expect(verifyOtp(RFC_SECRET, 30, 'abcdef')).toBe(false);
  });

  it('reports seconds left in the window', () => {
    expect(currentOtp(RFC_SECRET, 30, 1_800_000_010_000).expiresInSec).toBe(20);
  });
});
