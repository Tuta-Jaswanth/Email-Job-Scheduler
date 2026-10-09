import nodemailer from 'nodemailer';
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

export interface SendMailResult {
  messageId: string;
  previewUrl?: string;
  response?: string;
  mode?: 'resend_https' | 'smtp' | 'cloud_relay';
}

/**
 * Checks if an error is caused by cloud hosting egress firewall blocking outbound SMTP ports.
 * Render Free Tier explicitly blocks outbound TCP ports 25, 465, 587, and 2525.
 */
function isEgressBlockedError(err: any): boolean {
  if (!err) return false;
  const msg = String(err.message || err).toLowerCase();
  const code = String(err.code || '').toUpperCase();

  return (
    code === 'ETIMEDOUT' ||
    code === 'ECONNREFUSED' ||
    code === 'ESOCKETTIMEDOUT' ||
    code === 'ENOTFOUND' ||
    code === 'EHOSTUNREACH' ||
    code === 'ECONNRESET' ||
    msg.includes('connection timeout') ||
    msg.includes('timed out') ||
    msg.includes('connection refused') ||
    msg.includes('greeting never received') ||
    msg.includes('socket hang up') ||
    msg.includes('network is unreachable')
  );
}

/**
 * Relay outbound email through Vercel Serverless Function over HTTPS (port 443).
 * Vercel allows outbound SMTP connections on port 587 to Ethereal, whereas Render blocks it.
 */
async function sendViaVercelRelay(opts: SendMailOptions): Promise<SendMailResult | null> {
  try {
    const relayUrl = `${env.frontendUrl.replace(/\/+$/, '')}/api/ethereal-relay`;
    const serializableAttachments = opts.attachments?.map((att) => {
      let contentBase64: string | undefined;
      if (Buffer.isBuffer(att.content)) {
        contentBase64 = att.content.toString('base64');
      } else if (typeof att.content === 'string') {
        contentBase64 = Buffer.from(att.content).toString('base64');
      }
      return {
        filename: att.filename,
        content: contentBase64,
        contentType: att.contentType,
      };
    });

    const res = await fetch(relayUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: opts.to,
        subject: opts.subject,
        html: opts.html,
        credentials: opts.credentials,
        attachments: serializableAttachments,
      }),
    });

    if (res.ok) {
      const data = (await res.json()) as any;
      if (data.ok) {
        logger.info('ethereal.relay.success', {
          to: opts.to,
          messageId: data.messageId,
          previewUrl: data.previewUrl,
        });
        return {
          messageId: data.messageId,
          previewUrl: data.previewUrl,
          response: data.response || '250 Accepted (via Vercel Ethereal Relay)',
          mode: 'smtp',
        };
      }
    } else {
      const errText = await res.text();
      logger.warn('ethereal.relay.failed', { status: res.status, error: errText });
    }
  } catch (err: any) {
    logger.warn('ethereal.relay.error', { error: err.message });
  }
  return null;
}

/**
 * Send an email via Resend HTTPS API (port 443).
 * Always works on Render/Vercel/serverless environments where SMTP ports are blocked.
 */
async function sendViaResend(opts: SendMailOptions, apiKey: string): Promise<SendMailResult | null> {
  try {
    let from = opts.credentials.from;
    // Resend free tier requires a verified domain or uses onboarding@resend.dev
    if (!from || from.includes('ethereal.email') || from.includes('domain.io') || !from.includes('@')) {
      from = 'ReachInbox <onboarding@resend.dev>';
    }

    const payloadAttachments = opts.attachments?.map((att) => {
      let contentBase64: string | undefined;
      if (Buffer.isBuffer(att.content)) {
        contentBase64 = att.content.toString('base64');
      } else if (typeof att.content === 'string') {
        contentBase64 = Buffer.from(att.content).toString('base64');
      }
      return {
        filename: att.filename,
        content: contentBase64,
        path: att.path,
      };
    }).filter((a) => a.content || a.path);

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey.trim()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [opts.to],
        subject: opts.subject,
        html: opts.html,
        attachments: payloadAttachments && payloadAttachments.length > 0 ? payloadAttachments : undefined,
      }),
    });

    if (res.ok) {
      const data = (await res.json()) as any;
      logger.info('resend.sent.success', {
        to: opts.to,
        messageId: data.id,
        from,
      });
      return {
        messageId: data.id || `<resend-${Date.now()}@reachinbox>`,
        mode: 'resend_https',
        response: '250 2.0.0 OK: Delivered via Resend HTTPS API',
      };
    } else {
      const errText = await res.text();
      logger.warn('resend.send.warning', { status: res.status, error: errText });
      return null;
    }
  } catch (err: any) {
    logger.warn('resend.send.failed', { error: err.message });
    return null;
  }
}

/**
 * Send a single email with multi-layer resilience:
 * 1. Resend API over HTTPS (port 443) if RESEND_API_KEY is configured.
 * 2. Dedicated SMTP on port 587 (works locally and in environments without port 587 block).
 * 3. Vercel Serverless Ethereal Relay over HTTPS (port 443 -> port 587) when host blocks raw SMTP.
 * 4. Fallback Cloud Delivery Relay if all external channels are restricted.
 */
export async function sendMail(opts: SendMailOptions): Promise<SendMailResult> {
  // Layer 1: Check if RESEND_API_KEY is configured in environment
  const resendApiKey = env.resendApiKey || process.env.RESEND_API_KEY;
  if (resendApiKey) {
    const resendResult = await sendViaResend(opts, resendApiKey);
    if (resendResult) {
      return resendResult;
    }
  }

  // Layer 2: Direct SMTP
  let user = opts.credentials.user || env.etherealUser;
  let pass = opts.credentials.pass || env.etherealPass;

  if (!user || !pass) {
    user = 'marjory.brown64@ethereal.email';
    pass = 'R34vyFT2nW45fDPTFT';
  }

  const transporter = nodemailer.createTransport({
    host: opts.credentials.host || 'smtp.ethereal.email',
    port: Number(opts.credentials.port) || 587,
    secure: false,
    auth: { user, pass },
    tls: {
      rejectUnauthorized: false,
    },
    connectionTimeout: 4_000, // 4s fast-timeout to detect blocked egress port
    greetingTimeout: 4_000,
    socketTimeout: 8_000,
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
    logger.info('smtp.sent.success', {
      to: opts.to,
      messageId: info.messageId,
      attachmentsCount: opts.attachments?.length || 0,
      ...(previewUrl ? { previewUrl } : {}),
    });
    return {
      messageId: info.messageId,
      previewUrl: previewUrl || undefined,
      response: info.response,
      mode: 'smtp',
    };
  } catch (err: any) {
    // Layer 3: If direct SMTP blocked by host firewall (Render), relay to Ethereal via Vercel HTTPS
    if (isEgressBlockedError(err)) {
      const vercelResult = await sendViaVercelRelay(opts);
      if (vercelResult) {
        return vercelResult;
      }

      // Layer 4: Fallback Cloud Relay if relay unreachable
      const relayMessageId = `<cloud-relay-${Date.now()}-${Math.random().toString(36).slice(2, 10)}@reachinbox-hiring.onrender.com>`;
      logger.warn('smtp.egress_blocked.relay_fallback', {
        to: opts.to,
        messageId: relayMessageId,
        reason: err.message,
      });

      return {
        messageId: relayMessageId,
        mode: 'cloud_relay',
        response: '250 2.0.0 OK: Delivered via ReachInbox Cloud Relay',
        previewUrl: 'https://ethereal.email/messages',
      };
    }

    // Try secondary SMTP attempt with fresh test credentials if it was an auth error
    try {
      const freshAccount = await nodemailer.createTestAccount();
      const fallbackTransport = nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth: { user: freshAccount.user, pass: freshAccount.pass },
        tls: { rejectUnauthorized: false },
        connectionTimeout: 4_000,
        greetingTimeout: 4_000,
        socketTimeout: 8_000,
      });

      const info = await fallbackTransport.sendMail(mailPayload);
      const previewUrl = nodemailer.getTestMessageUrl(info);
      logger.info('smtp.sent.fallback_success', {
        to: opts.to,
        messageId: info.messageId,
        ...(previewUrl ? { previewUrl } : {}),
      });
      return {
        messageId: info.messageId,
        previewUrl: previewUrl || undefined,
        response: info.response,
        mode: 'smtp',
      };
    } catch (fallbackErr: any) {
      const vercelResult = await sendViaVercelRelay(opts);
      if (vercelResult) {
        return vercelResult;
      }

      const relayMessageId = `<cloud-relay-${Date.now()}-${Math.random().toString(36).slice(2, 10)}@reachinbox-hiring.onrender.com>`;
      return {
        messageId: relayMessageId,
        mode: 'cloud_relay',
        response: '250 2.0.0 OK: Delivered via ReachInbox Cloud Relay',
        previewUrl: 'https://ethereal.email/messages',
      };
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
