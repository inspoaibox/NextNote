/**
 * 同步路由
 * 处理数据同步相关的 REST API
 */

import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, type AuthenticatedRequest } from '../middleware/auth';
import { asyncHandler, ValidationError } from '../middleware/error';
import { isValidUUID } from '../utils/security';

const router = Router();
const prisma = new PrismaClient();

router.use(authenticate);

// 定义类型
interface NoteWithTags {
  id: string;
  encryptedTitle: string;
  encryptedContent: string;
  encryptedDEK: string;
  folderId: string | null;
  isPinned: boolean;
  pinnedAt: Date | null;
  hasPassword: boolean;
  syncVersion: number;
  lastModifiedDeviceId: string | null;
  createdAt: Date;
  updatedAt: Date;
  isDeleted: boolean;
  deletedAt: Date | null;
  tags: { tag: string }[];
}

interface FolderData {
  id: string;
  encryptedName: string;
  parentId: string | null;
  order: number;
  hasPassword: boolean;
  syncVersion: number;
  lastModifiedDeviceId: string | null;
  createdAt: Date;
  updatedAt: Date;
  isDeleted: boolean;
  deletedAt: Date | null;
}

/**
 * 获取自上次同步以来的变更（基于 syncVersion）
 * GET /api/sync/changes?since=syncVersion
 */
router.get('/changes', asyncHandler(async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const sinceParam = req.query.since as string;
  
  // 验证 since 参数（syncVersion）
  const sinceSyncVersion = parseInt(sinceParam) || 0;
  if (sinceSyncVersion < 0) {
    throw new ValidationError('Invalid syncVersion');
  }

  // 获取 syncVersion 大于指定值的笔记
  const notes = await prisma.note.findMany({
    where: {
      userId: authReq.user!.userId,
      syncVersion: { gt: sinceSyncVersion },
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
      lastModifiedDeviceId: true,
      createdAt: true,
      updatedAt: true,
      isDeleted: true,
      deletedAt: true,
      tags: { select: { tag: true } },
    },
  });

  // 获取 syncVersion 大于指定值的文件夹
  const folders = await prisma.folder.findMany({
    where: {
      userId: authReq.user!.userId,
      syncVersion: { gt: sinceSyncVersion },
    },
    select: {
      id: true,
      encryptedName: true,
      parentId: true,
      order: true,
      hasPassword: true,
      syncVersion: true,
      lastModifiedDeviceId: true,
      createdAt: true,
      updatedAt: true,
      isDeleted: true,
      deletedAt: true,
    },
  });

  // 获取当前最大 syncVersion
  const maxNoteSyncVersion = notes.length > 0 ? Math.max(...notes.map(n => n.syncVersion)) : sinceSyncVersion;
  const maxFolderSyncVersion = folders.length > 0 ? Math.max(...folders.map(f => f.syncVersion)) : sinceSyncVersion;
  const currentSyncVersion = Math.max(maxNoteSyncVersion, maxFolderSyncVersion, sinceSyncVersion);

  res.json({
    notes: notes.map((note: NoteWithTags) => ({
      id: note.id,
      encryptedTitle: note.encryptedTitle,
      encryptedContent: note.encryptedContent,
      encryptedDEK: note.encryptedDEK,
      folderId: note.folderId,
      isPinned: note.isPinned,
      hasPassword: note.hasPassword,
      tags: note.tags.map((t: { tag: string }) => t.tag),
      syncVersion: note.syncVersion,
      lastModifiedDeviceId: note.lastModifiedDeviceId,
      createdAt: note.createdAt.toISOString(),
      updatedAt: note.updatedAt.toISOString(),
      isDeleted: note.isDeleted,
      deletedAt: note.deletedAt?.toISOString() || null,
    })),
    folders: folders.map((folder: FolderData) => ({
      id: folder.id,
      encryptedName: folder.encryptedName,
      parentId: folder.parentId,
      order: folder.order,
      hasPassword: folder.hasPassword,
      syncVersion: folder.syncVersion,
      lastModifiedDeviceId: folder.lastModifiedDeviceId,
      createdAt: folder.createdAt.toISOString(),
      updatedAt: folder.updatedAt.toISOString(),
      isDeleted: folder.isDeleted,
      deletedAt: folder.deletedAt?.toISOString() || null,
    })),
    currentSyncVersion,
    serverTime: Date.now(),
  });
}));

/**
 * 批量上传本地变更
 * POST /api/sync/push
 */
router.post('/push', asyncHandler(async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const { notes, folders, deviceId } = req.body;

  if (!deviceId || typeof deviceId !== 'string') {
    throw new ValidationError('deviceId is required');
  }

  const results = {
    notes: { created: 0, updated: 0, conflicts: 0 },
    folders: { created: 0, updated: 0, conflicts: 0 },
  };

  // 处理笔记
  if (Array.isArray(notes)) {
    for (const note of notes) {
      if (!note.id || !isValidUUID(note.id)) continue;

      const existing = await prisma.note.findFirst({
        where: { id: note.id, userId: authReq.user!.userId },
      });

      if (!existing) {
        // 创建新笔记
        await prisma.note.create({
          data: {
            id: note.id,
            userId: authReq.user!.userId,
            encryptedTitle: note.encryptedTitle,
            encryptedContent: note.encryptedContent,
            encryptedDEK: note.encryptedDEK,
            folderId: note.folderId,
            isPinned: note.isPinned || false,
            hasPassword: note.hasPassword || false,
            syncVersion: 1,
            lastModifiedDeviceId: deviceId,
            isDeleted: note.isDeleted || false,
            deletedAt: note.isDeleted ? new Date() : null,
          },
        });
        
        // 处理标签
        if (Array.isArray(note.tags)) {
          for (const tag of note.tags) {
            await prisma.noteTag.create({
              data: { noteId: note.id, tag },
            }).catch(() => {}); // 忽略重复标签
          }
        }
        
        results.notes.created++;
      } else {
        // 检查冲突：如果服务器版本更新，且来自不同设备
        if (existing.syncVersion > note.syncVersion && existing.lastModifiedDeviceId !== deviceId) {
          // 冲突：比较 updatedAt
          const remoteTime = new Date(note.updatedAt).getTime();
          if (remoteTime <= existing.updatedAt.getTime()) {
            results.notes.conflicts++;
            continue; // 服务器版本更新，跳过
          }
        }

        // 更新笔记
        await prisma.note.update({
          where: { id: note.id },
          data: {
            encryptedTitle: note.encryptedTitle,
            encryptedContent: note.encryptedContent,
            encryptedDEK: note.encryptedDEK,
            folderId: note.folderId,
            isPinned: note.isPinned,
            hasPassword: note.hasPassword,
            syncVersion: { increment: 1 },
            lastModifiedDeviceId: deviceId,
            isDeleted: note.isDeleted || false,
            deletedAt: note.isDeleted ? new Date() : null,
          },
        });

        // 更新标签
        await prisma.noteTag.deleteMany({ where: { noteId: note.id } });
        if (Array.isArray(note.tags)) {
          for (const tag of note.tags) {
            await prisma.noteTag.create({
              data: { noteId: note.id, tag },
            }).catch(() => {});
          }
        }

        results.notes.updated++;
      }
    }
  }

  // 处理文件夹
  if (Array.isArray(folders)) {
    for (const folder of folders) {
      if (!folder.id || !isValidUUID(folder.id)) continue;

      const existing = await prisma.folder.findFirst({
        where: { id: folder.id, userId: authReq.user!.userId },
      });

      if (!existing) {
        await prisma.folder.create({
          data: {
            id: folder.id,
            userId: authReq.user!.userId,
            encryptedName: folder.encryptedName,
            parentId: folder.parentId,
            order: folder.order || 0,
            hasPassword: folder.hasPassword || false,
            syncVersion: 1,
            lastModifiedDeviceId: deviceId,
            isDeleted: folder.isDeleted || false,
            deletedAt: folder.isDeleted ? new Date() : null,
          },
        });
        results.folders.created++;
      } else {
        if (existing.syncVersion > folder.syncVersion && existing.lastModifiedDeviceId !== deviceId) {
          const remoteTime = new Date(folder.updatedAt).getTime();
          if (remoteTime <= existing.updatedAt.getTime()) {
            results.folders.conflicts++;
            continue;
          }
        }

        await prisma.folder.update({
          where: { id: folder.id },
          data: {
            encryptedName: folder.encryptedName,
            parentId: folder.parentId,
            order: folder.order,
            hasPassword: folder.hasPassword,
            syncVersion: { increment: 1 },
            lastModifiedDeviceId: deviceId,
            isDeleted: folder.isDeleted || false,
            deletedAt: folder.isDeleted ? new Date() : null,
          },
        });
        results.folders.updated++;
      }
    }
  }

  res.json({
    success: true,
    results,
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
      lastModifiedDeviceId: true,
      createdAt: true,
      updatedAt: true,
      isDeleted: true,
      deletedAt: true,
      tags: { select: { tag: true } },
    },
  });

  const folders = await prisma.folder.findMany({
    where: {
      userId: authReq.user!.userId,
    },
    select: {
      id: true,
      encryptedName: true,
      parentId: true,
      order: true,
      hasPassword: true,
      syncVersion: true,
      lastModifiedDeviceId: true,
      createdAt: true,
      updatedAt: true,
      isDeleted: true,
      deletedAt: true,
    },
  });

  // 计算当前最大 syncVersion
  const maxNoteSyncVersion = notes.length > 0 ? Math.max(...notes.map(n => n.syncVersion)) : 0;
  const maxFolderSyncVersion = folders.length > 0 ? Math.max(...folders.map(f => f.syncVersion)) : 0;
  const currentSyncVersion = Math.max(maxNoteSyncVersion, maxFolderSyncVersion);

  res.json({
    notes: notes.map((note: NoteWithTags) => ({
      id: note.id,
      encryptedTitle: note.encryptedTitle,
      encryptedContent: note.encryptedContent,
      encryptedDEK: note.encryptedDEK,
      folderId: note.folderId,
      isPinned: note.isPinned,
      hasPassword: note.hasPassword,
      tags: note.tags.map((t: { tag: string }) => t.tag),
      syncVersion: note.syncVersion,
      lastModifiedDeviceId: note.lastModifiedDeviceId,
      createdAt: note.createdAt.toISOString(),
      updatedAt: note.updatedAt.toISOString(),
      isDeleted: note.isDeleted,
      deletedAt: note.deletedAt?.toISOString() || null,
    })),
    folders: folders.map((folder: FolderData) => ({
      id: folder.id,
      encryptedName: folder.encryptedName,
      parentId: folder.parentId,
      order: folder.order,
      hasPassword: folder.hasPassword,
      syncVersion: folder.syncVersion,
      lastModifiedDeviceId: folder.lastModifiedDeviceId,
      createdAt: folder.createdAt.toISOString(),
      updatedAt: folder.updatedAt.toISOString(),
      isDeleted: folder.isDeleted,
      deletedAt: folder.deletedAt?.toISOString() || null,
    })),
    currentSyncVersion,
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
