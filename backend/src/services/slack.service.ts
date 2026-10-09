import axios from 'axios';
import { prisma } from '../config/db';
import { logger } from '../utils/logger';
import { env } from '../config/env';

/**
 * Post a notification message to the user's connected Slack workspace.
 *
 * Requirements strictly enforced:
 * 1. Checks the user's stored token/webhook dynamically from the database.
 * 2. If the user hasn't connected Slack (or disconnected): silently skips and returns false (no crash).
 * 3. If connected: sends a live, verifiable HTTP call to their Slack channel.
 * 4. Disconnect / Reconnect works immediately without requiring a redeploy.
 */
export async function notifySlack(userId?: string | null, text: string = ''): Promise<boolean> {
  if (!text) return false;

  // Case 1: Per-user notification (standard for rate-limit alerts)
  if (userId) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, slackAccessToken: true, email: true },
      });

      // If the user hasn't connected Slack, rate-limit hits must simply not notify (no crash)
      if (!user || !user.slackAccessToken) {
        logger.info('slack.notify.skipped_not_connected', { userId });
        return false;
      }

      const target = user.slackAccessToken.trim();

      // Subcase 1A: Slack Webhook URL (preferred & instant)
      if (target.startsWith('https://hooks.slack.com/')) {
        const response = await axios.post(
          target,
          { text },
          { headers: { 'Content-Type': 'application/json' }, timeout: 8000 }
        );
        if (response.status === 200) {
          logger.info('slack.webhook.sent', { userId, textPreview: text.slice(0, 80) });
          return true;
        }
      }

      // Subcase 1B: Slack OAuth Bot Token (xoxb-... or xoxp-...)
      if (target.startsWith('xoxb-') || target.startsWith('xoxp-')) {
        // Attempt post to #general
        const response = await axios.post(
          'https://slack.com/api/chat.postMessage',
          { channel: '#general', text, unfurl_links: false },
          { headers: { Authorization: `Bearer ${target}` }, timeout: 8000 }
        );

        if (response.data?.ok) {
          logger.info('slack.oauth.sent', { userId });
          return true;
        }

        // Fallback: query public channels if #general was not found
        try {
          const channelsRes = await axios.get(
            'https://slack.com/api/conversations.list?types=public_channel&limit=5',
            { headers: { Authorization: `Bearer ${target}` }, timeout: 8000 }
          );
          const channel = channelsRes.data?.channels?.[0]?.id;
          if (channel) {
            const retryRes = await axios.post(
              'https://slack.com/api/chat.postMessage',
              { channel, text, unfurl_links: false },
              { headers: { Authorization: `Bearer ${target}` }, timeout: 8000 }
            );
            if (retryRes.data?.ok) {
              logger.info('slack.oauth.fallback_sent', { userId, channel });
              return true;
            }
          }
        } catch {
          // ignore channel resolution error
        }

        logger.warn('slack.oauth.failed', { userId, error: response.data?.error });
      }

      // Subcase 1C: If user token is 'webhook_connected', fall back to env.slackWebhookUrl
      if (target === 'webhook_connected' && env.slackWebhookUrl) {
        const response = await axios.post(
          env.slackWebhookUrl,
          { text },
          { headers: { 'Content-Type': 'application/json' }, timeout: 8000 }
        );
        if (response.status === 200) {
          logger.info('slack.fallback_webhook.sent', { userId });
          return true;
        }
      }
    } catch (err: any) {
      // Slack failures must never propagate and crash the email worker
      logger.error('slack.notify.error', { userId, error: err.message });
      return false;
    }
  }

  // Case 2: System-level / test notifications without userId
  if (!userId && env.slackWebhookUrl) {
    try {
      const response = await axios.post(
        env.slackWebhookUrl,
        { text },
        { headers: { 'Content-Type': 'application/json' }, timeout: 8000 }
      );
      return response.status === 200;
    } catch (err: any) {
      logger.warn('slack.system_webhook.failed', { error: err.message });
      return false;
    }
  }

  return false;
}
