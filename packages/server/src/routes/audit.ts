/**
 * 审计日志路由
 */

import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, type AuthenticatedRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/error';

const router = Router();
const prisma = new PrismaClient();

// 所有路由都需要认证
router.use(authenticate);

/**
 * 获取审计日志
 * GET /api/audit/logs
 */
router.get('/logs', asyncHandler(async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);
  
  const logs = await prisma.auditLog.findMany({
    where: {
      userId: authReq.user!.userId,
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      id: true,
      action: true,
      deviceId: true,
      encryptedIpAddress: true,
      userAgent: true,
      createdAt: true,
    },
  });
  
  res.json(logs.map((log) => ({
    id: log.id,
    action: log.action,
    deviceId: log.deviceId || '',
    ipAddress: log.encryptedIpAddress,
    userAgent: log.userAgent,
    createdAt: log.createdAt,
  })));
}));

export default router;
