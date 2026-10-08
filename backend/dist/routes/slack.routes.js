"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const axios_1 = __importDefault(require("axios"));
const auth_1 = require("../middleware/auth");
const env_1 = require("../config/env");
const db_1 = require("../config/db");
const logger_1 = require("../utils/logger");
const router = (0, express_1.Router)();
/**
 * Start Slack OAuth flow
 */
router.get('/connect', auth_1.auth, (req, res) => {
    const userId = req.user.id;
    if (!env_1.env.slackClientId || !env_1.env.slackRedirect) {
        logger_1.logger.warn('slack.connect.missing_config');
        return res.redirect(`${env_1.env.frontendUrl}/?slack=error`);
    }
    const url = new URL('https://slack.com/oauth/v2/authorize');
    url.searchParams.set('client_id', env_1.env.slackClientId);
    url.searchParams.set('scope', 'chat:write,chat:write.public');
    url.searchParams.set('redirect_uri', env_1.env.slackRedirect);
    url.searchParams.set('state', userId);
    return res.redirect(url.toString());
});
/**
 * Slack OAuth Callback
 */
router.get('/callback', async (req, res) => {
    try {
        const code = String(req.query.code || '');
        const userId = String(req.query.state || '');
        if (!code || !userId) {
            logger_1.logger.warn('slack.callback.missing_params');
            return res.redirect(`${env_1.env.frontendUrl}/?slack=error`);
        }
        const response = await axios_1.default.post('https://slack.com/api/oauth.v2.access', new URLSearchParams({
            client_id: env_1.env.slackClientId,
            client_secret: env_1.env.slackClientSecret,
            code,
            redirect_uri: env_1.env.slackRedirect,
        }), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            timeout: 10000,
        });
        if (!response.data.ok) {
            logger_1.logger.error('slack.oauth.failed', { error: response.data.error });
            return res.redirect(`${env_1.env.frontendUrl}/?slack=error`);
        }
        const accessToken = response.data.access_token;
        await db_1.prisma.user.update({
            where: { id: userId },
            data: { slackAccessToken: accessToken },
        });
        logger_1.logger.info('slack.connected', { userId });
        return res.redirect(`${env_1.env.frontendUrl}/?slack=connected`);
    }
    catch (error) {
        logger_1.logger.error('slack.callback.error', { error: String(error) });
        return res.redirect(`${env_1.env.frontendUrl}/?slack=error`);
    }
});
/**
 * Disconnect Slack
 */
router.delete('/disconnect', auth_1.auth, async (req, res) => {
    const userId = req.user.id;
    await db_1.prisma.user.update({
        where: { id: userId },
        data: { slackAccessToken: null },
    });
    logger_1.logger.info('slack.disconnected', { userId });
    return res.json({ ok: true });
});
exports.default = router;
