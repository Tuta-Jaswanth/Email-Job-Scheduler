"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.queueConnection = exports.redis = void 0;
const ioredis_1 = __importDefault(require("ioredis"));
const env_1 = require("./env");
const redisUrl = env_1.env.redisUrl || process.env.REDIS_URL;
const connectionOptions = redisUrl
    ? {
        maxRetriesPerRequest: null,
        ...(redisUrl.startsWith('rediss://') ? { tls: { rejectUnauthorized: false } } : {}),
    }
    : {
        host: env_1.env.redisHost,
        port: env_1.env.redisPort,
        maxRetriesPerRequest: null,
    };
exports.redis = redisUrl
    ? new ioredis_1.default(redisUrl, connectionOptions)
    : new ioredis_1.default(connectionOptions);
exports.queueConnection = redisUrl
    ? new ioredis_1.default(redisUrl, { ...connectionOptions, maxRetriesPerRequest: null })
    : { host: env_1.env.redisHost, port: env_1.env.redisPort, maxRetriesPerRequest: null };
