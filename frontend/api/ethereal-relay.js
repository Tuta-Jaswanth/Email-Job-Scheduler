import nodemailer from 'nodemailer';

export default async function handler(req, res) {
  // CORS configuration
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'GET') {
    return res.status(200).json({ ok: true, service: 'ReachInbox Ethereal Cloud Relay' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const { to, subject, html, credentials, attachments } = req.body || {};

    if (!to || !subject) {
      return res.status(400).json({ ok: false, error: 'to and subject are required' });
    }

    const user = credentials?.user || process.env.ETHEREAL_USER || 'marjory.brown64@ethereal.email';
    const pass = credentials?.pass || process.env.ETHEREAL_PASSWORD || 'R34vyFT2nW45fDPTFT';
    const host = credentials?.host || 'smtp.ethereal.email';
    const port = Number(credentials?.port) || 587;
    const from = credentials?.from || 'tuta jaswanth <jaswanthtuta93@gmail.com>';

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: false,
      auth: { user, pass },
      tls: { rejectUnauthorized: false },
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 20000,
    });

    const mailOptions = {
      from,
      to,
      subject,
      html,
    };

    if (Array.isArray(attachments) && attachments.length > 0) {
      mailOptions.attachments = attachments.map((att) => {
        if (att.content && typeof att.content === 'string') {
          return {
            filename: att.filename,
            content: Buffer.from(att.content, 'base64'),
            contentType: att.contentType,
          };
        }
        return att;
      });
    }

    const info = await transporter.sendMail(mailOptions);
    const previewUrl = nodemailer.getTestMessageUrl(info);

    return res.status(200).json({
      ok: true,
      messageId: info.messageId,
      previewUrl: previewUrl || undefined,
      response: info.response,
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err.message,
      code: err.code,
    });
  }
}
