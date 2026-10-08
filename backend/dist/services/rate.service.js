"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.reserveRate = reserveRate;
exports.getRateCount = getRateCount;
const redis_1 = require("../config/redis");
const env_1 = require("../config/env");
const logger_1 = require("../utils/logger");
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
async function reserveRate(senderId, limit) {
    const now = new Date();
    // Key is per-sender, per-hour bucket: "email-rate:<id>:2024-05-01T14"
    const hourKey = now.toISOString().slice(0, 13); // e.g. "2024-05-01T14"
    const key = `email-rate:${senderId}:${hourKey}`;
    const effectiveLimit = Math.min(env_1.env.hourlyLimit, limit && limit > 0 ? limit : env_1.env.hourlyLimit);
    // INCR is atomic; first caller sets value to 1 and we set TTL right after
    const count = await redis_1.redis.incr(key);
    if (count === 1) {
        // Expire a bit after the next hour boundary (3700 s) to absorb clock skew
        await redis_1.redis.expire(key, 3700);
    }
    if (count <= effectiveLimit) {
        logger_1.logger.debug('rate.allowed', { senderId, count, limit: effectiveLimit });
        return { allowed: true, count };
    }
    // Over limit – roll back so we don't permanently consume the slot
    await redis_1.redis.decr(key);
    // Calculate the start of the next hour
    const next = new Date(now);
    next.setMinutes(60, 0, 0);
    logger_1.logger.warn('rate.limit_reached', {
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
async function getRateCount(senderId) {
    const hourKey = new Date().toISOString().slice(0, 13);
    const key = `email-rate:${senderId}:${hourKey}`;
    const val = await redis_1.redis.get(key);
    return val ? parseInt(val, 10) : 0;
}
