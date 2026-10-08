"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EMAIL_INDEX = exports.es = void 0;
exports.ensureIndex = ensureIndex;
exports.indexEmail = indexEmail;
exports.deleteEmailFromIndex = deleteEmailFromIndex;
exports.searchEmails = searchEmails;
const elasticsearch_1 = require("@elastic/elasticsearch");
const db_1 = require("../config/db");
const env_1 = require("../config/env");
const logger_1 = require("../utils/logger");
exports.es = new elasticsearch_1.Client({ node: env_1.env.esUrl });
exports.EMAIL_INDEX = 'emails';
/**
 * Create the ES index with explicit field mappings on first run.
 * Safe to call multiple times – the `exists` check prevents a 400.
 */
async function ensureIndex() {
    try {
        const exists = await exports.es.indices.exists({ index: exports.EMAIL_INDEX });
        if (exists)
            return;
        await exports.es.indices.create({
            index: exports.EMAIL_INDEX,
            mappings: {
                properties: {
                    userId: { type: 'keyword' },
                    senderId: { type: 'keyword' },
                    recipient: { type: 'text', fields: { keyword: { type: 'keyword' } } },
                    subject: { type: 'text' },
                    bodyHtml: { type: 'text' },
                    status: { type: 'keyword' },
                    isStarred: { type: 'boolean' },
                    scheduledAt: { type: 'date' },
                    sentAt: { type: 'date' },
                    failureReason: { type: 'text' },
                },
            },
        });
        logger_1.logger.info('elasticsearch.index.created', { index: exports.EMAIL_INDEX });
    }
    catch (err) {
        // resource_already_exists_exception is harmless (race on startup)
        if (err?.meta?.body?.error?.type !== 'resource_already_exists_exception') {
            logger_1.logger.warn('elasticsearch.index.notice', { message: 'Elasticsearch not reachable or index creation skipped; Postgres fallback active.' });
        }
    }
}
/** Index (upsert) a single email document. */
async function indexEmail(email) {
    try {
        await exports.es.index({
            index: exports.EMAIL_INDEX,
            id: email.id,
            document: {
                userId: email.userId,
                senderId: email.senderId,
                recipient: email.recipient,
                subject: email.subject,
                bodyHtml: email.bodyHtml,
                status: email.status,
                isStarred: Boolean(email.isStarred),
                scheduledAt: email.scheduledAt,
                sentAt: email.sentAt ?? null,
                failureReason: email.failureReason ?? null,
            },
        });
    }
    catch (err) {
        // Indexing failure must never crash the app/worker – log and move on
        logger_1.logger.warn('elasticsearch.index.skipped', { id: email.id });
    }
}
/** Delete an email document from the ES index. */
async function deleteEmailFromIndex(id) {
    try {
        await exports.es.delete({
            index: exports.EMAIL_INDEX,
            id,
        });
    }
    catch (err) {
        // Non-fatal
    }
}
/**
 * Full-text search across recipient, subject and body.
 * Results are scoped to `userId` for security.
 * Falls back to PostgreSQL if Elasticsearch is not configured or fails.
 */
async function searchEmails(query, userId, size = 50) {
    try {
        const response = await exports.es.search({
            index: exports.EMAIL_INDEX,
            size,
            query: {
                bool: {
                    must: {
                        multi_match: {
                            query,
                            fields: ['recipient^2', 'subject^1.5', 'bodyHtml'],
                            fuzziness: 'AUTO',
                        },
                    },
                    filter: [{ term: { userId } }],
                },
            },
        });
        return response.hits.hits.map((h) => ({
            id: h._id,
            ...h._source,
        }));
    }
    catch (err) {
        // Graceful fallback to PostgreSQL
        const emails = await db_1.prisma.email.findMany({
            where: {
                userId,
                OR: [
                    { recipient: { contains: query, mode: 'insensitive' } },
                    { subject: { contains: query, mode: 'insensitive' } },
                    { bodyHtml: { contains: query, mode: 'insensitive' } },
                ],
            },
            take: size,
            orderBy: { scheduledAt: 'desc' },
        });
        return emails.map((e) => ({
            id: e.id,
            userId: e.userId,
            recipient: e.recipient,
            subject: e.subject,
            status: e.status,
            isStarred: e.isStarred,
            scheduledAt: e.scheduledAt.toISOString(),
            sentAt: e.sentAt ? e.sentAt.toISOString() : null,
        }));
    }
}
