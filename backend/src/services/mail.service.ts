import nodemailer, { Transporter } from 'nodemailer';
import { env } from '../config/env';
import { logger } from '../utils/logger';

interface SmtpCredentials {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
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
 * Send a single email via Ethereal SMTP with automatic fallback resilience.
 */
export async function sendMail(opts: SendMailOptions) {
  let user = opts.credentials.user || env.etherealUser;
  let pass = opts.credentials.pass || env.etherealPass;

  if (!user || !pass) {
    try {
      const testAccount = await nodemailer.createTestAccount();
      user = testAccount.user;
      pass = testAccount.pass;
    } catch {
      user = 'marjory.brown64@ethereal.email';
      pass = 'R34vyFT2nW45fDPTFT';
    }
  }

  // Create clean, dedicated transporter with STARTTLS on port 587
  const transporter = nodemailer.createTransport({
    host: opts.credentials.host || 'smtp.ethereal.email',
    port: Number(opts.credentials.port) || 587,
    secure: false,
    auth: { user, pass },
    tls: {
      rejectUnauthorized: false,
    },
    connectionTimeout: 20_000,
    socketTimeout: 30_000,
    greetingTimeout: 15_000,
  });

  const mailPayload: nodemailer.SendMailOptions = {
    from: opts.credentials.from,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
  };

  if (opts.attachments && opts.attachments.length > 0) {
    mailPayload.attachments = opts.attachments;
  }

  try {
    const info = await transporter.sendMail(mailPayload);
    const previewUrl = nodemailer.getTestMessageUrl(info);
    logger.info('smtp.sent', {
      to: opts.to,
      messageId: info.messageId,
      attachmentsCount: opts.attachments?.length || 0,
      ...(previewUrl ? { previewUrl } : {}),
    });
    return info;
  } catch (err: any) {
    logger.warn('smtp.send.initial_failed_attempting_fallback', { error: err.message });
    // Fallback: Provision a fresh Ethereal test account on the fly and send
    try {
      const freshAccount = await nodemailer.createTestAccount();
      const fallbackTransport = nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth: { user: freshAccount.user, pass: freshAccount.pass },
        tls: { rejectUnauthorized: false },
        connectionTimeout: 20_000,
      });

      const info = await fallbackTransport.sendMail(mailPayload);
      const previewUrl = nodemailer.getTestMessageUrl(info);
      logger.info('smtp.sent.fallback_success', {
        to: opts.to,
        messageId: info.messageId,
        ...(previewUrl ? { previewUrl } : {}),
      });
      return info;
    } catch (fallbackErr: any) {
      logger.error('smtp.send.all_attempts_failed', { error: fallbackErr.message });
      throw err;
    }
  }
}

export function defaultCredentials(envObj: {
  etherealUser: string;
  etherealPass: string;
  etherealFrom: string;
}): SmtpCredentials {
  return {
    host: 'smtp.ethereal.email',
    port: 587,
    user: envObj.etherealUser || 'marjory.brown64@ethereal.email',
    pass: envObj.etherealPass || 'R34vyFT2nW45fDPTFT',
    from: envObj.etherealFrom,
  };
}

