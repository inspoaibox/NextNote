/**
 * 文件夹路由
 */

import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, type AuthenticatedRequest } from '../middleware/auth';
import { asyncHandler, ValidationError, NotFoundError, AuthorizationError } from '../middleware/error';
import type { CreateFolderRequest, UpdateFolderRequest } from '@secure-notebook/shared';
import { io } from '../index';
import { broadcastSyncEvent } from '../socket/sync-handler';

const router = Router();
const prisma = new PrismaClient();

// 所有路由都需要认证
router.use(authenticate);

const MAX_FOLDER_DEPTH = 10;

/**
 * 获取文件夹深度
 */
async function getFolderDepth(folderId: string): Promise<number> {
  let depth = 0;
  let currentId: string | null = folderId;
  
  while (currentId) {
    const folderResult = await prisma.folder.findUnique({
      where: { id: currentId },
      select: { parentId: true },
    });
    if (!folderResult) break;
    depth++;
    currentId = folderResult.parentId;
  }
  
  return depth;
}

/**
 * 创建文件夹
 * POST /api/folders
 */
router.post('/', asyncHandler(async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const body = req.body as CreateFolderRequest;
  
  if (!body.encryptedName) {
    throw new ValidationError('Missing required fields');
  }
  
  // 检查深度限制
  if (body.parentId) {
    const parentDepth = await getFolderDepth(body.parentId);
    if (parentDepth >= MAX_FOLDER_DEPTH) {
      throw new ValidationError('Maximum folder depth exceeded');
    }
  }
  
  // 获取同级文件夹的最大order
  const maxOrder = await prisma.folder.aggregate({
    where: {
      userId: authReq.user!.userId,
      parentId: body.parentId || null,
    },
    _max: { order: true },
  });
  
  const folder = await prisma.folder.create({
    data: {
      userId: authReq.user!.userId,
      encryptedName: JSON.stringify(body.encryptedName),
      parentId: body.parentId || null,
      order: (maxOrder._max.order || 0) + 1,
    },
  });
  
  // 广播同步事件
  broadcastSyncEvent(io, authReq.user!.userId, {
    type: 'folder',
    action: 'create',
    entityId: folder.id,
    data: {
      id: folder.id,
      encryptedName: body.encryptedName,
      parentId: folder.parentId,
      order: folder.order,
      hasPassword: folder.hasPassword,
      createdAt: folder.createdAt,
      updatedAt: folder.updatedAt,
    },
    syncVersion: folder.syncVersion,
    timestamp: Date.now(),
  });
  
  res.status(201).json({
    id: folder.id,
    syncVersion: folder.syncVersion,
    createdAt: folder.createdAt,
  });
}));

/**
 * 获取文件夹列表
 * GET /api/folders
 */
router.get('/', asyncHandler(async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const { includeDeleted } = req.query;
  
  const folders = await prisma.folder.findMany({
    where: {
      userId: authReq.user!.userId,
      isDeleted: includeDeleted === 'true' ? undefined : false,
    },
    include: {
      _count: {
        select: {
          notes: {
            where: { isDeleted: false },
          },
        },
      },
    },
    orderBy: [
      { parentId: 'asc' },
      { order: 'asc' },
    ],
  });
  
  res.json(folders.map((folder) => ({
    id: folder.id,
    encryptedName: JSON.parse(folder.encryptedName),
    parentId: folder.parentId,
    order: folder.order,
    hasPassword: folder.hasPassword,
    passwordInherited: folder.passwordInherited,
    syncVersion: folder.syncVersion,
    createdAt: folder.createdAt,
    updatedAt: folder.updatedAt,
    isDeleted: folder.isDeleted,
    noteCount: folder._count.notes,
  })));
}));

/**
 * 获取单个文件夹
 * GET /api/folders/:id
 */
router.get('/:id', asyncHandler(async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const { id } = req.params;
  
  const folder = await prisma.folder.findUnique({
    where: { id },
    include: {
      _count: {
        select: {
          notes: {
            where: { isDeleted: false },
          },
        },
      },
    },
  });
  
  if (!folder) {
    throw new NotFoundError('Folder not found');
  }
  
  if (folder.userId !== authReq.user!.userId) {
    throw new AuthorizationError('Access denied');
  }
  
  res.json({
    ...folder,
    encryptedName: JSON.parse(folder.encryptedName),
    noteCount: folder._count.notes,
  });
}));

/**
 * 更新文件夹
 * PUT /api/folders/:id
 */
router.put('/:id', asyncHandler(async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const { id } = req.params;
  const body = req.body as UpdateFolderRequest;
  
  const existingFolder = await prisma.folder.findUnique({
    where: { id },
  });
  
  if (!existingFolder) {
    throw new NotFoundError('Folder not found');
  }
  
  if (existingFolder.userId !== authReq.user!.userId) {
    throw new AuthorizationError('Access denied');
  }
  
  // 检查移动时的深度限制
  if (body.parentId !== undefined && body.parentId !== existingFolder.parentId) {
    if (body.parentId) {
      const parentDepth = await getFolderDepth(body.parentId);
      if (parentDepth >= MAX_FOLDER_DEPTH) {
        throw new ValidationError('Maximum folder depth exceeded');
      }
      
      // 检查是否移动到自己的子文件夹
      let checkId: string | null = body.parentId;
      while (checkId) {
        if (checkId === id) {
          throw new ValidationError('Cannot move folder into its own subfolder');
        }
        const checkFolderResult = await prisma.folder.findUnique({
          where: { id: checkId },
          select: { parentId: true },
        });
        checkId = checkFolderResult?.parentId || null;
      }
    }
  }
  
  const folder = await prisma.folder.update({
    where: { id },
    data: {
      encryptedName: body.encryptedName ? JSON.stringify(body.encryptedName) : undefined,
      parentId: body.parentId !== undefined ? body.parentId : undefined,
      order: body.order,
      syncVersion: { increment: 1 },
    },
  });
  
  // 广播同步事件
  broadcastSyncEvent(io, authReq.user!.userId, {
    type: 'folder',
    action: 'update',
    entityId: folder.id,
    data: {
      id: folder.id,
      encryptedName: body.encryptedName || JSON.parse(folder.encryptedName),
      parentId: folder.parentId,
      order: folder.order,
      hasPassword: folder.hasPassword,
      updatedAt: folder.updatedAt,
    },
    syncVersion: folder.syncVersion,
    timestamp: Date.now(),
  });
  
  res.json({
    id: folder.id,
    syncVersion: folder.syncVersion,
    updatedAt: folder.updatedAt,
  });
}));

/**
 * 删除文件夹（软删除，级联）
 * DELETE /api/folders/:id
 */
router.delete('/:id', asyncHandler(async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const { id } = req.params;
  
  const folder = await prisma.folder.findUnique({
    where: { id },
  });
  
  if (!folder) {
    throw new NotFoundError('Folder not found');
  }
  
  if (folder.userId !== authReq.user!.userId) {
    throw new AuthorizationError('Access denied');
  }
  
  // 递归获取所有子文件夹ID
  const getAllChildFolderIds = async (parentId: string): Promise<string[]> => {
    const children = await prisma.folder.findMany({
      where: { parentId, isDeleted: false },
      select: { id: true },
    });
    
    const childIds = children.map((c) => c.id);
    const grandchildIds = await Promise.all(
      childIds.map((childId) => getAllChildFolderIds(childId))
    );
    
    return [...childIds, ...grandchildIds.flat()];
  };
  
  const allFolderIds = [id, ...(await getAllChildFolderIds(id))];
  
  // 软删除所有文件夹
  await prisma.folder.updateMany({
    where: { id: { in: allFolderIds } },
    data: {
      isDeleted: true,
      deletedAt: new Date(),
    },
  });
  
  // 软删除所有笔记
  await prisma.note.updateMany({
    where: { folderId: { in: allFolderIds } },
    data: {
      isDeleted: true,
      deletedAt: new Date(),
    },
  });
  
  // 广播同步事件
  broadcastSyncEvent(io, authReq.user!.userId, {
    type: 'folder',
    action: 'delete',
    entityId: id,
    data: { deletedFolderIds: allFolderIds },
    syncVersion: folder.syncVersion + 1,
    timestamp: Date.now(),
  });
  
  res.json({ success: true });
}));

/**
 * 设置文件夹密码
 * POST /api/folders/:id/password
 */
router.post('/:id/password', asyncHandler(async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const { id } = req.params;
  const { passwordHash } = req.body;
  
  if (!passwordHash) {
    throw new ValidationError('Password hash is required');
  }
  
  const folder = await prisma.folder.findUnique({
    where: { id },
  });
  
  if (!folder) {
    throw new NotFoundError('Folder not found');
  }
  
  if (folder.userId !== authReq.user!.userId) {
    throw new AuthorizationError('Access denied');
  }
  
  await prisma.folder.update({
    where: { id },
    data: {
      hasPassword: true,
      passwordHash,
      syncVersion: { increment: 1 },
    },
  });
  
  res.json({ success: true });
}));

/**
 * 移除文件夹密码
 * DELETE /api/folders/:id/password
 */
router.delete('/:id/password', asyncHandler(async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const { id } = req.params;
  
  const folder = await prisma.folder.findUnique({
    where: { id },
  });
  
  if (!folder) {
    throw new NotFoundError('Folder not found');
  }
  
  if (folder.userId !== authReq.user!.userId) {
    throw new AuthorizationError('Access denied');
  }
  
  await prisma.folder.update({
    where: { id },
    data: {
      hasPassword: false,
      passwordHash: null,
      syncVersion: { increment: 1 },
    },
  });
  
  res.json({ success: true });
}));

/**
 * 验证文件夹密码
 * POST /api/folders/:id/password/verify
 */
router.post('/:id/password/verify', asyncHandler(async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const { id } = req.params;
  const { passwordHash } = req.body;
  
  if (!passwordHash) {
    throw new ValidationError('Password hash is required');
  }
  
  const folder = await prisma.folder.findUnique({
    where: { id },
  });
  
  if (!folder) {
    throw new NotFoundError('Folder not found');
  }
  
  if (folder.userId !== authReq.user!.userId) {
    throw new AuthorizationError('Access denied');
  }
  
  const isValid = folder.passwordHash === passwordHash;
  
  res.json({ valid: isValid });
}));

export default router;
