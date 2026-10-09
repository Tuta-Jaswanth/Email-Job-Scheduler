import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { prisma } from '../config/db';

const AUTH_COOKIE = 'reachinbox_auth';

type AccessTokenPayload = jwt.JwtPayload & {
  sub: string;
  type?: string;
};

export async function auth(req: Request, res: Response, next: NextFunction) {
  const bearer = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.substring('Bearer '.length)
    : undefined;

  // Cookie is the normal browser path. Bearer is retained for API/Postman use. Query token supports top-level navigation links.
  const queryToken = typeof req.query.token === 'string' ? req.query.token : undefined;
  const token = req.signedCookies?.[AUTH_COOKIE] || req.cookies?.[AUTH_COOKIE] || bearer || queryToken;

  if (!token) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  try {
    const payload = jwt.verify(token, env.jwtSecret, {
      issuer: 'reachinbox-api',
      audience: 'reachinbox-web',
    }) as AccessTokenPayload;

    if (!payload.sub) {
      return res.status(401).json({ message: 'Invalid authentication token' });
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
    });

    if (!user) {
      return res.status(401).json({ message: 'User no longer exists' });
    }

    (req as any).user = user;
    return next();
  } catch {
    return res.status(401).json({ message: 'Invalid or expired authentication token' });
  }
}
