/**
 * 同步路由
 * 处理数据同步相关的 REST API
 */

import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, type AuthenticatedRequest } from '../middleware/auth';
import { asyncHandler, ValidationError } from '../middleware/error';

const router = Router();
const prisma = new PrismaClient();

router.use(authenticate);

/**
 * 获取自上次同步以来的变更
 * GET /api/sync/changes?since=timestamp
 */
router.get('/changes', asyncHandler(async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const since = parseInt(req.query.since as string) || 0;
  const sinceDate = new Date(since);

  // 获取更新的笔记
  const notes = await prisma.note.findMany({
    where: {
      userId: authReq.user!.userId,
      updatedAt: { gt: sinceDate },
    },
    select: {
      id: true,
      encryptedTitle: true,
      encryptedContent: true,
      encryptedDEK: true,
      folderId: true,
      isPinned: true,
      pinnedAt: true,
      hasPassword: true,
      syncVersion: true,
      createdAt: true,
      updatedAt: true,
      isDeleted: true,
      tags: { select: { tag: true } },
    },
  });

  // 获取更新的文件夹
  const folders = await prisma.folder.findMany({
    where: {
      userId: authReq.user!.userId,
      updatedAt: { gt: sinceDate },
    },
    select: {
      id: true,
      encryptedName: true,
      parentId: true,
      order: true,
      hasPassword: true,
      syncVersion: true,
      createdAt: true,
      updatedAt: true,
      isDeleted: true,
    },
  });

  res.json({
    notes: notes.map(note => ({
      ...note,
      encryptedTitle: JSON.parse(note.encryptedTitle),
      encryptedContent: JSON.parse(note.encryptedContent),
      encryptedDEK: JSON.parse(note.encryptedDEK),
      tags: note.tags.map(t => t.tag),
    })),
    folders: folders.map(folder => ({
      ...folder,
      encryptedName: JSON.parse(folder.encryptedName),
    })),
    serverTime: Date.now(),
  });
}));

/**
 * 获取完整数据快照（用于初始同步）
 * GET /api/sync/snapshot
 */
router.get('/snapshot', asyncHandler(async (req, res) => {
  const authReq = req as AuthenticatedRequest;

  const notes = await prisma.note.findMany({
    where: {
      userId: authReq.user!.userId,
      isDeleted: false,
    },
    select: {
      id: true,
      encryptedTitle: true,
      encryptedContent: true,
      encryptedDEK: true,
      folderId: true,
      isPinned: true,
      pinnedAt: true,
      hasPassword: true,
      syncVersion: true,
      createdAt: true,
      updatedAt: true,
      tags: { select: { tag: true } },
    },
  });

  const folders = await prisma.folder.findMany({
    where: {
      userId: authReq.user!.userId,
      isDeleted: false,
    },
    select: {
      id: true,
      encryptedName: true,
      parentId: true,
      order: true,
      hasPassword: true,
      syncVersion: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  res.json({
    notes: notes.map(note => ({
      ...note,
      encryptedTitle: JSON.parse(note.encryptedTitle),
      encryptedContent: JSON.parse(note.encryptedContent),
      encryptedDEK: JSON.parse(note.encryptedDEK),
      tags: note.tags.map(t => t.tag),
    })),
    folders: folders.map(folder => ({
      ...folder,
      encryptedName: JSON.parse(folder.encryptedName),
    })),
    serverTime: Date.now(),
  });
}));

/**
 * 更新设备最后同步时间
 * POST /api/sync/heartbeat
 */
router.post('/heartbeat', asyncHandler(async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const deviceId = authReq.user!.deviceId;

  if (deviceId) {
    await prisma.device.update({
      where: { id: deviceId },
      data: { lastSyncAt: new Date() },
    });
  }

  res.json({ success: true, serverTime: Date.now() });
}));

export default router;
