import axios from 'axios';
import { prisma } from '../config/db';
import { logger } from '../utils/logger';

/**
 * Post a message to the user's connected Slack workspace.
 * Silently no-ops if the user has no Slack token – never throws.
 */
export async function notifySlack(userId: string, text: string): Promise<void> {
  try {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user?.slackAccessToken) return;

    const response = await axios.post(
      'https://slack.com/api/chat.postMessage',
      { channel: '#general', text, unfurl_links: false },
      {
        headers: { Authorization: `Bearer ${user.slackAccessToken}` },
        timeout: 8000,
      },
    );

    if (!response.data.ok) {
      logger.warn('slack.message.failed', { userId, error: response.data.error });
    } else {
      logger.info('slack.message.sent', { userId });
    }
  } catch (err) {
    // Slack failures must never propagate and crash the email worker
    logger.error('slack.message.error', { userId, error: String(err) });
  }
}
