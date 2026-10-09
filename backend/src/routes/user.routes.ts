import { Router } from 'express';
import { auth } from '../middleware/auth';
import { env } from '../config/env';

const router = Router();

router.get('/me', auth, (req: any, res) => {
  const user = req.user;
  return res.json({
    ...user,
    slackAccessToken: user.slackAccessToken || (env.slackWebhookUrl ? 'webhook_connected' : null),
  });
});

export default router;
