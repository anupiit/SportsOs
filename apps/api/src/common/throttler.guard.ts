import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Rate-limit buckets keyed by account rather than IP: a campus behind NAT
 * shares a handful of public addresses, so per-IP limits would throttle
 * everyone at once. Signed-in traffic is keyed by user id (this guard runs
 * after authentication); login/register attempts by IP + email.
 */
@Injectable()
export class AccountThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    if (req.user?.id) return `user:${req.user.id}`;
    const email = typeof req.body?.email === 'string' ? req.body.email.toLowerCase() : '';
    return `anon:${req.ip}:${email}`;
  }
}
