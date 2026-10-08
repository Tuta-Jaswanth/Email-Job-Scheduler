"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.schedule = schedule;
exports.list = list;
exports.getById = getById;
exports.toggleStar = toggleStar;
exports.deleteEmail = deleteEmail;
exports.cancelEmail = cancelEmail;
exports.search = search;
const db_1 = require("../config/db");
const email_queue_1 = require("../queues/email.queue");
const search_service_1 = require("../services/search.service");
const logger_1 = require("../utils/logger");
const uuid_1 = require("uuid");
// ── Schedule ─────────────────────────────────────────────────────────────────
async function schedule(req, res) {
    const { subject, bodyHtml, recipients, startTime, delayBetweenEmails = 2000, hourlyLimit, senderId, attachments, } = req.body;
    const userId = req.user.id;
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
        sender = await db_1.prisma.sender.findUnique({ where: { id: senderId } });
        if (!sender) {
            return res.status(400).json({ message: `Sender ${senderId} not found` });
        }
    }
    else {
        sender = await db_1.prisma.sender.findFirst();
        if (!sender) {
            return res.status(400).json({ message: 'No senders configured. Add a sender first.' });
        }
    }
    const start = new Date(startTime || Date.now() + 60_000);
    const delayMs = Math.max(0, Number(delayBetweenEmails));
    const limit = Number(hourlyLimit) || 0;
    const created = [];
    for (let i = 0; i < recipients.length; i++) {
        const id = (0, uuid_1.v4)();
        const scheduledAt = new Date(start.getTime() + i * delayMs);
        const email = await db_1.prisma.email.create({
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
        const job = await email_queue_1.emailQueue.add('send-email', { emailId: id, userId, senderId: sender.id, hourlyLimit: limit }, {
            jobId: `email_${id}`, // Idempotency key: prevents duplicate jobs
            delay: Math.max(0, scheduledAt.getTime() - Date.now()),
            attempts: 5,
            backoff: { type: 'exponential', delay: 30_000 },
            removeOnComplete: { count: 1000, age: 7 * 86400 },
            removeOnFail: { count: 500, age: 30 * 86400 },
        });
        await db_1.prisma.email.update({ where: { id }, data: { bullJobId: job.id } });
        await (0, search_service_1.indexEmail)({ ...email, status: 'SCHEDULED' });
        created.push(id);
    }
    logger_1.logger.info('controller.schedule', { userId, count: created.length, senderId: sender.id });
    return res.status(201).json({ count: created.length, ids: created });
}
// ── List ──────────────────────────────────────────────────────────────────────
async function list(req, res) {
    const userId = req.user.id;
    const isSent = req.query.status === 'sent';
    const onlyStarred = req.query.starred === 'true';
    const statusFilter = isSent
        ? { in: ['SENT', 'FAILED'] }
        : { in: ['SCHEDULED', 'PROCESSING'] };
    const whereClause = {
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
        db_1.prisma.email.count({ where: whereClause }),
        db_1.prisma.email.findMany({
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
async function getById(req, res) {
    const userId = req.user.id;
    const email = await db_1.prisma.email.findUnique({
        where: { id: String(req.params.id) },
        include: { sender: { select: { id: true, email: true, name: true } } },
    });
    if (!email || email.userId !== userId) {
        return res.status(404).json({ message: 'Email not found' });
    }
    return res.json(email);
}
// ── Toggle Favourite / Star ───────────────────────────────────────────────────
async function toggleStar(req, res) {
    const userId = req.user.id;
    const email = await db_1.prisma.email.findUnique({
        where: { id: String(req.params.id) },
        include: { sender: true },
    });
    if (!email || email.userId !== userId) {
        return res.status(404).json({ message: 'Email not found' });
    }
    const updated = await db_1.prisma.email.update({
        where: { id: email.id },
        data: { isStarred: !email.isStarred },
        include: { sender: { select: { id: true, email: true, name: true } } },
    });
    await (0, search_service_1.indexEmail)(updated);
    logger_1.logger.info('controller.toggleStar', { emailId: email.id, isStarred: updated.isStarred, userId });
    return res.json(updated);
}
// ── Delete Email ─────────────────────────────────────────────────────────────
async function deleteEmail(req, res) {
    const userId = req.user.id;
    const email = await db_1.prisma.email.findUnique({ where: { id: String(req.params.id) } });
    if (!email || email.userId !== userId) {
        return res.status(404).json({ message: 'Email not found' });
    }
    // If email was queued in BullMQ, cancel and remove the job
    if (email.bullJobId) {
        try {
            const job = await email_queue_1.emailQueue.getJob(email.bullJobId);
            await job?.remove();
        }
        catch {
            // Job might already be processed or removed
        }
    }
    // Delete from PostgreSQL
    await db_1.prisma.email.delete({
        where: { id: email.id },
    });
    // Delete from Elasticsearch
    await (0, search_service_1.deleteEmailFromIndex)(email.id);
    logger_1.logger.info('controller.delete', { emailId: email.id, userId });
    return res.json({ ok: true, deletedId: email.id });
}
// ── Cancel (scheduled emails only) ───────────────────────────────────────────
async function cancelEmail(req, res) {
    const userId = req.user.id;
    const email = await db_1.prisma.email.findUnique({ where: { id: String(req.params.id) } });
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
            const job = await email_queue_1.emailQueue.getJob(email.bullJobId);
            await job?.remove();
        }
        catch {
            // Job may already be gone – that's fine
        }
    }
    const cancelled = await db_1.prisma.email.update({
        where: { id: email.id },
        data: { status: 'FAILED', failureReason: 'Cancelled by user' },
        include: { sender: { select: { id: true, email: true, name: true } } },
    });
    await (0, search_service_1.indexEmail)({ ...cancelled, status: 'FAILED' });
    logger_1.logger.info('controller.cancel', { emailId: email.id, userId });
    return res.json({ ok: true });
}
// ── Search ────────────────────────────────────────────────────────────────────
async function search(req, res) {
    const userId = req.user.id;
    const q = String(Array.isArray(req.query.q) ? req.query.q[0] : (req.query.q ?? '')).trim();
    if (!q) {
        return res.status(400).json({ message: 'Query parameter "q" is required' });
    }
    const results = await (0, search_service_1.searchEmails)(q, userId);
    return res.json(results);
}
