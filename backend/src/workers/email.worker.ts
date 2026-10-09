import { Worker, UnrecoverableError, DelayedError } from 'bullmq';
import { queueConnection } from '../config/redis';
import { prisma } from '../config/db';
import { sendMail, defaultCredentials } from '../services/mail.service';
import { reserveRate } from '../services/rate.service';
import { notifySlack } from '../services/slack.service';
import { indexEmail } from '../services/search.service';
import { env } from '../config/env';
import { logger } from '../utils/logger';

export const emailWorker = new Worker(
  'email-send',
  async (job) => {
    const { emailId, hourlyLimit } = job.data as {
      emailId: string;
      hourlyLimit?: number;
    };

    // ── 1. Load from DB (idempotency guard) ─────────────────────────────────
    const email = await prisma.email.findUnique({
      where: { id: emailId },
      include: { sender: true },
    });

    if (!email) {
      // Job references a deleted record – don't retry
      throw new UnrecoverableError(`Email ${emailId} not found in database.`);
    }

    if (email.status === 'SENT' || email.status === 'FAILED') {
      // Already processed (duplicate job delivery). Silently skip.
      logger.info('worker.skip.already_processed', { emailId, status: email.status });
      return;
    }

    // ── 2. Future delivery guard ─────────────────────────────────────────────
    // If the job fired too early (BullMQ timer precision ±1 s), re-delay it.
    const dueAt = email.scheduledAt.getTime();
    const nowMs = Date.now();
    if (dueAt > nowMs + 1000) {
      const delay = dueAt - nowMs;
      logger.info('worker.redelay', { emailId, delayMs: delay });
      await job.moveToDelayed(dueAt, job.token);
      throw new DelayedError();
    }

    // ── 3. Rate limiting ─────────────────────────────────────────────────────
    const rate = await reserveRate(email.senderId, hourlyLimit);
    if (!rate.allowed) {
      logger.warn('worker.rate_limited', {
        emailId,
        senderId: email.senderId,
        nextWindowAt: rate.next!.toISOString(),
      });

      await notifySlack(
        email.userId,
        `⏳ Hourly email limit reached for sender *${email.sender.email}*.\n` +
        `Emails are being delayed until *${rate.next!.toISOString()}*.`,
      );

      // Re-queue for the start of the next window
      await job.moveToDelayed(rate.next!.getTime(), job.token);
      throw new DelayedError();
    }

    // ── 4. Mark as PROCESSING (optimistic lock) ──────────────────────────────
    await prisma.email.update({
      where: { id: email.id },
      data: { status: 'PROCESSING' },
    });

    // ── 5. Send ──────────────────────────────────────────────────────────────
    try {
      const credentials = {
        host: 'smtp.ethereal.email',
        port: 587,
        user: email.sender.etherealUser || env.etherealUser || 'marjory.brown64@ethereal.email',
        pass: email.sender.etherealPass || env.etherealPass || 'R34vyFT2nW45fDPTFT',
        from: email.sender.name
          ? `${email.sender.name} <${email.sender.email}>`
          : email.sender.email,
      };

      const rawAttachments = (email.attachments as any[]) || [];
      const nodemailerAttachments = rawAttachments.map((att: any) => {
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

      await sendMail({
        to: email.recipient,
        subject: email.subject,
        html: email.bodyHtml,
        credentials,
        attachments: nodemailerAttachments,
      });

      const sent = await prisma.email.update({
        where: { id: email.id },
        data: { status: 'SENT', sentAt: new Date() },
        include: { sender: true },
      });

      await indexEmail({ ...sent, status: 'SENT' });

      logger.info('worker.email.sent', { emailId, recipient: email.recipient });

      // Notify Slack channel (non-blocking)
      notifySlack(
        email.userId,
        `📨 *Email Sent*: Successfully delivered to \`${email.recipient}\` (Subject: *${email.subject}*)`,
      ).catch(() => {});

      // Configurable throttle between sends (prevents SMTP rate-limit bans)
      if (env.minDelayMs > 0) {
        await new Promise((r) => setTimeout(r, env.minDelayMs));
      }
    } catch (err) {
      // ── 6. Failure handling ──────────────────────────────────────────────
      const reason = err instanceof Error ? err.message : String(err);
      logger.error('worker.email.failed', { emailId, recipient: email.recipient, error: reason });

      const failed = await prisma.email.update({
        where: { id: email.id },
        data: { status: 'FAILED', failureReason: reason },
        include: { sender: true },
      });

      await indexEmail({ ...failed, status: 'FAILED' });

      // Notify Slack channel (non-blocking)
      notifySlack(
        email.userId,
        `⚠️ *Delivery Failure*: Email to \`${email.recipient}\` failed.\n*Reason*: ${reason}`,
      ).catch(() => {});

      // Re-throw so BullMQ records the failure and applies the retry strategy
      throw err;
    }
  },
  {
    connection: queueConnection,
    concurrency: env.concurrency,
    // Per-job retry config is set when adding jobs to the queue (see email.controller.ts)
  },
);

emailWorker.on('failed', (job, err) => {
  logger.error('worker.job.failed', {
    jobId: job?.id,
    emailId: job?.data?.emailId,
    attempts: job?.attemptsMade,
    error: String(err),
  });
});

emailWorker.on('error', (err) => {
  logger.error('worker.connection.error', { error: String(err) });
});

emailWorker.on('stalled', (jobId) => {
  logger.warn('worker.job.stalled', { jobId });
});

// ── Graceful shutdown ────────────────────────────────────────────────────────
// Called from server.ts on SIGTERM / SIGINT
export async function shutdownWorker(): Promise<void> {
  logger.info('worker.shutdown.start');
  await emailWorker.close();
  logger.info('worker.shutdown.done');
}
