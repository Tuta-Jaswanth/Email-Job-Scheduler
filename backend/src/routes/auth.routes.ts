import { Router, Request, Response } from 'express';
import { google } from 'googleapis';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { prisma } from '../config/db';
import { env } from '../config/env';

const router = Router();

const GOOGLE_SCOPES = ['openid', 'email', 'profile'];
const AUTH_COOKIE = 'reachinbox_auth';

function isProduction(): boolean {
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

export function getCallbackUrl(req?: Request): string {
  // If explicitly configured in env with non-localhost, use it
  if (env.googleCallback && !env.googleCallback.includes('localhost')) {
    return env.googleCallback;
  }
  // Otherwise resolve dynamically from request host if available
  if (req) {
    const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
    const proto = isHttps ? 'https' : req.protocol;
    const host = req.headers['x-forwarded-host'] || req.get('host');
    if (host && !host.includes('localhost')) {
      return `${proto}://${host}/auth/google/callback`;
    }
  }
  return env.googleCallback || 'https://reachinbox-hiring.onrender.com/auth/google/callback';
}

export function getGoogleOAuthClient(req?: Request) {
  const callbackUrl = getCallbackUrl(req);
  return new google.auth.OAuth2(
    env.googleClientId,
    env.googleClientSecret,
    callbackUrl,
  );
}

interface OAuthStatePayload {
  nonce: string;
  timestamp: number;
  returnTo: string;
}

function generateOAuthState(returnTo: string): string {
  const payload: OAuthStatePayload = {
    nonce: crypto.randomBytes(16).toString('hex'),
    timestamp: Date.now(),
    returnTo,
  };
  const jsonStr = JSON.stringify(payload);
  const sig = crypto.createHmac('sha256', env.jwtSecret).update(jsonStr).digest('hex');
  return Buffer.from(JSON.stringify({ data: jsonStr, sig })).toString('base64url');
}

function verifyOAuthState(stateStr: string): { valid: boolean; returnTo: string } {
  try {
    const raw = Buffer.from(stateStr, 'base64url').toString('utf8');
    const parsed = JSON.parse(raw);
    const { data, sig } = parsed;
    if (!data || !sig) return { valid: false, returnTo: '' };

    const expectedSig = crypto.createHmac('sha256', env.jwtSecret).update(data).digest('hex');
    const sigBuf = Buffer.from(sig);
    const expBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return { valid: false, returnTo: '' };
    }

    const payload: OAuthStatePayload = JSON.parse(data);
    // Expire state after 15 minutes
    if (Date.now() - payload.timestamp > 15 * 60 * 1000) {
      return { valid: false, returnTo: '' };
    }

    return { valid: true, returnTo: payload.returnTo };
  } catch {
    return { valid: false, returnTo: '' };
  }
}

function resolveReturnTo(req: Request): string {
  const queryReturnTo = typeof req.query.returnTo === 'string' ? req.query.returnTo : undefined;
  const referer = req.headers.referer;
  const candidate = queryReturnTo || referer;

  if (candidate) {
    try {
      const parsed = new URL(candidate);
      if (
        parsed.hostname === 'reachinbox-hiring.vercel.app' ||
        parsed.hostname.endsWith('.vercel.app') ||
        parsed.hostname === 'localhost' ||
        parsed.hostname === '127.0.0.1'
      ) {
        return `${parsed.protocol}//${parsed.host}`;
      }
    } catch {}
  }

  return env.frontendUrl;
}

/**
 * Start Authorization Code OAuth flow.
 * Uses stateless HMAC state to ensure 100% reliability across cross-domain redirects without cookie loss.
 */
router.get('/google', (req: Request, res: Response) => {
  try {
    const oauthClient = getGoogleOAuthClient(req);
    const returnTo = resolveReturnTo(req);
    const state = generateOAuthState(returnTo);

    const authorizationUrl = oauthClient.generateAuthUrl({
      access_type: 'online',
      scope: GOOGLE_SCOPES,
      include_granted_scopes: true,
      state,
      prompt: 'select_account',
    });

    return res.redirect(authorizationUrl);
  } catch (error) {
    console.error('Google OAuth start failed:', error);
    return res.status(500).json({ message: 'Google authentication initialization failed.' });
  }
});

/**
 * Google callback: exchange authorization code -> fetch profile -> issue JWT
 */
router.get(['/google/callback', '/callback/google'], async (req: Request, res: Response) => {
  const fallbackFrontend = env.frontendUrl;
  try {
    const { code, state, error } = req.query;

    if (error) {
      return res.redirect(`${fallbackFrontend}/?authError=${encodeURIComponent(String(error))}`);
    }

    if (typeof code !== 'string' || typeof state !== 'string') {
      return res.redirect(`${fallbackFrontend}/?authError=missing_oauth_response`);
    }

    const { valid, returnTo } = verifyOAuthState(state);
    const targetFrontend = returnTo || fallbackFrontend;

    if (!valid) {
      console.warn('OAuth state verification failed or expired');
      return res.redirect(`${targetFrontend}/?authError=invalid_oauth_state`);
    }

    const oauthClient = getGoogleOAuthClient(req);
    const { tokens } = await oauthClient.getToken(code);
    oauthClient.setCredentials(tokens);

    const oauth2 = google.oauth2({
      auth: oauthClient,
      version: 'v2',
    });

    const { data: profile } = await oauth2.userinfo.get();

    if (!profile.id || !profile.email || profile.verified_email !== true) {
      return res.redirect(`${targetFrontend}/?authError=google_email_not_verified`);
    }

    const email = profile.email.toLowerCase().trim();
    const name = profile.name?.trim() || email.split('@')[0];
    const avatar = profile.picture || null;

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

    const accessToken = jwt.sign(
      { sub: user.id, type: 'access' },
      env.jwtSecret,
      { expiresIn: '7d', issuer: 'reachinbox-api', audience: 'reachinbox-web' },
    );

    // Set cookie for browsers supporting third-party/same-site cookies
    res.cookie(AUTH_COOKIE, accessToken, {
      ...cookieOptions(),
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    // Dual return: Also pass token in URL so frontend can store in localStorage
    // This makes login 100% bulletproof even if Safari/Chrome blocks cross-domain cookies
    return res.redirect(`${targetFrontend}/?token=${accessToken}`);
  } catch (error) {
    console.error('Google OAuth callback failed:', error);
    return res.redirect(`${fallbackFrontend}/?authError=google_login_failed`);
  }
});

router.post('/logout', (req: Request, res: Response) => {
  res.clearCookie(AUTH_COOKIE, cookieOptions());
  res.json({ ok: true });
});

router.get('/google/status', (_req: Request, res: Response) => {
  res.json({ configured: Boolean(env.googleClientId && env.googleClientSecret) });
});

export default router;

