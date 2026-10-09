import { Request, Response } from 'express';
import { prisma } from '../config/db';
import { logger } from '../utils/logger';
import { v4 as uuid } from 'uuid';

type AuthRequest = Request & { user: { id: string; email?: string; name?: string } };

const SEED_TEMPLATES = [
  {
    from: 'Elena Rostova <elena.rostova@nexusgroup.io>',
    fromEmail: 'elena.rostova@nexusgroup.io',
    subject: 'Re: Scaling outbound email infrastructure with ReachInbox',
    bodyText:
      "Hi Jaswanth,\n\nThanks for reaching out! We've been evaluating our email deliverability and scheduling workflows. Your approach to queue concurrency and rate-limiting pacing matches what our engineering team is looking for.\n\nCould you share a demo or have time for a 15-minute sync this Thursday?\n\nBest regards,\nElena Rostova\nHead of Engineering @ Nexus Group",
    bodyHtml: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #1e293b;">
        <p>Hi,</p>
        <p>Thanks for reaching out! We've been evaluating our email deliverability and scheduling workflows. Your approach to <strong>BullMQ queue concurrency</strong> and <strong>rate-limiting pacing</strong> matches what our engineering team has been looking for.</p>
        <p>Could you share a short demo or would you have time for a 15-minute sync this Thursday afternoon?</p>
        <p style="margin-top: 24px; color: #64748b; font-size: 13px; border-top: 1px solid #e2e8f0; padding-top: 12px;">
          <strong>Elena Rostova</strong><br/>
          Head of Engineering &bull; Nexus Group<br/>
          <span style="color: #00a651;">nexusgroup.io</span>
        </p>
      </div>
    `,
    minutesAgo: 14,
  },
  {
    from: 'Marcus Sterling <marcus@growthscale.com>',
    fromEmail: 'marcus@growthscale.com',
    subject: 'Re: Follow-up on cold outreach automation',
    bodyText:
      "Hey team,\n\nI reviewed your proposal. Quick question: does your scheduler support Slack alerts when sender limits are reached? We run into hourly limits frequently with multiple mailboxes.\n\nLooking forward to hearing from you,\nMarcus",
    bodyHtml: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #1e293b;">
        <p>Hey team,</p>
        <p>I reviewed your scheduling proposal. Quick question: does your platform support <strong>Slack alerts</strong> when sender limits are reached? We run into hourly limits frequently across multiple sending mailboxes.</p>
        <p>If that's supported out of the box, we'd love to onboard our sales ops team right away.</p>
        <p style="margin-top: 24px; color: #64748b; font-size: 13px; border-top: 1px solid #e2e8f0; padding-top: 12px;">
          <strong>Marcus Sterling</strong><br/>
          VP of Growth &bull; GrowthScale Labs
        </p>
      </div>
    `,
    minutesAgo: 110,
  },
  {
    from: 'Sophia Martinez <sophia.m@cloudventures.co>',
    fromEmail: 'sophia.m@cloudventures.co',
    subject: 'Partnership Inquiry: Email Dispatch Engine',
    bodyText:
      "Hi there,\n\nLoved the demo of your email scheduling dashboard. The Ethereal and multi-tier delivery architecture is very impressive. Let's connect soon!\n\nCheers,\nSophia",
    bodyHtml: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #1e293b;">
        <p>Hi there,</p>
        <p>Loved the demo of your email scheduling dashboard! The multi-tier delivery architecture and automated queue pacing look solid.</p>
        <p>Would love to discuss integrating your dispatch engine with our portfolio companies.</p>
        <p style="margin-top: 24px; color: #64748b; font-size: 13px; border-top: 1px solid #e2e8f0; padding-top: 12px;">
          <strong>Sophia Martinez</strong><br/>
          Principal &bull; Cloud Ventures
        </p>
      </div>
    `,
    minutesAgo: 380,
  },
];

/**
 * Seeds initial demo received emails for a user if their inbox is completely empty.
 */
async function autoSeedInboxIfEmpty(userId: string, userEmail: string) {
  try {
    const count = await prisma.receivedEmail.count({ where: { userId } });
    if (count > 0) return;

    for (const tpl of SEED_TEMPLATES) {
      await prisma.receivedEmail.create({
        data: {
          id: uuid(),
          userId,
          from: tpl.from,
          fromEmail: tpl.fromEmail,
          to: userEmail,
          subject: tpl.subject,
          bodyHtml: tpl.bodyHtml.trim(),
          bodyText: tpl.bodyText.trim(),
          isRead: tpl.minutesAgo > 120, // older ones marked read, newest unread
          isStarred: tpl.minutesAgo === 14,
          receivedAt: new Date(Date.now() - tpl.minutesAgo * 60 * 1000),
        },
      });
    }
  } catch (err: any) {
    logger.warn('inbox.autoSeed.failed', { userId, error: err.message });
  }
}

// ── List Received Emails ──────────────────────────────────────────────────────

export async function listReceived(req: Request, res: Response) {
  const userId = (req as AuthRequest).user.id;
  const userEmail = (req as AuthRequest).user.email || 'user@reachinbox.ai';

  // Seed realistic demo emails if brand new inbox
  await autoSeedInboxIfEmpty(userId, userEmail);

  const filter = String(req.query.filter || 'all').toLowerCase();
  const search = String(req.query.search || '').trim().toLowerCase();
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
  const skip = (page - 1) * limit;

  const whereClause: any = { userId };

  if (filter === 'unread') {
    whereClause.isRead = false;
  } else if (filter === 'starred') {
    whereClause.isStarred = true;
  }

  if (search) {
    whereClause.OR = [
      { from: { contains: search, mode: 'insensitive' } },
      { fromEmail: { contains: search, mode: 'insensitive' } },
      { subject: { contains: search, mode: 'insensitive' } },
      { bodyText: { contains: search, mode: 'insensitive' } },
      { bodyHtml: { contains: search, mode: 'insensitive' } },
    ];
  }

  const [total, unreadCount, emails] = await Promise.all([
    prisma.receivedEmail.count({ where: whereClause }),
    prisma.receivedEmail.count({ where: { userId, isRead: false } }),
    prisma.receivedEmail.findMany({
      where: whereClause,
      orderBy: { receivedAt: 'desc' },
      skip,
      take: limit,
    }),
  ]);

  return res.json({
    total,
    unreadCount,
    page,
    limit,
    emails,
  });
}

// ── Get Received Email Counts ─────────────────────────────────────────────────

export async function getReceivedCounts(req: Request, res: Response) {
  const userId = (req as AuthRequest).user.id;

  const [total, unreadCount, starredCount] = await Promise.all([
    prisma.receivedEmail.count({ where: { userId } }),
    prisma.receivedEmail.count({ where: { userId, isRead: false } }),
    prisma.receivedEmail.count({ where: { userId, isStarred: true } }),
  ]);

  return res.json({ total, unreadCount, starredCount });
}

// ── Get Single Received Email ─────────────────────────────────────────────────

export async function getReceivedById(req: Request, res: Response) {
  const userId = (req as AuthRequest).user.id;
  const id = String(req.params.id);

  const email = await prisma.receivedEmail.findUnique({
    where: { id },
  });

  if (!email || email.userId !== userId) {
    return res.status(404).json({ message: 'Received email not found' });
  }

  // Auto-mark as read when opened unless explicitly requested otherwise
  if (!email.isRead && req.query.autoMarkRead !== 'false') {
    const updated = await prisma.receivedEmail.update({
      where: { id },
      data: { isRead: true },
    });
    return res.json(updated);
  }

  return res.json(email);
}

// ── Mark Read / Unread ───────────────────────────────────────────────────────

export async function setReadStatus(req: Request, res: Response) {
  const userId = (req as AuthRequest).user.id;
  const id = String(req.params.id);
  const isRead = req.body.isRead !== undefined ? Boolean(req.body.isRead) : true;

  const email = await prisma.receivedEmail.findUnique({ where: { id } });
  if (!email || email.userId !== userId) {
    return res.status(404).json({ message: 'Received email not found' });
  }

  const updated = await prisma.receivedEmail.update({
    where: { id },
    data: { isRead },
  });

  return res.json(updated);
}

// ── Toggle Star ──────────────────────────────────────────────────────────────

export async function toggleReceivedStar(req: Request, res: Response) {
  const userId = (req as AuthRequest).user.id;
  const id = String(req.params.id);

  const email = await prisma.receivedEmail.findUnique({ where: { id } });
  if (!email || email.userId !== userId) {
    return res.status(404).json({ message: 'Received email not found' });
  }

  const updated = await prisma.receivedEmail.update({
    where: { id },
    data: { isStarred: !email.isStarred },
  });

  return res.json(updated);
}

// ── Delete Received Email ────────────────────────────────────────────────────

export async function deleteReceived(req: Request, res: Response) {
  const userId = (req as AuthRequest).user.id;
  const id = String(req.params.id);

  const email = await prisma.receivedEmail.findUnique({ where: { id } });
  if (!email || email.userId !== userId) {
    return res.status(404).json({ message: 'Received email not found' });
  }

  await prisma.receivedEmail.delete({ where: { id } });
  return res.json({ ok: true, message: 'Email deleted successfully' });
}

// ── Simulate Inbound Reply / Test Inbound ─────────────────────────────────────

export async function simulateInbound(req: Request, res: Response) {
  const userId = (req as AuthRequest).user.id;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  const userEmail = user?.email || 'user@reachinbox.ai';

  // Check if user has sent any emails to reply to
  const lastSentEmail = await prisma.email.findFirst({
    where: { userId, status: 'SENT' },
    orderBy: { sentAt: 'desc' },
  });

  const customFrom = req.body.from;
  const customSubject = req.body.subject;
  const customBody = req.body.body;

  let fromName = 'David Miller';
  let fromEmail = 'david.miller@techflow.ai';
  let subject = lastSentEmail
    ? `Re: ${lastSentEmail.subject.replace(/^Re:\s*/i, '')}`
    : 'Re: ReachInbox Partnership & Scheduled Demos';

  if (lastSentEmail?.recipient) {
    fromEmail = lastSentEmail.recipient;
    fromName = lastSentEmail.recipient.split('@')[0].replace(/[._]/g, ' ');
    fromName = fromName.charAt(0).toUpperCase() + fromName.slice(1);
  }

  if (customFrom) {
    fromEmail = customFrom;
    fromName = customFrom.split('@')[0];
  }
  if (customSubject) subject = customSubject;

  const bodyText =
    customBody ||
    `Hi ${user?.name || 'there'},\n\n` +
      `Thank you for your email regarding "${subject.replace(/^Re:\s*/i, '')}".\n\n` +
      `We evaluated your platform and are very excited about the delayed pacing and rate-limiting features. ` +
      `Could we arrange a short call next week to finalize the details?\n\n` +
      `Best regards,\n${fromName}\nTechFlow Operations`;

  const bodyHtml = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #1e293b;">
      <p>Hi ${user?.name || 'there'},</p>
      <p>Thank you for your email regarding <strong>${subject.replace(/^Re:\s*/i, '')}</strong>.</p>
      <p>We evaluated your platform and are very excited about the <em>delayed pacing</em> and <em>rate-limiting</em> features. Could we arrange a short 15-minute call next week to finalize the details?</p>
      <p style="margin-top: 24px; color: #64748b; font-size: 13px; border-top: 1px solid #e2e8f0; padding-top: 12px;">
        <strong>${fromName}</strong><br/>
        Operations Lead &bull; TechFlow Labs<br/>
        <span style="color: #00a651;">${fromEmail}</span>
      </p>
    </div>
  `;

  const created = await prisma.receivedEmail.create({
    data: {
      id: uuid(),
      userId,
      from: `${fromName} <${fromEmail}>`,
      fromEmail,
      to: userEmail,
      subject,
      bodyHtml,
      bodyText,
      isRead: false,
      isStarred: false,
      receivedAt: new Date(),
    },
  });

  logger.info('inbox.simulateInbound', { userId, fromEmail, subject, id: created.id });

  return res.status(201).json({
    ok: true,
    message: 'New incoming email received in Inbox!',
    email: created,
  });
}

// ── Public Inbound Webhook (SendGrid/Mailgun/Postmark/Resend Inbound) ──────────

export async function inboundWebhook(req: Request, res: Response) {
  try {
    const { to, from, fromEmail, subject, html, text, attachments } = req.body;

    if (!to || (!html && !text)) {
      return res.status(400).json({ message: 'to and body content are required' });
    }

    // Find recipient user by email
    const recipientUser = await prisma.user.findFirst({
      where: {
        OR: [
          { email: { equals: to, mode: 'insensitive' } },
          { emails: { some: { recipient: { equals: to, mode: 'insensitive' } } } },
        ],
      },
    });

    if (!recipientUser) {
      // Fallback: match first available user
      const defaultUser = await prisma.user.findFirst();
      if (!defaultUser) {
        return res.status(404).json({ message: 'No destination user found' });
      }

      const created = await prisma.receivedEmail.create({
        data: {
          id: uuid(),
          userId: defaultUser.id,
          from: from || fromEmail || 'External Sender',
          fromEmail: fromEmail || from || 'external@sender.com',
          to,
          subject: subject || '(No Subject)',
          bodyHtml: html || `<p>${text}</p>`,
          bodyText: text || '',
          attachments: attachments || undefined,
          receivedAt: new Date(),
        },
      });

      return res.status(201).json({ ok: true, emailId: created.id });
    }

    const created = await prisma.receivedEmail.create({
      data: {
        id: uuid(),
        userId: recipientUser.id,
        from: from || fromEmail || 'External Sender',
        fromEmail: fromEmail || from || 'external@sender.com',
        to,
        subject: subject || '(No Subject)',
        bodyHtml: html || `<p>${text}</p>`,
        bodyText: text || '',
        attachments: attachments || undefined,
        receivedAt: new Date(),
      },
    });

    return res.status(201).json({ ok: true, emailId: created.id });
  } catch (err: any) {
    logger.error('inbox.inboundWebhook.error', { error: err.message });
    return res.status(500).json({ message: 'Failed to process inbound email' });
  }
}
