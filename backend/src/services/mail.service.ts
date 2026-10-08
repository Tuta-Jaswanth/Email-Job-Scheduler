import nodemailer, { Transporter } from 'nodemailer';
import { logger } from '../utils/logger';

interface SmtpCredentials {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
}

/**
 * Per-sender transporter pool.
 * Transporters are expensive to create (they open a TCP connection to the SMTP
 * server). We keep one transporter per unique (user, pass) pair and reuse it.
 */
const pool = new Map<string, Transporter>();

function buildTransporter(creds: SmtpCredentials): Transporter {
  const key = `${creds.user}:${creds.host}:${creds.port}`;

  if (pool.has(key)) return pool.get(key)!;

  const t = nodemailer.createTransport({
    host: creds.host,
    port: creds.port,
    secure: false,           // Ethereal uses STARTTLS on port 587
    auth: { user: creds.user, pass: creds.pass },
    pool: true,              // Keep TCP connections alive across multiple sends
    maxConnections: 5,
    rateDelta: 1000,
    rateLimit: 5,            // max 5 messages per second per transporter
    socketTimeout: 30_000,
    connectionTimeout: 30_000,
    greetingTimeout: 15_000,
  });

  pool.set(key, t);
  logger.info('smtp.transporter.created', { user: creds.user, host: creds.host });
  return t;
}

export interface AttachmentOption {
  filename: string;
  content?: Buffer | string;
  path?: string;
  contentType?: string;
}

export interface SendMailOptions {
  to: string;
  subject: string;
  html: string;
  credentials: SmtpCredentials;
  attachments?: AttachmentOption[];
}

/**
 * Send a single email via Ethereal SMTP.
 * Returns the nodemailer SentMessageInfo (contains the preview URL for Ethereal).
 */
export async function sendMail(opts: SendMailOptions) {
  const t = buildTransporter(opts.credentials);

  const mailPayload: nodemailer.SendMailOptions = {
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
  const previewUrl = nodemailer.getTestMessageUrl(info);
  logger.info('smtp.sent', {
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
export function defaultCredentials(env: {
  etherealUser: string;
  etherealPass: string;
  etherealFrom: string;
}): SmtpCredentials {
  return {
    host: 'smtp.ethereal.email',
    port: 587,
    user: env.etherealUser,
    pass: env.etherealPass,
    from: env.etherealFrom,
  };
}
