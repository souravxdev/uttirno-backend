import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

export interface RateLimitOptions {
  limit: number;
  windowSec: number;
}

export const RATE_LIMIT_KEY = 'rate-limit';

/** Fixed-window limit per client IP + route. */
export const RateLimit = (limit: number, windowSec: number) =>
  SetMetadata(RATE_LIMIT_KEY, { limit, windowSec } satisfies RateLimitOptions);

/**
 * Minimal in-memory fixed-window rate limiter — deliberately dependency-free
 * for the POC (single instance). At deploy scale swap for @nestjs/throttler
 * or a Redis-backed limiter; the @RateLimit() call sites stay the same.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly hits = new Map<string, { count: number; resetAt: number }>();

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const options = this.reflector.getAllAndOverride<
      RateLimitOptions | undefined
    >(RATE_LIMIT_KEY, [context.getHandler(), context.getClass()]);
    if (!options) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<{ ip?: string; route?: { path?: string }; url: string }>();
    const key = `${request.ip ?? 'unknown'}:${request.route?.path ?? request.url}`;
    const now = Date.now();

    const entry = this.hits.get(key);
    if (!entry || entry.resetAt <= now) {
      this.hits.set(key, {
        count: 1,
        resetAt: now + options.windowSec * 1000,
      });
      this.evictExpired(now);
      return true;
    }

    entry.count += 1;
    if (entry.count > options.limit) {
      throw new HttpException(
        'Too many requests — try again later',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }

  private evictExpired(now: number): void {
    if (this.hits.size <= 10_000) {
      return;
    }
    for (const [key, entry] of this.hits) {
      if (entry.resetAt <= now) {
        this.hits.delete(key);
      }
    }
  }
}
