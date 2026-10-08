import { Router, Request, Response } from 'express';
import axios from 'axios';
import { auth } from '../middleware/auth';
import { env } from '../config/env';
import { prisma } from '../config/db';
import { logger } from '../utils/logger';

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
  url.searchParams.set('scope', 'chat:write,chat:write.public');
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
    await prisma.user.update({
      where: { id: userId },
      data: { slackAccessToken: accessToken },
    });

    logger.info('slack.connected', { userId });
    return res.redirect(`${env.frontendUrl}/?slack=connected`);
  } catch (error) {
    logger.error('slack.callback.error', { error: String(error) });
    return res.redirect(`${env.frontendUrl}/?slack=error`);
  }
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
  return res.json({ ok: true });
});

export default router;
