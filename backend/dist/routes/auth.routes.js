"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.googleOAuthClient = void 0;
const express_1 = require("express");
const googleapis_1 = require("googleapis");
const node_crypto_1 = __importDefault(require("node:crypto"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const db_1 = require("../config/db");
const env_1 = require("../config/env");
const router = (0, express_1.Router)();
// Google only needs identity scopes for this assignment. We are not requesting
// Gmail/Drive access because the scheduler sends through Ethereal SMTP.
const GOOGLE_SCOPES = ['openid', 'email', 'profile'];
const AUTH_COOKIE = 'reachinbox_auth';
const STATE_COOKIE = 'reachinbox_oauth_state';
exports.googleOAuthClient = new googleapis_1.google.auth.OAuth2(env_1.env.googleClientId, env_1.env.googleClientSecret, env_1.env.googleCallback);
function isProduction() {
    return process.env.NODE_ENV === 'production' || Boolean(process.env.RENDER);
}
function cookieOptions() {
    const prod = isProduction();
    return {
        httpOnly: true,
        secure: prod,
        sameSite: prod ? 'none' : 'lax',
        path: '/',
    };
}
function assertGoogleConfigured() {
    if (!env_1.env.googleClientId || !env_1.env.googleClientSecret || !env_1.env.googleCallback) {
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
router.get('/google', (req, res) => {
    try {
        assertGoogleConfigured();
        const state = node_crypto_1.default.randomBytes(32).toString('hex');
        res.cookie(STATE_COOKIE, state, {
            ...cookieOptions(),
            signed: true,
            maxAge: 10 * 60 * 1000,
        });
        const authorizationUrl = exports.googleOAuthClient.generateAuthUrl({
            access_type: 'online',
            scope: GOOGLE_SCOPES,
            include_granted_scopes: true,
            state,
            prompt: 'select_account',
        });
        return res.redirect(authorizationUrl);
    }
    catch (error) {
        console.error('Google OAuth start failed:', error);
        return res.status(500).json({ message: 'Google authentication is not configured correctly.' });
    }
});
/**
 * Google callback: exchange authorization code -> fetch verified identity ->
 * create/update local user -> issue our own application session cookie.
 */
router.get(['/google/callback', '/callback/google'], async (req, res) => {
    try {
        assertGoogleConfigured();
        const { code, state, error } = req.query;
        if (error) {
            return res.redirect(`${env_1.env.frontendUrl}/?authError=${encodeURIComponent(String(error))}`);
        }
        if (typeof code !== 'string' || typeof state !== 'string') {
            return res.redirect(`${env_1.env.frontendUrl}/?authError=missing_oauth_response`);
        }
        const expectedState = req.signedCookies?.[STATE_COOKIE];
        res.clearCookie(STATE_COOKIE, cookieOptions());
        const stateMatches = Boolean(expectedState) &&
            Buffer.byteLength(expectedState) === Buffer.byteLength(state) &&
            node_crypto_1.default.timingSafeEqual(Buffer.from(expectedState), Buffer.from(state));
        if (!stateMatches) {
            return res.redirect(`${env_1.env.frontendUrl}/?authError=invalid_oauth_state`);
        }
        const { tokens } = await exports.googleOAuthClient.getToken(code);
        exports.googleOAuthClient.setCredentials(tokens);
        const oauth2 = googleapis_1.google.oauth2({
            auth: exports.googleOAuthClient,
            version: 'v2',
        });
        const { data: profile } = await oauth2.userinfo.get();
        if (!profile.id || !profile.email || profile.verified_email !== true) {
            return res.redirect(`${env_1.env.frontendUrl}/?authError=google_email_not_verified`);
        }
        const email = profile.email.toLowerCase().trim();
        const name = profile.name?.trim() || email.split('@')[0];
        const avatar = profile.picture || null;
        // Match by Google subject first. If this email already exists locally,
        // attach the Google identity to the existing account.
        const existingByGoogleId = await db_1.prisma.user.findUnique({
            where: { googleId: profile.id },
        });
        const user = existingByGoogleId
            ? await db_1.prisma.user.update({
                where: { id: existingByGoogleId.id },
                data: { name, email, avatar },
            })
            : await db_1.prisma.user.upsert({
                where: { email },
                update: { googleId: profile.id, name, avatar },
                create: { googleId: profile.id, email, name, avatar },
            });
        // This is our application's authentication token. Google's access token
        // is deliberately NOT sent to the browser and is not needed after login.
        const accessToken = jsonwebtoken_1.default.sign({ sub: user.id, type: 'access' }, env_1.env.jwtSecret, { expiresIn: '7d', issuer: 'reachinbox-api', audience: 'reachinbox-web' });
        res.cookie(AUTH_COOKIE, accessToken, {
            ...cookieOptions(),
            maxAge: 7 * 24 * 60 * 60 * 1000,
        });
        return res.redirect(env_1.env.frontendUrl);
    }
    catch (error) {
        console.error('Google OAuth callback failed:', error);
        return res.redirect(`${env_1.env.frontendUrl}/?authError=google_login_failed`);
    }
});
router.post('/logout', (req, res) => {
    res.clearCookie(AUTH_COOKIE, cookieOptions());
    res.json({ ok: true });
});
// Kept as a small health/config endpoint for local debugging. It does not
// expose client secrets.
router.get('/google/status', (_req, res) => {
    res.json({ configured: Boolean(env_1.env.googleClientId && env_1.env.googleClientSecret) });
});
exports.default = router;
