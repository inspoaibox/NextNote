/**
 * 管理员路由
 */

import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, type AuthenticatedRequest } from '../middleware/auth';
import { asyncHandler, ValidationError, AuthorizationError } from '../middleware/error';
import { sanitizeInput } from '../utils/security';

const router = Router();
const prisma = new PrismaClient();

/**
 * 管理员权限中间件
 */
async function requireAdmin(req: AuthenticatedRequest, res: any, next: any) {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.userId },
    select: { role: true },
  });

  if (!user || user.role !== 'admin') {
    throw new AuthorizationError('Admin access required');
  }

  next();
}

// 所有路由都需要认证和管理员权限
router.use(authenticate);
router.use(asyncHandler(requireAdmin));

/**
 * 获取系统设置
 * GET /api/admin/settings
 */
router.get('/settings', asyncHandler(async (_req, res) => {
  let settings = await prisma.systemSettings.findUnique({
    where: { id: 'system' },
  });

  // 如果不存在，创建默认设置
  if (!settings) {
    settings = await prisma.systemSettings.create({
      data: { id: 'system' },
    });
  }

  res.json(settings);
}));

/**
 * 更新系统设置
 * PUT /api/admin/settings
 */
router.put('/settings', asyncHandler(async (req, res) => {
  const {
    siteName,
    siteDescription,
    allowRegistration,
    maxUsersLimit,
    maintenanceMode,
    maintenanceMessage,
  } = req.body;

  // 输入验证和清理
  const cleanSiteName = siteName ? sanitizeInput(String(siteName).slice(0, 100)) : undefined;
  const cleanSiteDescription = siteDescription ? sanitizeInput(String(siteDescription).slice(0, 500)) : undefined;
  const cleanMaintenanceMessage = maintenanceMessage ? sanitizeInput(String(maintenanceMessage).slice(0, 500)) : undefined;

  const settings = await prisma.systemSettings.upsert({
    where: { id: 'system' },
    update: {
      siteName: cleanSiteName,
      siteDescription: cleanSiteDescription,
      allowRegistration: allowRegistration !== undefined ? Boolean(allowRegistration) : undefined,
      maxUsersLimit: maxUsersLimit !== undefined ? Math.max(0, parseInt(maxUsersLimit) || 0) : undefined,
      maintenanceMode: maintenanceMode !== undefined ? Boolean(maintenanceMode) : undefined,
      maintenanceMessage: cleanMaintenanceMessage,
    },
    create: {
      id: 'system',
      siteName: cleanSiteName || 'Secure Notebook',
      siteDescription: cleanSiteDescription || 'End-to-end encrypted note-taking app',
      allowRegistration: allowRegistration ?? true,
      maxUsersLimit: maxUsersLimit !== undefined ? Math.max(0, parseInt(maxUsersLimit) || 0) : 0,
      maintenanceMode: maintenanceMode ?? false,
      maintenanceMessage: cleanMaintenanceMessage,
    },
  });

  res.json(settings);
}));

/**
 * 获取用户列表
 * GET /api/admin/users
 */
router.get('/users', asyncHandler(async (req, res) => {
  const { page = '1', limit = '20', search } = req.query;
  const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
  const take = parseInt(limit as string);

  const where = search
    ? { email: { contains: search as string, mode: 'insensitive' as const } }
    : {};

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            notes: true,
            folders: true,
            devices: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    }),
    prisma.user.count({ where }),
  ]);

  res.json({
    users: users.map((u) => ({
      ...u,
      noteCount: u._count.notes,
      folderCount: u._count.folders,
      deviceCount: u._count.devices,
    })),
    total,
    page: parseInt(page as string),
    totalPages: Math.ceil(total / take),
  });
}));

/**
 * 更新用户状态
 * PUT /api/admin/users/:id
 */
router.put('/users/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const authReq = req as AuthenticatedRequest;
  const { role, isActive } = req.body;

  // 不能修改自己的角色
  if (id === authReq.user!.userId && role !== undefined) {
    throw new ValidationError('Cannot change your own role');
  }

  const user = await prisma.user.update({
    where: { id },
    data: {
      role: role !== undefined ? role : undefined,
      isActive: isActive !== undefined ? isActive : undefined,
    },
    select: {
      id: true,
      email: true,
      role: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  res.json(user);
}));

/**
 * 删除用户
 * DELETE /api/admin/users/:id
 */
router.delete('/users/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const authReq = req as AuthenticatedRequest;

  // 不能删除自己
  if (id === authReq.user!.userId) {
    throw new ValidationError('Cannot delete your own account');
  }

  await prisma.user.delete({
    where: { id },
  });

  res.json({ success: true });
}));

/**
 * 获取系统统计
 * GET /api/admin/stats
 */
router.get('/stats', asyncHandler(async (_req, res) => {
  const [userCount, noteCount, folderCount, activeUsers] = await Promise.all([
    prisma.user.count(),
    prisma.note.count({ where: { isDeleted: false } }),
    prisma.folder.count({ where: { isDeleted: false } }),
    prisma.user.count({ where: { isActive: true } }),
  ]);

  // 最近7天的注册用户
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const recentUsers = await prisma.user.count({
    where: { createdAt: { gte: sevenDaysAgo } },
  });

  res.json({
    userCount,
    activeUsers,
    noteCount,
    folderCount,
    recentUsers,
  });
}));

export default router;
