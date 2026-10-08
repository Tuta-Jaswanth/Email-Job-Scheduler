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
} from '../controllers/email.controller';

const router = Router();

router.use(auth);

router.post('/schedule', schedule);
router.get('/', list);
router.get('/search', search);
router.get('/:id', getById);
router.patch('/:id/star', toggleStar);
router.post('/:id/cancel', cancelEmail);
router.delete('/:id', deleteEmail);

export default router;
