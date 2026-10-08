import { Client } from '@elastic/elasticsearch';
import { prisma } from '../config/db';
import { env } from '../config/env';
import { logger } from '../utils/logger';

export const es = new Client({ node: env.esUrl });

export const EMAIL_INDEX = 'emails';

/**
 * Create the ES index with explicit field mappings on first run.
 * Safe to call multiple times – the `exists` check prevents a 400.
 */
export async function ensureIndex(): Promise<void> {
  try {
    const exists = await es.indices.exists({ index: EMAIL_INDEX });
    if (exists) return;

    await es.indices.create({
      index: EMAIL_INDEX,
      mappings: {
        properties: {
          userId:    { type: 'keyword' },
          senderId:  { type: 'keyword' },
          recipient: { type: 'text', fields: { keyword: { type: 'keyword' } } },
          subject:   { type: 'text' },
          bodyHtml:  { type: 'text' },
          status:    { type: 'keyword' },
          isStarred: { type: 'boolean' },
          scheduledAt: { type: 'date' },
          sentAt:    { type: 'date' },
          failureReason: { type: 'text' },
        },
      },
    });

    logger.info('elasticsearch.index.created', { index: EMAIL_INDEX });
  } catch (err: any) {
    // resource_already_exists_exception is harmless (race on startup)
    if (err?.meta?.body?.error?.type !== 'resource_already_exists_exception') {
      logger.warn('elasticsearch.index.notice', { message: 'Elasticsearch not reachable or index creation skipped; Postgres fallback active.' });
    }
  }
}

/** Index (upsert) a single email document. */
export async function indexEmail(email: {
  id: string;
  userId: string;
  senderId: string;
  recipient: string;
  subject: string;
  bodyHtml: string;
  status: string;
  isStarred?: boolean;
  scheduledAt: Date | string;
  sentAt?: Date | string | null;
  failureReason?: string | null;
}): Promise<void> {
  try {
    await es.index({
      index: EMAIL_INDEX,
      id: email.id,
      document: {
        userId:       email.userId,
        senderId:     email.senderId,
        recipient:    email.recipient,
        subject:      email.subject,
        bodyHtml:     email.bodyHtml,
        status:       email.status,
        isStarred:    Boolean(email.isStarred),
        scheduledAt:  email.scheduledAt,
        sentAt:       email.sentAt ?? null,
        failureReason: email.failureReason ?? null,
      },
    });
  } catch (err) {
    // Indexing failure must never crash the app/worker – log and move on
    logger.warn('elasticsearch.index.skipped', { id: email.id });
  }
}

/** Delete an email document from the ES index. */
export async function deleteEmailFromIndex(id: string): Promise<void> {
  try {
    await es.delete({
      index: EMAIL_INDEX,
      id,
    });
  } catch (err: any) {
    // Non-fatal
  }
}

export interface SearchHit {
  id: string;
  userId: string;
  recipient: string;
  subject: string;
  status: string;
  isStarred?: boolean;
  scheduledAt: string;
  sentAt?: string | null;
}

/**
 * Full-text search across recipient, subject and body.
 * Results are scoped to `userId` for security.
 * Falls back to PostgreSQL if Elasticsearch is not configured or fails.
 */
export async function searchEmails(
  query: string,
  userId: string,
  size = 50,
): Promise<SearchHit[]> {
  try {
    const response = await es.search({
      index: EMAIL_INDEX,
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

    return response.hits.hits.map((h: any) => ({
      id: h._id,
      ...h._source,
    }));
  } catch (err) {
    // Graceful fallback to PostgreSQL
    const emails = await prisma.email.findMany({
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
