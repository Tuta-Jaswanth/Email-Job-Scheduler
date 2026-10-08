import IORedis from 'ioredis';
import { env } from './env';

const redisUrl = env.redisUrl || process.env.REDIS_URL;

const connectionOptions: any = redisUrl
  ? {
      maxRetriesPerRequest: null,
      ...(redisUrl.startsWith('rediss://') ? { tls: { rejectUnauthorized: false } } : {}),
    }
  : {
      host: env.redisHost,
      port: env.redisPort,
      maxRetriesPerRequest: null,
    };

export const redis = redisUrl
  ? new IORedis(redisUrl, connectionOptions)
  : new IORedis(connectionOptions);

export const queueConnection = redisUrl
  ? new IORedis(redisUrl, { ...connectionOptions, maxRetriesPerRequest: null })
  : { host: env.redisHost, port: env.redisPort, maxRetriesPerRequest: null as any };

