import { Router, Request, Response } from 'express';
import { auth } from '../middleware/auth';
import { prisma } from '../config/db';
import { env } from '../config/env';

const router = Router();

type AuthRequest = Request & { user: { id: string; email: string; name: string } };

router.get('/', auth, async (req: Request, res: Response) => {
  const user = (req as AuthRequest).user;

  // Clean up any legacy dummy oliver brown sender
  await prisma.sender.deleteMany({
    where: { email: 'oliver.brown@domain.io' },
  }).catch(() => {});

  let userSender = null;
  // Ensure current user has a sender entry configured with SMTP credentials
  if (user?.email) {
    userSender = await prisma.sender
      .upsert({
        where: { email: user.email },
        update: {
          name: user.name,
          etherealUser: env.etherealUser || 'marjory.brown64@ethereal.email',
          etherealPass: env.etherealPass || 'R34vyFT2nW45fDPTFT',
        },
        create: {
          email: user.email,
          name: user.name,
          etherealUser: env.etherealUser || 'marjory.brown64@ethereal.email',
          etherealPass: env.etherealPass || 'R34vyFT2nW45fDPTFT',
        },
        select: { id: true, email: true, name: true },
      })
      .catch(() => null);
  }

  // Return only the owner's sender account
  const senders = await prisma.sender.findMany({
    where: {
      email: user?.email ? user.email : { not: 'oliver.brown@domain.io' },
    },
    select: { id: true, email: true, name: true },
    orderBy: { createdAt: 'asc' },
  });

  return res.json(senders.length > 0 ? senders : userSender ? [userSender] : []);
});

export default router;
