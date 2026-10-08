import IORedis from 'ioredis';
import { env } from './env';

const redisUrl = env.redisUrl || process.env.REDIS_URL;

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


