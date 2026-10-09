import https from 'node:https';
import { prisma } from '../config/db';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { v4 as uuid } from 'uuid';

function requestHttps(
  url: string,
  options: { method?: string; headers?: Record<string, string> } = {},
  postData: string | null = null
): Promise<{ statusCode: number; headers: any; data: string }> {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const opts = {
      hostname: parsedUrl.hostname,
      port: 443,
      path: parsedUrl.pathname + parsedUrl.search,
      method: options.method || 'GET',
      headers: options.headers || {},
      timeout: 10000,
    };

    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode || 200,
          headers: res.headers,
          data,
        });
      });
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timed out to ' + url));
    });

    req.on('error', reject);
    if (postData) {
      req.write(postData);
    }
    req.end();
  });
}

/**
 * Connects to Ethereal web session, retrieves all messages in the Ethereal test mailbox,
 * and synchronizes any missing messages directly into the user's Inbox database.
 */
export async function syncEtherealMessagesForUser(
  userId: string,
  defaultToEmail?: string
): Promise<number> {
  const username = env.etherealUser || 'marjory.brown64@ethereal.email';
  const password = env.etherealPass || 'R34vyFT2nW45fDPTFT';

  try {
    // 1. Fetch login page to extract CSRF token and initial session cookie
    const getLogin = await requestHttps('https://ethereal.email/login');
    const cookies = getLogin.headers['set-cookie'] || [];
    const cookieMap: Record<string, string> = {};
    cookies.forEach((c: string) => {
      const [pair] = c.split(';');
      const [k, v] = pair.split('=');
      if (k && v) cookieMap[k.trim()] = v.trim();
    });

    const csrfMatch = getLogin.data.match(/name="_csrf"\s+value="([^"]+)"/);
    const csrf = csrfMatch ? csrfMatch[1] : null;

    const cookieHeader = Object.entries(cookieMap)
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');

    const postParams = new URLSearchParams({
      _csrf: csrf || '',
      address: username,
      password,
    }).toString();

    // 2. Submit credentials to authenticate
    const postLogin = await requestHttps(
      'https://ethereal.email/login',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': String(Buffer.byteLength(postParams)),
          Cookie: cookieHeader,
        },
      },
      postParams
    );

    const loginCookies = postLogin.headers['set-cookie'] || [];
    loginCookies.forEach((c: string) => {
      const [pair] = c.split(';');
      const [k, v] = pair.split('=');
      if (k && v) cookieMap[k.trim()] = v.trim();
    });

    const authedCookieHeader = Object.entries(cookieMap)
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');

    // 3. Fetch message list from /messages
    const getMessages = await requestHttps('https://ethereal.email/messages', {
      headers: { Cookie: authedCookieHeader },
    });

    const hrefMatches = [...getMessages.data.matchAll(/href="(\/messages\/[a-f0-9]+\/\d+)"/g)];
    const uniqueUrls = Array.from(new Set(hrefMatches.map((m) => m[1])));

    let newlyImported = 0;

    for (const relUrl of uniqueUrls) {
      try {
        const msgRes = await requestHttps(`https://ethereal.email${relUrl}`, {
          headers: { Cookie: authedCookieHeader },
        });

        const jsonMatch = msgRes.data.match(
          /var message = (\{[\s\S]*?\});\s*(?:<\/script>|document\.)/
        );
        if (!jsonMatch) continue;

        const rawJson = JSON.parse(jsonMatch[1]);
        const fromObj = Array.isArray(rawJson.from) && rawJson.from[0] ? rawJson.from[0] : null;
        const fromEmail = fromObj?.address || 'unknown@ethereal.email';
        const fromName = fromObj?.name || fromEmail.split('@')[0];
        const fromFormatted = fromObj?.name ? `${fromObj.name} <${fromEmail}>` : fromEmail;

        const toObj = Array.isArray(rawJson.to) && rawJson.to[0] ? rawJson.to[0] : null;
        const toEmail = toObj?.address || defaultToEmail || 'user@reachinbox.ai';

        const subject = rawJson.subject || '(No Subject)';
        const bodyHtml = Array.isArray(rawJson.html)
          ? rawJson.html.join('')
          : rawJson.html || `<p>${rawJson.text || ''}</p>`;
        const bodyText = rawJson.text || '';
        const receivedAt = rawJson.date ? new Date(rawJson.date) : new Date();

        // Check if message already exists in DB for this user
        const existing = await prisma.receivedEmail.findFirst({
          where: {
            userId,
            subject,
            fromEmail,
            receivedAt,
          },
        });

        if (!existing) {
          await prisma.receivedEmail.create({
            data: {
              id: uuid(),
              userId,
              from: fromFormatted,
              fromEmail,
              to: toEmail,
              subject,
              bodyHtml,
              bodyText,
              isRead: Boolean(rawJson.seen),
              isStarred: false,
              receivedAt,
            },
          });
          newlyImported++;
        }
      } catch (innerErr: any) {
        logger.warn('ethereal.sync.singleMessageError', { relUrl, error: innerErr.message });
      }
    }

    logger.info('ethereal.sync.completed', {
      userId,
      newlyImported,
      totalFound: uniqueUrls.length,
    });
    return newlyImported;
  } catch (err: any) {
    logger.warn('ethereal.sync.failed', { userId, error: err.message });
    return 0;
  }
}
