import { Router, Request, Response } from 'express';
import { google } from 'googleapis';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import cookieParser from 'cookie-parser';
import { prisma } from '../config/db';
import { env } from '../config/env';

const router = Router();

// Google only needs identity scopes for this assignment. We are not requesting
// Gmail/Drive access because the scheduler sends through Ethereal SMTP.
const GOOGLE_SCOPES = ['openid', 'email', 'profile'];
const AUTH_COOKIE = 'reachinbox_auth';
const STATE_COOKIE = 'reachinbox_oauth_state';

export const googleOAuthClient = new google.auth.OAuth2(
  env.googleClientId,
  env.googleClientSecret,
  env.googleCallback,
);

function isProduction() {
  return process.env.NODE_ENV === 'production' || Boolean(process.env.RENDER);
}

function cookieOptions() {
  const prod = isProduction();
  return {
    httpOnly: true,
    secure: prod,
    sameSite: prod ? ('none' as const) : ('lax' as const),
    path: '/',
  };
}

function assertGoogleConfigured() {
  if (!env.googleClientId || !env.googleClientSecret || !env.googleCallback) {
    throw new Error('Google OAuth is not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and GOOGLE_CALLBACK_URL.');
  }
}

/**
 * Start Authorization Code OAuth flow.
 *
 * The state value is generated per login attempt and stored in an HttpOnly,
 * signed cookie. The callback must present the same state, protecting the
 * authorization flow against CSRF/login-CSRF attacks.
 */
router.get('/google', (req: Request, res: Response) => {
  try {
    assertGoogleConfigured();

    const state = crypto.randomBytes(32).toString('hex');

    res.cookie(STATE_COOKIE, state, {
      ...cookieOptions(),
      signed: true,
      maxAge: 10 * 60 * 1000,
    });

    const authorizationUrl = googleOAuthClient.generateAuthUrl({
      access_type: 'online',
      scope: GOOGLE_SCOPES,
      include_granted_scopes: true,
      state,
      prompt: 'select_account',
    });

    return res.redirect(authorizationUrl);
  } catch (error) {
    console.error('Google OAuth start failed:', error);
    return res.status(500).json({ message: 'Google authentication is not configured correctly.' });
  }
});

/**
 * Google callback: exchange authorization code -> fetch verified identity ->
 * create/update local user -> issue our own application session cookie.
 */
router.get(['/google/callback', '/callback/google'], async (req: Request, res: Response) => {
  try {
    assertGoogleConfigured();

    const { code, state, error } = req.query;

    if (error) {
      return res.redirect(`${env.frontendUrl}/?authError=${encodeURIComponent(String(error))}`);
    }

    if (typeof code !== 'string' || typeof state !== 'string') {
      return res.redirect(`${env.frontendUrl}/?authError=missing_oauth_response`);
    }

    const expectedState = req.signedCookies?.[STATE_COOKIE];
    res.clearCookie(STATE_COOKIE, cookieOptions());

    const stateMatches = Boolean(expectedState) &&
      Buffer.byteLength(expectedState) === Buffer.byteLength(state) &&
      crypto.timingSafeEqual(Buffer.from(expectedState), Buffer.from(state));

    if (!stateMatches) {
      return res.redirect(`${env.frontendUrl}/?authError=invalid_oauth_state`);
    }

    const { tokens } = await googleOAuthClient.getToken(code);
    googleOAuthClient.setCredentials(tokens);

    const oauth2 = google.oauth2({
      auth: googleOAuthClient,
      version: 'v2',
    });

    const { data: profile } = await oauth2.userinfo.get();

    if (!profile.id || !profile.email || profile.verified_email !== true) {
      return res.redirect(`${env.frontendUrl}/?authError=google_email_not_verified`);
    }

    const email = profile.email.toLowerCase().trim();
    const name = profile.name?.trim() || email.split('@')[0];
    const avatar = profile.picture || null;

    // Match by Google subject first. If this email already exists locally,
    // attach the Google identity to the existing account.
    const existingByGoogleId = await prisma.user.findUnique({
      where: { googleId: profile.id },
    });

    const user = existingByGoogleId
      ? await prisma.user.update({
          where: { id: existingByGoogleId.id },
          data: { name, email, avatar },
        })
      : await prisma.user.upsert({
          where: { email },
          update: { googleId: profile.id, name, avatar },
          create: { googleId: profile.id, email, name, avatar },
        });

    // This is our application's authentication token. Google's access token
    // is deliberately NOT sent to the browser and is not needed after login.
    const accessToken = jwt.sign(
      { sub: user.id, type: 'access' },
      env.jwtSecret,
      { expiresIn: '7d', issuer: 'reachinbox-api', audience: 'reachinbox-web' },
    );

    res.cookie(AUTH_COOKIE, accessToken, {
      ...cookieOptions(),
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res.redirect(env.frontendUrl);
  } catch (error) {
    console.error('Google OAuth callback failed:', error);
    return res.redirect(`${env.frontendUrl}/?authError=google_login_failed`);
  }
});

router.post('/logout', (req: Request, res: Response) => {
  res.clearCookie(AUTH_COOKIE, cookieOptions());
  res.json({ ok: true });
});

// Kept as a small health/config endpoint for local debugging. It does not
// expose client secrets.
router.get('/google/status', (_req: Request, res: Response) => {
  res.json({ configured: Boolean(env.googleClientId && env.googleClientSecret) });
});

export default router;
