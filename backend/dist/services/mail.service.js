"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendMail = sendMail;
exports.defaultCredentials = defaultCredentials;
const nodemailer_1 = __importDefault(require("nodemailer"));
const logger_1 = require("../utils/logger");
/**
 * Per-sender transporter pool.
 * Transporters are expensive to create (they open a TCP connection to the SMTP
 * server). We keep one transporter per unique (user, pass) pair and reuse it.
 */
const pool = new Map();
function buildTransporter(creds) {
    const key = `${creds.user}:${creds.host}:${creds.port}`;
    if (pool.has(key))
        return pool.get(key);
    const t = nodemailer_1.default.createTransport({
        host: creds.host,
        port: creds.port,
        secure: false, // Ethereal uses STARTTLS on port 587
        auth: { user: creds.user, pass: creds.pass },
        pool: true, // Keep TCP connections alive across multiple sends
        maxConnections: 5,
        rateDelta: 1000,
        rateLimit: 5, // max 5 messages per second per transporter
        socketTimeout: 30_000,
        connectionTimeout: 30_000,
        greetingTimeout: 15_000,
    });
    pool.set(key, t);
    logger_1.logger.info('smtp.transporter.created', { user: creds.user, host: creds.host });
    return t;
}
/**
 * Send a single email via Ethereal SMTP.
 * Returns the nodemailer SentMessageInfo (contains the preview URL for Ethereal).
 */
async function sendMail(opts) {
    const t = buildTransporter(opts.credentials);
    const mailPayload = {
        from: opts.credentials.from,
        to: opts.to,
        subject: opts.subject,
        html: opts.html,
    };
    if (opts.attachments && opts.attachments.length > 0) {
        mailPayload.attachments = opts.attachments;
    }
    const info = await t.sendMail(mailPayload);
    // Ethereal returns a preview URL – log it so the developer can see the email
    const previewUrl = nodemailer_1.default.getTestMessageUrl(info);
    logger_1.logger.info('smtp.sent', {
        to: opts.to,
        messageId: info.messageId,
        attachmentsCount: opts.attachments?.length || 0,
        ...(previewUrl ? { previewUrl } : {}),
    });
    return info;
}
/**
 * Convenience builder so callers can create credentials from env defaults.
 */
function defaultCredentials(env) {
    return {
        host: 'smtp.ethereal.email',
        port: 587,
        user: env.etherealUser,
        pass: env.etherealPass,
        from: env.etherealFrom,
    };
}
