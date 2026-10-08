import { redis } from '../config/redis';
import { env } from '../config/env';
import { logger } from '../utils/logger';

export interface RateResult {
  allowed: boolean;
  /** ISO timestamp of when the rate window resets (only set when !allowed) */
  next?: Date;
  /** Current count in the window */
  count?: number;
}

/**
 * Atomically reserve one email send slot for `senderId` in the current hour.
 *
 * Uses a single Redis INCR + EXPIRE round-trip to avoid races across multiple
 * workers. The key expires slightly after the window boundary so stragglers do
 * not leak into the next window.
 *
 * @param senderId  - Unique sender identifier (UUID from DB)
 * @param limit     - Override the server-default hourly limit for this batch
 */
export async function reserveRate(
  senderId: string,
  limit?: number,
): Promise<RateResult> {
  const now = new Date();
  // Key is per-sender, per-hour bucket: "email-rate:<id>:2024-05-01T14"
  const hourKey = now.toISOString().slice(0, 13); // e.g. "2024-05-01T14"
  const key = `email-rate:${senderId}:${hourKey}`;

  const effectiveLimit = Math.min(
    env.hourlyLimit,
    limit && limit > 0 ? limit : env.hourlyLimit,
  );

  // INCR is atomic; first caller sets value to 1 and we set TTL right after
  const count = await redis.incr(key);
  if (count === 1) {
    // Expire a bit after the next hour boundary (3700 s) to absorb clock skew
    await redis.expire(key, 3700);
  }

  if (count <= effectiveLimit) {
    logger.debug('rate.allowed', { senderId, count, limit: effectiveLimit });
    return { allowed: true, count };
  }

  // Over limit – roll back so we don't permanently consume the slot
  await redis.decr(key);

  // Calculate the start of the next hour
  const next = new Date(now);
  next.setMinutes(60, 0, 0);

  logger.warn('rate.limit_reached', {
    senderId,
    count: count - 1,
    limit: effectiveLimit,
    nextWindowAt: next.toISOString(),
  });

  return { allowed: false, next, count: count - 1 };
}

/**
 * Read-only: returns the current usage count for a sender in the current hour.
 * Does NOT increment the counter.
 */
export async function getRateCount(senderId: string): Promise<number> {
  const hourKey = new Date().toISOString().slice(0, 13);
  const key = `email-rate:${senderId}:${hourKey}`;
  const val = await redis.get(key);
  return val ? parseInt(val, 10) : 0;
}
