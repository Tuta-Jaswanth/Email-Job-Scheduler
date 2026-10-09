import { Router, Request, Response } from 'express';
import axios from 'axios';
import { auth } from '../middleware/auth';
import { env } from '../config/env';
import { prisma } from '../config/db';
import { logger } from '../utils/logger';
import { notifySlack } from '../services/slack.service';

const router = Router();

type AuthRequest = Request & { user: { id: string } };

/**
 * Start Slack OAuth flow
 */
router.get('/connect', auth, (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user.id;

  if (!env.slackClientId || !env.slackRedirect) {
    logger.warn('slack.connect.missing_config');
    return res.redirect(`${env.frontendUrl}/?slack=error`);
  }

  const url = new URL('https://slack.com/oauth/v2/authorize');
  url.searchParams.set('client_id', env.slackClientId);
  url.searchParams.set('scope', 'chat:write,chat:write.public,incoming-webhook');
  url.searchParams.set('redirect_uri', env.slackRedirect);
  url.searchParams.set('state', userId);

  return res.redirect(url.toString());
});

/**
 * Slack OAuth Callback
 */
router.get('/callback', async (req: Request, res: Response) => {
  try {
    const code = String(req.query.code || '');
    const userId = String(req.query.state || '');

    if (!code || !userId) {
      logger.warn('slack.callback.missing_params');
      return res.redirect(`${env.frontendUrl}/?slack=error`);
    }

    const response = await axios.post(
      'https://slack.com/api/oauth.v2.access',
      new URLSearchParams({
        client_id: env.slackClientId,
        client_secret: env.slackClientSecret,
        code,
        redirect_uri: env.slackRedirect,
      }),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 10000,
      }
    );

    if (!response.data.ok) {
      logger.error('slack.oauth.failed', { error: response.data.error });
      return res.redirect(`${env.frontendUrl}/?slack=error`);
    }

    const accessToken = response.data.access_token;
    const webhookUrl = response.data.incoming_webhook?.url;
    // Prefer webhookUrl because it delivers directly to the channel selected by the user
    const storedToken = webhookUrl || accessToken;

    await prisma.user.update({
      where: { id: userId },
      data: { slackAccessToken: storedToken },
    });

    logger.info('slack.connected', { userId, hasWebhook: Boolean(webhookUrl) });

    // Send a real welcome message to confirm connection
    await notifySlack(
      userId,
      '🎉 *Slack Connected to ReachInbox!* You will receive real-time notifications here whenever a sender reaches their hourly rate limit.'
    ).catch(() => {});

    return res.redirect(`${env.frontendUrl}/?slack=connected`);
  } catch (error) {
    logger.error('slack.callback.error', { error: String(error) });
    return res.redirect(`${env.frontendUrl}/?slack=error`);
  }
});

/**
 * Connect Slack via Incoming Webhook URL
 */
router.post('/connect-webhook', auth, async (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user.id;
  const { webhookUrl } = req.body;

  if (!webhookUrl || typeof webhookUrl !== 'string' || !webhookUrl.includes('hooks.slack.com/services/')) {
    return res.status(400).json({ ok: false, message: 'Please provide a valid Slack webhook URL (https://hooks.slack.com/services/...)' });
  }

  await prisma.user.update({
    where: { id: userId },
    data: { slackAccessToken: webhookUrl.trim() },
  });

  // Verify immediately by posting to Slack
  const sent = await notifySlack(
    userId,
    '🎉 *Slack Connected to ReachInbox!* You will receive real-time notifications here whenever a sender reaches their hourly rate limit.'
  );

  return res.json({
    ok: true,
    verified: sent,
    message: sent ? 'Slack webhook connected and verified!' : 'Webhook saved, but delivery failed. Please check the URL.',
  });
});

/**
 * Disconnect Slack
 */
router.delete('/disconnect', auth, async (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user.id;
  await prisma.user.update({
    where: { id: userId },
    data: { slackAccessToken: null },
  });
  logger.info('slack.disconnected', { userId });
  return res.json({ ok: true, message: 'Slack workspace disconnected.' });
});

/**
 * Live Rate Limit Test Endpoint
 * Sends an actual rate limit alert to the user's Slack channel for demo verification
 */
router.post('/test-rate-limit', auth, async (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user.id;
  const user = await prisma.user.findUnique({ where: { id: userId } });

  if (!user || !user.slackAccessToken) {
    return res.status(400).json({
      ok: false,
      message: 'Slack is not connected for your account. Please click "Connect Slack" first.',
    });
  }

  const sender = await prisma.sender.findFirst();
  const senderEmail = sender?.email || user.email;
  const nextHour = new Date(Date.now() + 3600000).toISOString();
  const text =
    `⏳ *Hourly Rate Limit Reached* (Live Demo Alert)\n` +
    `• Sender: *${senderEmail}*\n` +
    `• Limit: *5 emails/hour*\n` +
    `• Status: *Allowed limit reached. Subsequent scheduled emails delayed until ${nextHour}.*`;

  const sent = await notifySlack(userId, text);
  return res.json({
    ok: sent,
    message: sent
      ? 'Live rate-limit notification sent to your Slack channel!'
      : 'Could not deliver notification. Check your Slack webhook/token permissions.',
  });
});

/**
 * General test endpoint
 */
router.all('/test', async (req: Request, res: Response) => {
  const message = req.body?.message || req.query?.message || '🔔 *ReachInbox Alert*: Slack notifications are successfully connected!';
  const sent = await notifySlack(null, String(message));
  return res.json({
    ok: sent,
    webhookConfigured: Boolean(env.slackWebhookUrl),
    message: sent ? 'Test notification sent to Slack successfully!' : 'Could not deliver to Slack.',
  });
});

/**
 * Check Slack status
 */
router.get('/status', (req: Request, res: Response) => {
  return res.json({
    webhookConfigured: Boolean(env.slackWebhookUrl),
    oauthConfigured: Boolean(env.slackClientId && env.slackClientSecret),
  });
});

export default router;
