/**
 * 路由汇总
 */

import { Router } from 'express';
import authRoutes from './auth';
import notesRoutes from './notes';
import foldersRoutes from './folders';
import auditRoutes from './audit';
import adminRoutes from './admin';
import syncRoutes from './sync';

const router = Router();

router.use('/auth', authRoutes);
router.use('/notes', notesRoutes);
router.use('/folders', foldersRoutes);
router.use('/audit', auditRoutes);
router.use('/admin', adminRoutes);
router.use('/sync', syncRoutes);

export default router;
