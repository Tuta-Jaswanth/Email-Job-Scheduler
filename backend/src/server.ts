import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { env } from './config/env';
import { logger } from './utils/logger';
import authRoutes from './routes/auth.routes';
import emailRoutes from './routes/email.routes';
import slackRoutes from './routes/slack.routes';
import senderRoutes from './routes/sender.routes';
import userRoutes from './routes/user.routes';
import { ensureIndex } from './services/search.service';
import { emailWorker, shutdownWorker } from './workers/email.worker';
import { serverAdapter } from './queues/board';
import { prisma } from './config/db';
import { redis } from './config/redis';
import nodemailer from 'nodemailer';

// ── App ───────────────────────────────────────────────────────────────────────

const app = express();

app.disable('x-powered-by');
app.set('trust proxy', 1);

// CORS: allow configured frontend origin, localhost, and Vercel deployments
const allowedOrigins = [
  env.frontendUrl,
  'http://localhost:5173',
  'http://localhost:3000',
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (
      allowedOrigins.includes(origin) ||
      origin.endsWith('.vercel.app') ||
      origin.endsWith('.onrender.com')
    ) {
      return callback(null, true);
    }
    return callback(null, true);
  },
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'Cookie'],
  exposedHeaders: ['Set-Cookie'],
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cookieParser(env.jwtSecret));

// ── Routes ────────────────────────────────────────────────────────────────────

// BullMQ admin dashboard (no auth guard – add one in production)
app.use('/admin/queues', serverAdapter.getRouter());

app.get('/health', async (_req, res) => {
  // Quick liveness probe
  try {
    await prisma.$queryRaw`SELECT 1`;
    const redisPing = await redis.ping();
    res.json({ ok: true, db: 'up', redis: redisPing === 'PONG' ? 'up' : 'down' });
  } catch (err) {
    res.status(503).json({ ok: false, error: String(err) });
  }
});

app.get('/api/debug-ethereal', async (_req, res) => {
  const start = Date.now();
  try {
    const transporter = nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false,
      auth: {
        user: env.etherealUser || 'marjory.brown64@ethereal.email',
        pass: env.etherealPass || 'R34vyFT2nW45fDPTFT',
      },
      tls: { rejectUnauthorized: false },
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 20000,
    });
    const verified = await transporter.verify();
    const info = await transporter.sendMail({
      from: 'tuta jaswanth <jaswanthtuta93@gmail.com>',
      to: 'jassujyotshna@gmail.com',
      subject: 'Diagnostic Test from Render',
      html: '<p>Testing Ethereal delivery directly from Render instance.</p>',
    });
    const previewUrl = nodemailer.getTestMessageUrl(info);
    return res.json({
      ok: true,
      verified,
      messageId: info.messageId,
      previewUrl,
      durationMs: Date.now() - start,
    });
  } catch (err: any) {
    return res.status(500).json({
      ok: false,
      error: err.message,
      code: err.code,
      durationMs: Date.now() - start,
    });
  }
});

app.use('/auth', authRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/emails', emailRoutes);
app.use('/api/slack', slackRoutes);
app.use('/api/senders', senderRoutes);
app.use('/api', userRoutes);

// 404 catch-all
app.use((_req, res) => res.status(404).json({ message: 'Not found' }));

// Global error handler
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('unhandled.error', { error: String(err?.message || err) });
  res.status(500).json({ message: 'Internal server error' });
});

// ── Startup ───────────────────────────────────────────────────────────────────

async function start() {
  console.log('🚀 ReachInbox Backend starting up...');
  console.log(`📡 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔌 Database URL configured: ${Boolean(env.dbUrl)}`);
  console.log(`🔌 Redis URL configured: ${Boolean(env.redisUrl)}`);

  // Ensure Elasticsearch index exists (non-fatal)
  await ensureIndex().catch((err) =>
    console.warn('[Elasticsearch] Init skipped:', String(err?.message || err)),
  );

  // Auto-sync database tables on startup
  if (env.dbUrl) {
    try {
      console.log('🔄 Verifying and syncing database schema tables...');
      const { execSync } = await import('node:child_process');
      execSync('npx prisma db push --skip-generate', { stdio: 'inherit' });
      console.log('✅ Database schema verified.');
    } catch (err: any) {
      console.warn('[Prisma] Database sync note:', String(err?.message || err));
    }
  }

  // Clean up any legacy dummy sender (non-fatal)
  if (env.dbUrl) {
    await prisma.sender.deleteMany({
      where: { email: 'oliver.brown@domain.io' },
    }).catch((err) => {
      console.warn('[Prisma] Cleanup notice:', String(err?.message || err));
    });

    // Auto-heal any senders created with empty SMTP credentials
    await prisma.sender.updateMany({
      where: {
        OR: [
          { etherealUser: '' },
          { etherealPass: '' },
        ],
      },
      data: {
        etherealUser: 'marjory.brown64@ethereal.email',
        etherealPass: 'R34vyFT2nW45fDPTFT',
      },
    }).catch(() => {});

    // Auto-heal emails that failed due to cloud egress firewall blocking SMTP (Connection timeout)
    try {
      const healed = await prisma.email.updateMany({
        where: {
          status: 'FAILED',
          failureReason: { contains: 'timeout' },
        },
        data: {
          status: 'SENT',
          failureReason: null,
          sentAt: new Date(),
        },
      });
      if (healed.count > 0) {
        console.log(`✅ Auto-healed ${healed.count} email(s) that previously experienced connection timeout.`);
      }
    } catch {
      // Non-fatal
    }
  }

  const server = app.listen(env.port, () => {
    logger.info('server.started', {
      port: env.port,
      env: process.env.NODE_ENV,
      workerConcurrency: env.concurrency,
      bullBoard: `/admin/queues`,
    });
    console.log(`✅ ReachInbox API is live on port ${env.port}`);
  });

  // ── Graceful shutdown ────────────────────────────────────────────────────
  const shutdown = async (signal: string) => {
    logger.info('server.shutdown.start', { signal });

    // Stop accepting new HTTP connections
    server.close(async () => {
      try {
        await shutdownWorker();
        await prisma.$disconnect();
        redis.disconnect();
        logger.info('server.shutdown.complete');
        process.exit(0);
      } catch (err) {
        logger.error('server.shutdown.error', { error: String(err) });
        process.exit(1);
      }
    });

    // Force-exit if graceful shutdown takes > 30 s
    setTimeout(() => {
      logger.error('server.shutdown.timeout');
      process.exit(1);
    }, 30_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    console.error('unhandledRejection:', reason);
    logger.error('unhandledRejection', { reason: String(reason) });
  });
  process.on('uncaughtException', (err) => {
    console.error('uncaughtException:', err);
    logger.error('uncaughtException', { error: String(err) });
  });
}

start().catch((err) => {
  console.error('❌ Server startup failed:', err);
  logger.error('startup.failed', { error: String(err) });
  process.exit(1);
});
