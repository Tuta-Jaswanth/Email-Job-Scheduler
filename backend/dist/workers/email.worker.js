"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.emailWorker = void 0;
exports.shutdownWorker = shutdownWorker;
const bullmq_1 = require("bullmq");
const redis_1 = require("../config/redis");
const db_1 = require("../config/db");
const mail_service_1 = require("../services/mail.service");
const rate_service_1 = require("../services/rate.service");
const slack_service_1 = require("../services/slack.service");
const search_service_1 = require("../services/search.service");
const env_1 = require("../config/env");
const logger_1 = require("../utils/logger");
exports.emailWorker = new bullmq_1.Worker('email-send', async (job) => {
    const { emailId, hourlyLimit } = job.data;
    // ── 1. Load from DB (idempotency guard) ─────────────────────────────────
    const email = await db_1.prisma.email.findUnique({
        where: { id: emailId },
        include: { sender: true },
    });
    if (!email) {
        // Job references a deleted record – don't retry
        throw new bullmq_1.UnrecoverableError(`Email ${emailId} not found in database.`);
    }
    if (email.status === 'SENT' || email.status === 'FAILED') {
        // Already processed (duplicate job delivery). Silently skip.
        logger_1.logger.info('worker.skip.already_processed', { emailId, status: email.status });
        return;
    }
    // ── 2. Future delivery guard ─────────────────────────────────────────────
    // If the job fired too early (BullMQ timer precision ±1 s), re-delay it.
    const dueAt = email.scheduledAt.getTime();
    const nowMs = Date.now();
    if (dueAt > nowMs + 1000) {
        const delay = dueAt - nowMs;
        logger_1.logger.info('worker.redelay', { emailId, delayMs: delay });
        await job.moveToDelayed(dueAt, job.token);
        throw new bullmq_1.DelayedError();
    }
    // ── 3. Rate limiting ─────────────────────────────────────────────────────
    const rate = await (0, rate_service_1.reserveRate)(email.senderId, hourlyLimit);
    if (!rate.allowed) {
        logger_1.logger.warn('worker.rate_limited', {
            emailId,
            senderId: email.senderId,
            nextWindowAt: rate.next.toISOString(),
        });
        await (0, slack_service_1.notifySlack)(email.userId, `⏳ Hourly email limit reached for sender *${email.sender.email}*.\n` +
            `Emails are being delayed until *${rate.next.toISOString()}*.`);
        // Re-queue for the start of the next window
        await job.moveToDelayed(rate.next.getTime(), job.token);
        throw new bullmq_1.DelayedError();
    }
    // ── 4. Mark as PROCESSING (optimistic lock) ──────────────────────────────
    await db_1.prisma.email.update({
        where: { id: email.id },
        data: { status: 'PROCESSING' },
    });
    // ── 5. Send ──────────────────────────────────────────────────────────────
    try {
        const credentials = {
            host: 'smtp.ethereal.email',
            port: 587,
            user: email.sender.etherealUser,
            pass: email.sender.etherealPass,
            from: email.sender.name
                ? `${email.sender.name} <${email.sender.email}>`
                : email.sender.email,
        };
        const rawAttachments = email.attachments || [];
        const nodemailerAttachments = rawAttachments.map((att) => {
            if (att.dataUrl && typeof att.dataUrl === 'string' && att.dataUrl.includes('base64,')) {
                const base64Data = att.dataUrl.split('base64,')[1];
                return {
                    filename: att.name || 'attachment',
                    content: Buffer.from(base64Data, 'base64'),
                    contentType: att.type,
                };
            }
            return {
                filename: att.name || 'attachment',
                path: att.url || att.dataUrl,
            };
        });
        await (0, mail_service_1.sendMail)({
            to: email.recipient,
            subject: email.subject,
            html: email.bodyHtml,
            credentials,
            attachments: nodemailerAttachments,
        });
        const sent = await db_1.prisma.email.update({
            where: { id: email.id },
            data: { status: 'SENT', sentAt: new Date() },
            include: { sender: true },
        });
        await (0, search_service_1.indexEmail)({ ...sent, status: 'SENT' });
        logger_1.logger.info('worker.email.sent', { emailId, recipient: email.recipient });
        // Configurable throttle between sends (prevents SMTP rate-limit bans)
        if (env_1.env.minDelayMs > 0) {
            await new Promise((r) => setTimeout(r, env_1.env.minDelayMs));
        }
    }
    catch (err) {
        // ── 6. Failure handling ──────────────────────────────────────────────
        const reason = err instanceof Error ? err.message : String(err);
        logger_1.logger.error('worker.email.failed', { emailId, recipient: email.recipient, error: reason });
        const failed = await db_1.prisma.email.update({
            where: { id: email.id },
            data: { status: 'FAILED', failureReason: reason },
            include: { sender: true },
        });
        await (0, search_service_1.indexEmail)({ ...failed, status: 'FAILED' });
        // Re-throw so BullMQ records the failure and applies the retry strategy
        throw err;
    }
}, {
    connection: redis_1.queueConnection,
    concurrency: env_1.env.concurrency,
    // Per-job retry config is set when adding jobs to the queue (see email.controller.ts)
});
exports.emailWorker.on('failed', (job, err) => {
    logger_1.logger.error('worker.job.failed', {
        jobId: job?.id,
        emailId: job?.data?.emailId,
        attempts: job?.attemptsMade,
        error: String(err),
    });
});
exports.emailWorker.on('error', (err) => {
    logger_1.logger.error('worker.connection.error', { error: String(err) });
});
exports.emailWorker.on('stalled', (jobId) => {
    logger_1.logger.warn('worker.job.stalled', { jobId });
});
// ── Graceful shutdown ────────────────────────────────────────────────────────
// Called from server.ts on SIGTERM / SIGINT
async function shutdownWorker() {
    logger_1.logger.info('worker.shutdown.start');
    await exports.emailWorker.close();
    logger_1.logger.info('worker.shutdown.done');
}
