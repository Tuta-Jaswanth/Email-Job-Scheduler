import { Router } from 'express';
import { auth } from '../middleware/auth';
import {
  listReceived,
  getReceivedCounts,
  getReceivedById,
  setReadStatus,
  toggleReceivedStar,
  deleteReceived,
  simulateInbound,
  syncInbox,
  inboundWebhook,
} from '../controllers/inbox.controller';

const router = Router();

// Public inbound webhook for mail delivery ingestion (Resend/SendGrid/custom)
router.post('/incoming', inboundWebhook);

// Authenticated user endpoints
router.use(auth);

router.get('/', listReceived);
router.get('/counts', getReceivedCounts);
router.post('/sync', syncInbox);
router.post('/simulate', simulateInbound);
router.get('/:id', getReceivedById);
router.patch('/:id/read', setReadStatus);
router.patch('/:id/star', toggleReceivedStar);
router.delete('/:id', deleteReceived);

export default router;
