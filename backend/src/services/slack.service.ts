import axios from 'axios';
import { prisma } from '../config/db';
import { logger } from '../utils/logger';
import { env } from '../config/env';

/**
 * Post a notification message to the Slack channel.
 * Uses:
 * 1. Incoming Webhook URL (env.slackWebhookUrl) - instant, reliable, no OAuth scope hurdles
 * 2. User's Slack Bot OAuth Token (user.slackAccessToken) via chat.postMessage
 * Silently catches errors – never throws or interrupts background workers.
 */
export async function notifySlack(userId?: string | null, text: string = ''): Promise<boolean> {
  if (!text) return false;

  let dispatched = false;

  // Method 1: Incoming Webhook (Priority 1)
  const webhookUrl = env.slackWebhookUrl;
  if (webhookUrl) {
    try {
      const response = await axios.post(
        webhookUrl,
        { text },
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: 8000,
        }
      );
      if (response.status === 200) {
        logger.info('slack.webhook.sent', { textPreview: text.slice(0, 80) });
        dispatched = true;
      }
    } catch (webhookErr: any) {
      logger.warn('slack.webhook.failed', { error: webhookErr.message });
    }
  }

  // Method 2: User Slack OAuth Token (Fallback if user has linked OAuth and webhook not used)
  if (!dispatched && userId) {
    try {
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (user?.slackAccessToken && user.slackAccessToken !== 'webhook_connected') {
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
          dispatched = true;
        }
      }
    } catch (err: any) {
      logger.error('slack.oauth.error', { userId, error: err.message });
    }
  }

  return dispatched;
}
