"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const env_1 = require("./config/env");
const logger_1 = require("./utils/logger");
const auth_routes_1 = __importDefault(require("./routes/auth.routes"));
const email_routes_1 = __importDefault(require("./routes/email.routes"));
const slack_routes_1 = __importDefault(require("./routes/slack.routes"));
const sender_routes_1 = __importDefault(require("./routes/sender.routes"));
const user_routes_1 = __importDefault(require("./routes/user.routes"));
const search_service_1 = require("./services/search.service");
const email_worker_1 = require("./workers/email.worker");
const board_1 = require("./queues/board");
const db_1 = require("./config/db");
const redis_1 = require("./config/redis");
// ── App ───────────────────────────────────────────────────────────────────────
const app = (0, express_1.default)();
app.disable('x-powered-by');
app.set('trust proxy', 1);
// CORS: allow configured frontend origin, localhost, and Vercel deployments
const allowedOrigins = [
    env_1.env.frontendUrl,
    'http://localhost:5173',
    'http://localhost:3000',
];
app.use((0, cors_1.default)({
    origin: (origin, callback) => {
        if (!origin)
            return callback(null, true);
        if (allowedOrigins.includes(origin) ||
            origin.endsWith('.vercel.app') ||
            origin.endsWith('.onrender.com')) {
            return callback(null, true);
        }
        return callback(null, true);
    },
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'Cookie'],
    exposedHeaders: ['Set-Cookie'],
}));
app.use(express_1.default.json({ limit: '50mb' }));
app.use(express_1.default.urlencoded({ extended: true, limit: '50mb' }));
app.use((0, cookie_parser_1.default)(env_1.env.jwtSecret));
// ── Routes ────────────────────────────────────────────────────────────────────
// BullMQ admin dashboard (no auth guard – add one in production)
app.use('/admin/queues', board_1.serverAdapter.getRouter());
app.get('/health', async (_req, res) => {
    // Quick liveness probe
    try {
        await db_1.prisma.$queryRaw `SELECT 1`;
        const redisPing = await redis_1.redis.ping();
        res.json({ ok: true, db: 'up', redis: redisPing === 'PONG' ? 'up' : 'down' });
    }
    catch (err) {
        res.status(503).json({ ok: false, error: String(err) });
    }
});
app.use('/auth', auth_routes_1.default);
app.use('/api/auth', auth_routes_1.default);
app.use('/api/emails', email_routes_1.default);
app.use('/api/slack', slack_routes_1.default);
app.use('/api/senders', sender_routes_1.default);
app.use('/api', user_routes_1.default);
// 404 catch-all
app.use((_req, res) => res.status(404).json({ message: 'Not found' }));
// Global error handler
app.use((err, _req, res, _next) => {
    logger_1.logger.error('unhandled.error', { error: String(err?.message || err) });
    res.status(500).json({ message: 'Internal server error' });
});
// ── Startup ───────────────────────────────────────────────────────────────────
async function start() {
    // Ensure Elasticsearch index exists
    await (0, search_service_1.ensureIndex)().catch((err) => logger_1.logger.warn('es.init.skipped', { error: String(err) }));
    // Clean up any legacy dummy sender
    await db_1.prisma.sender.deleteMany({
        where: { email: 'oliver.brown@domain.io' },
    }).catch(() => { });
    const server = app.listen(env_1.env.port, () => {
        logger_1.logger.info('server.started', {
            port: env_1.env.port,
            env: process.env.NODE_ENV,
            workerConcurrency: env_1.env.concurrency,
            bullBoard: `/admin/queues`,
        });
    });
    // ── Graceful shutdown ────────────────────────────────────────────────────
    const shutdown = async (signal) => {
        logger_1.logger.info('server.shutdown.start', { signal });
        // Stop accepting new HTTP connections
        server.close(async () => {
            try {
                await (0, email_worker_1.shutdownWorker)();
                await db_1.prisma.$disconnect();
                redis_1.redis.disconnect();
                logger_1.logger.info('server.shutdown.complete');
                process.exit(0);
            }
            catch (err) {
                logger_1.logger.error('server.shutdown.error', { error: String(err) });
                process.exit(1);
            }
        });
        // Force-exit if graceful shutdown takes > 30 s
        setTimeout(() => {
            logger_1.logger.error('server.shutdown.timeout');
            process.exit(1);
        }, 30_000).unref();
    };
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('unhandledRejection', (reason) => {
        logger_1.logger.error('unhandledRejection', { reason: String(reason) });
    });
    process.on('uncaughtException', (err) => {
        logger_1.logger.error('uncaughtException', { error: String(err) });
        process.exit(1);
    });
}
start().catch((err) => {
    logger_1.logger.error('startup.failed', { error: String(err) });
    process.exit(1);
});
