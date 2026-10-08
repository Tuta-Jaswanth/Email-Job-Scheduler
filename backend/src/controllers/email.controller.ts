import { Request, Response } from 'express';
import { prisma } from '../config/db';
import { emailQueue } from '../queues/email.queue';
import { indexEmail, deleteEmailFromIndex, searchEmails } from '../services/search.service';
import { logger } from '../utils/logger';
import { v4 as uuid } from 'uuid';

type AuthRequest = Request & { user: { id: string } };

// ── Schedule ─────────────────────────────────────────────────────────────────

export async function schedule(req: Request, res: Response) {
  const {
    subject,
    bodyHtml,
    recipients,
    startTime,
    delayBetweenEmails = 2000,
    hourlyLimit,
    senderId,
    attachments,
  } = req.body;

  const userId = (req as AuthRequest).user.id;

  if (!subject || !bodyHtml) {
    return res.status(400).json({ message: 'subject and bodyHtml are required' });
  }
  if (!Array.isArray(recipients) || recipients.length === 0) {
    return res.status(400).json({ message: 'recipients must be a non-empty array' });
  }
  if (recipients.length > 5000) {
    return res.status(400).json({ message: 'Maximum 5 000 recipients per batch' });
  }

  // Resolve sender: prefer explicit ID, fall back to first available
  let sender;
  if (senderId) {
    sender = await prisma.sender.findUnique({ where: { id: senderId } });
    if (!sender) {
      return res.status(400).json({ message: `Sender ${senderId} not found` });
    }
  } else {
    sender = await prisma.sender.findFirst();
    if (!sender) {
      return res.status(400).json({ message: 'No senders configured. Add a sender first.' });
    }
  }

  const start = new Date(startTime || Date.now() + 60_000);
  const delayMs = Math.max(0, Number(delayBetweenEmails));
  const limit = Number(hourlyLimit) || 0;

  const created: string[] = [];

  for (let i = 0; i < recipients.length; i++) {
    const id = uuid();
    const scheduledAt = new Date(start.getTime() + i * delayMs);

    const email = await prisma.email.create({
      data: {
        id,
        userId,
        senderId: sender.id,
        recipient: recipients[i],
        subject,
        bodyHtml,
        scheduledAt,
        attachments: Array.isArray(attachments) ? attachments : undefined,
      },
    });

    const job = await emailQueue.add(
      'send-email',
      { emailId: id, userId, senderId: sender.id, hourlyLimit: limit },
      {
        jobId: `email_${id}`,           // Idempotency key: prevents duplicate jobs
        delay: Math.max(0, scheduledAt.getTime() - Date.now()),
        attempts: 5,
        backoff: { type: 'exponential', delay: 30_000 },
        removeOnComplete: { count: 1000, age: 7 * 86400 },
        removeOnFail: { count: 500, age: 30 * 86400 },
      },
    );

    await prisma.email.update({ where: { id }, data: { bullJobId: job.id } });
    await indexEmail({ ...email, status: 'SCHEDULED' });
    created.push(id);
  }

  logger.info('controller.schedule', { userId, count: created.length, senderId: sender.id });
  return res.status(201).json({ count: created.length, ids: created });
}

// ── List ──────────────────────────────────────────────────────────────────────

export async function list(req: Request, res: Response) {
  const userId = (req as AuthRequest).user.id;
  const isSent = req.query.status === 'sent';
  const onlyStarred = req.query.starred === 'true';

  const statusFilter = isSent
    ? { in: ['SENT', 'FAILED'] as any }
    : { in: ['SCHEDULED', 'PROCESSING'] as any };

  const whereClause: any = {
    userId,
    status: statusFilter,
  };

  if (onlyStarred) {
    whereClause.isStarred = true;
  }

  const page = Math.max(1, Number(Array.isArray(req.query.page) ? req.query.page[0] : (req.query.page || '1')) || 1);
  const limit = Math.min(100, Math.max(1, Number(Array.isArray(req.query.limit) ? req.query.limit[0] : (req.query.limit || '50')) || 50));
  const skip = (page - 1) * limit;

  const [total, emails] = await Promise.all([
    prisma.email.count({ where: whereClause }),
    prisma.email.findMany({
      where: whereClause,
      orderBy: isSent ? { updatedAt: 'desc' } : { scheduledAt: 'asc' },
      include: { sender: { select: { id: true, email: true, name: true } } },
      skip,
      take: limit,
    }),
  ]);

  return res.json({ total, page, limit, emails });
}

// ── Get by ID ─────────────────────────────────────────────────────────────────

export async function getById(req: Request, res: Response) {
  const userId = (req as AuthRequest).user.id;
  const email = await prisma.email.findUnique({
    where: { id: String(req.params.id) },
    include: { sender: { select: { id: true, email: true, name: true } } },
  });

  if (!email || email.userId !== userId) {
    return res.status(404).json({ message: 'Email not found' });
  }

  return res.json(email);
}

// ── Toggle Favourite / Star ───────────────────────────────────────────────────

export async function toggleStar(req: Request, res: Response) {
  const userId = (req as AuthRequest).user.id;
  const email = await prisma.email.findUnique({
    where: { id: String(req.params.id) },
    include: { sender: true },
  });

  if (!email || email.userId !== userId) {
    return res.status(404).json({ message: 'Email not found' });
  }

  const updated = await prisma.email.update({
    where: { id: email.id },
    data: { isStarred: !email.isStarred },
    include: { sender: { select: { id: true, email: true, name: true } } },
  });

  await indexEmail(updated);
  logger.info('controller.toggleStar', { emailId: email.id, isStarred: updated.isStarred, userId });

  return res.json(updated);
}

// ── Delete Email ─────────────────────────────────────────────────────────────

export async function deleteEmail(req: Request, res: Response) {
  const userId = (req as AuthRequest).user.id;
  const email = await prisma.email.findUnique({ where: { id: String(req.params.id) } });

  if (!email || email.userId !== userId) {
    return res.status(404).json({ message: 'Email not found' });
  }

  // If email was queued in BullMQ, cancel and remove the job
  if (email.bullJobId) {
    try {
      const job = await emailQueue.getJob(email.bullJobId);
      await job?.remove();
    } catch {
      // Job might already be processed or removed
    }
  }

  // Delete from PostgreSQL
  await prisma.email.delete({
    where: { id: email.id },
  });

  // Delete from Elasticsearch
  await deleteEmailFromIndex(email.id);

  logger.info('controller.delete', { emailId: email.id, userId });
  return res.json({ ok: true, deletedId: email.id });
}

// ── Cancel (scheduled emails only) ───────────────────────────────────────────

export async function cancelEmail(req: Request, res: Response) {
  const userId = (req as AuthRequest).user.id;
  const email = await prisma.email.findUnique({ where: { id: String(req.params.id) } });

  if (!email || email.userId !== userId) {
    return res.status(404).json({ message: 'Email not found' });
  }
  if (email.status !== 'SCHEDULED') {
    return res.status(409).json({
      message: `Cannot cancel an email with status "${email.status}"`,
    });
  }

  // Remove the BullMQ job if it exists
  if (email.bullJobId) {
    try {
      const job = await emailQueue.getJob(email.bullJobId);
      await job?.remove();
    } catch {
      // Job may already be gone – that's fine
    }
  }

  const cancelled = await prisma.email.update({
    where: { id: email.id },
    data: { status: 'FAILED', failureReason: 'Cancelled by user' },
    include: { sender: { select: { id: true, email: true, name: true } } },
  });

  await indexEmail({ ...cancelled, status: 'FAILED' });
  logger.info('controller.cancel', { emailId: email.id, userId });

  return res.json({ ok: true });
}

// ── Search ────────────────────────────────────────────────────────────────────

export async function search(req: Request, res: Response) {
  const userId = (req as AuthRequest).user.id;
  const q = String(Array.isArray(req.query.q) ? req.query.q[0] : (req.query.q ?? '')).trim();

  if (!q) {
    return res.status(400).json({ message: 'Query parameter "q" is required' });
  }

  const results = await searchEmails(q, userId);
  return res.json(results);
}
