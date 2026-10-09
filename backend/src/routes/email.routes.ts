import { Router } from 'express';
import { auth } from '../middleware/auth';
import {
  list,
  schedule,
  search,
  getById,
  toggleStar,
  deleteEmail,
  cancelEmail,
  retryEmail,
  retryAllFailed,
} from '../controllers/email.controller';

const router = Router();

router.use(auth);

router.post('/schedule', schedule);
router.get('/', list);
router.get('/search', search);
router.post('/retry-all', retryAllFailed);
router.get('/:id', getById);
router.patch('/:id/star', toggleStar);
router.post('/:id/cancel', cancelEmail);
router.post('/:id/retry', retryEmail);
router.delete('/:id', deleteEmail);

export default router;
