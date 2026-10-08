"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.notifySlack = notifySlack;
const axios_1 = __importDefault(require("axios"));
const db_1 = require("../config/db");
const logger_1 = require("../utils/logger");
/**
 * Post a message to the user's connected Slack workspace.
 * Silently no-ops if the user has no Slack token – never throws.
 */
async function notifySlack(userId, text) {
    try {
        const user = await db_1.prisma.user.findUnique({ where: { id: userId } });
        if (!user?.slackAccessToken)
            return;
        const response = await axios_1.default.post('https://slack.com/api/chat.postMessage', { channel: '#general', text, unfurl_links: false }, {
            headers: { Authorization: `Bearer ${user.slackAccessToken}` },
            timeout: 8000,
        });
        if (!response.data.ok) {
            logger_1.logger.warn('slack.message.failed', { userId, error: response.data.error });
        }
        else {
            logger_1.logger.info('slack.message.sent', { userId });
        }
    }
    catch (err) {
        // Slack failures must never propagate and crash the email worker
        logger_1.logger.error('slack.message.error', { userId, error: String(err) });
    }
}
