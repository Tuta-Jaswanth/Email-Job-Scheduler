import IORedis from 'ioredis';
import { env } from './env';

function sanitizeRedisUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  let cleaned = url.trim();
  // Strip any CLI wrappers such as `redis-cli -u redis://...` or `redis://redis-cli -u redis://...`
  if (cleaned.includes('redis-cli -u ')) {
    cleaned = cleaned.split('redis-cli -u ')[1].trim();
  }
  // Strip duplicate protocol prefixes
  if (cleaned.startsWith('redis://redis://')) {
    cleaned = cleaned.replace('redis://redis://', 'redis://');
  }
  if (cleaned.startsWith('rediss://rediss://')) {
    cleaned = cleaned.replace('rediss://rediss://', 'rediss://');
  }
  // Remove surrounding quotes if any
  cleaned = cleaned.replace(/^['"]|['"]$/g, '').trim();
  return cleaned;
}

const rawRedisUrl = env.redisUrl || process.env.REDIS_URL;
const redisUrl = sanitizeRedisUrl(rawRedisUrl);

const connectionOptions: any = redisUrl
  ? {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      ...(redisUrl.startsWith('rediss://') ? { tls: { rejectUnauthorized: false } } : {}),
    }
  : {
      host: env.redisHost,
      port: env.redisPort,
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    };

export const redis = redisUrl
  ? new IORedis(redisUrl, connectionOptions)
  : new IORedis(connectionOptions);

redis.on('error', (err) => {
  console.warn('[Redis] Connection warning:', err.message);
});

export const queueConnection = redisUrl
  ? new IORedis(redisUrl, { ...connectionOptions, maxRetriesPerRequest: null })
  : { host: env.redisHost, port: env.redisPort, maxRetriesPerRequest: null as any };



