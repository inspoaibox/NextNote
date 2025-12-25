/**
 * 笔记路由
 */

import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, type AuthenticatedRequest } from '../middleware/auth';
import { asyncHandler, ValidationError, NotFoundError, AuthorizationError } from '../middleware/error';
import type { CreateNoteRequest, UpdateNoteRequest } from '@secure-notebook/shared';
import { io } from '../index';
import { broadcastSyncEvent } from '../socket/sync-handler';
import { secureCompare, isValidUUID, isValidTagsArray, isValidEncryptedData, isValidSharePermission, isValidEmail } from '../utils/security';

const router = Router();
const prisma = new PrismaClient();

// 所有路由都需要认证
router.use(authenticate);

/**
 * 验证 folderId 属于当前用户
 */
async function validateFolderOwnership(folderId: string, userId: string): Promise<boolean> {
  const folder = await prisma.folder.findUnique({
    where: { id: folderId },
    select: { userId: true },
  });
  return folder?.userId === userId;
}

/**
 * 创建笔记
 * POST /api/notes
 */
router.post('/', asyncHandler(async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const body = req.body as CreateNoteRequest;
  
  // 验证必填字段
  if (!body.encryptedTitle || !body.encryptedContent || !body.encryptedDEK) {
    throw new ValidationError('Missing required fields');
  }
  
  // 验证加密数据格式
  if (!isValidEncryptedData(body.encryptedTitle) || 
      !isValidEncryptedData(body.encryptedContent) || 
      !isValidEncryptedData(body.encryptedDEK)) {
    throw new ValidationError('Invalid encrypted data format');
  }
  
  // 验证 folderId 格式和所有权
  if (body.folderId) {
    if (!isValidUUID(body.folderId)) {
      throw new ValidationError('Invalid folder ID format');
    }
    const folderOwned = await validateFolderOwnership(body.folderId, authReq.user!.userId);
    if (!folderOwned) {
      throw new AuthorizationError('Folder access denied');
    }
  }
  
  // 验证标签数组
  if (body.tags !== undefined && !isValidTagsArray(body.tags)) {
    throw new ValidationError('Invalid tags format');
  }
  
  const note = await prisma.note.create({
    data: {
      userId: authReq.user!.userId,
      encryptedTitle: JSON.stringify(body.encryptedTitle),
      encryptedContent: JSON.stringify(body.encryptedContent),
      encryptedDEK: JSON.stringify(body.encryptedDEK),
      folderId: body.folderId || null,
      visibility: 'private',
      tags: body.tags ? {
        create: body.tags.map((tag: string) => ({ tag })),
      } : undefined,
    },
    include: {
      tags: true,
    },
  });
  
  // 广播同步事件
  broadcastSyncEvent(io, authReq.user!.userId, {
    type: 'note',
    action: 'create',
    entityId: note.id,
    data: {
      id: note.id,
      encryptedTitle: body.encryptedTitle,
      encryptedContent: body.encryptedContent,
      encryptedDEK: body.encryptedDEK,
      folderId: note.folderId,
      isPinned: note.isPinned,
      hasPassword: note.hasPassword,
      tags: note.tags.map((t: { tag: string }) => t.tag),
      createdAt: note.createdAt,
      updatedAt: note.updatedAt,
    },
    syncVersion: note.syncVersion,
    timestamp: Date.now(),
  });
  
  res.status(201).json({
    id: note.id,
    syncVersion: note.syncVersion,
    createdAt: note.createdAt,
  });
}));

/**
 * 获取笔记列表
 * GET /api/notes
 */
router.get('/', asyncHandler(async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const { folderId, includeDeleted } = req.query;
  
  // 验证 folderId 格式
  if (folderId && folderId !== 'null' && !isValidUUID(folderId as string)) {
    throw new ValidationError('Invalid folder ID format');
  }
  
  const notes = await prisma.note.findMany({
    where: {
      userId: authReq.user!.userId,
      folderId: folderId === 'null' ? null : (folderId as string) || undefined,
      isDeleted: includeDeleted === 'true' ? undefined : false,
    },
    select: {
      id: true,
      encryptedTitle: true,
      folderId: true,
      isPinned: true,
      pinnedAt: true,
      hasPassword: true,
      visibility: true,
      syncVersion: true,
      createdAt: true,
      updatedAt: true,
      isDeleted: true,
      tags: {
        select: { tag: true },
      },
    },
    orderBy: [
      { isPinned: 'desc' },
      { pinnedAt: 'desc' },
      { updatedAt: 'desc' },
    ],
  });
  
  res.json(notes.map((note: typeof notes[0]) => ({
    ...note,
    encryptedTitle: JSON.parse(note.encryptedTitle),
    tags: note.tags.map((t: { tag: string }) => t.tag),
  })));
}));

/**
 * 获取单个笔记
 * GET /api/notes/:id
 */
router.get('/:id', asyncHandler(async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const { id } = req.params;
  
  // 验证 UUID 格式
  if (!isValidUUID(id)) {
    throw new ValidationError('Invalid note ID format');
  }
  
  const note = await prisma.note.findUnique({
    where: { id },
    include: {
      tags: true,
    },
  });
  
  if (!note) {
    throw new NotFoundError('Note not found');
  }
  
  if (note.userId !== authReq.user!.userId) {
    throw new AuthorizationError('Access denied');
  }
  
  res.json({
    ...note,
    encryptedTitle: JSON.parse(note.encryptedTitle),
    encryptedContent: JSON.parse(note.encryptedContent),
    encryptedDEK: JSON.parse(note.encryptedDEK),
    tags: note.tags.map((t: { tag: string }) => t.tag),
  });
}));

/**
 * 更新笔记
 * PUT /api/notes/:id
 */
router.put('/:id', asyncHandler(async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const { id } = req.params;
  const body = req.body as UpdateNoteRequest;
  
  // 验证 UUID 格式
  if (!isValidUUID(id)) {
    throw new ValidationError('Invalid note ID format');
  }
  
  // 验证加密数据格式（如果提供）
  if (body.encryptedTitle && !isValidEncryptedData(body.encryptedTitle)) {
    throw new ValidationError('Invalid encrypted title format');
  }
  if (body.encryptedContent && !isValidEncryptedData(body.encryptedContent)) {
    throw new ValidationError('Invalid encrypted content format');
  }
  if (body.encryptedDEK && !isValidEncryptedData(body.encryptedDEK)) {
    throw new ValidationError('Invalid encrypted DEK format');
  }
  
  // 验证 folderId 格式和所有权
  if (body.folderId !== undefined && body.folderId !== null) {
    if (!isValidUUID(body.folderId)) {
      throw new ValidationError('Invalid folder ID format');
    }
    const folderOwned = await validateFolderOwnership(body.folderId, authReq.user!.userId);
    if (!folderOwned) {
      throw new AuthorizationError('Folder access denied');
    }
  }
  
  // 验证标签数组
  if (body.tags !== undefined && !isValidTagsArray(body.tags)) {
    throw new ValidationError('Invalid tags format');
  }
  
  const existingNote = await prisma.note.findUnique({
    where: { id },
  });
  
  if (!existingNote) {
    throw new NotFoundError('Note not found');
  }
  
  if (existingNote.userId !== authReq.user!.userId) {
    throw new AuthorizationError('Access denied');
  }
  
  // 创建版本快照
  await prisma.noteVersion.create({
    data: {
      noteId: id,
      encryptedContent: existingNote.encryptedContent,
      encryptedDEK: existingNote.encryptedDEK,
      size: existingNote.encryptedContent.length,
    },
  });
  
  // 清理旧版本（保留最近50个）
  const versions = await prisma.noteVersion.findMany({
    where: { noteId: id },
    orderBy: { createdAt: 'desc' },
    skip: 50,
  });
  
  if (versions.length > 0) {
    await prisma.noteVersion.deleteMany({
      where: {
        id: { in: versions.map((v: { id: string }) => v.id) },
      },
    });
  }
  
  // 更新笔记
  const note = await prisma.note.update({
    where: { id },
    data: {
      encryptedTitle: body.encryptedTitle ? JSON.stringify(body.encryptedTitle) : undefined,
      encryptedContent: body.encryptedContent ? JSON.stringify(body.encryptedContent) : undefined,
      encryptedDEK: body.encryptedDEK ? JSON.stringify(body.encryptedDEK) : undefined,
      folderId: body.folderId !== undefined ? body.folderId : undefined,
      syncVersion: { increment: 1 },
      tags: body.tags ? {
        deleteMany: {},
        create: body.tags.map((tag: string) => ({ tag })),
      } : undefined,
    },
    include: {
      tags: true,
    },
  });
  
  // 广播同步事件
  broadcastSyncEvent(io, authReq.user!.userId, {
    type: 'note',
    action: 'update',
    entityId: note.id,
    data: {
      id: note.id,
      encryptedTitle: body.encryptedTitle || JSON.parse(note.encryptedTitle),
      encryptedContent: body.encryptedContent || JSON.parse(note.encryptedContent),
      encryptedDEK: body.encryptedDEK || JSON.parse(note.encryptedDEK),
      folderId: note.folderId,
      isPinned: note.isPinned,
      hasPassword: note.hasPassword,
      tags: note.tags.map((t: { tag: string }) => t.tag),
      updatedAt: note.updatedAt,
    },
    syncVersion: note.syncVersion,
    timestamp: Date.now(),
  });
  
  res.json({
    id: note.id,
    syncVersion: note.syncVersion,
    updatedAt: note.updatedAt,
  });
}));

/**
 * 删除笔记（软删除）
 * DELETE /api/notes/:id
 */
router.delete('/:id', asyncHandler(async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const { id } = req.params;
  
  // 验证 UUID 格式
  if (!isValidUUID(id)) {
    throw new ValidationError('Invalid note ID format');
  }
  
  const note = await prisma.note.findUnique({
    where: { id },
  });
  
  if (!note) {
    throw new NotFoundError('Note not found');
  }
  
  if (note.userId !== authReq.user!.userId) {
    throw new AuthorizationError('Access denied');
  }
  
  await prisma.note.update({
    where: { id },
    data: {
      isDeleted: true,
      deletedAt: new Date(),
      syncVersion: { increment: 1 },
    },
  });
  
  // 广播同步事件
  broadcastSyncEvent(io, authReq.user!.userId, {
    type: 'note',
    action: 'delete',
    entityId: id,
    syncVersion: note.syncVersion + 1,
    timestamp: Date.now(),
  });
  
  // 标记关联图片为待删除
  await prisma.image.updateMany({
    where: { noteId: id },
    data: {
      markedForDeletion: true,
      deletionDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30天后
    },
  });
  
  res.json({ success: true });
}));

/**
 * 置顶/取消置顶笔记
 * POST /api/notes/:id/pin
 */
router.post('/:id/pin', asyncHandler(async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const { id } = req.params;
  const { isPinned } = req.body;
  
  // 验证 UUID 格式
  if (!isValidUUID(id)) {
    throw new ValidationError('Invalid note ID format');
  }
  
  // 验证 isPinned 类型
  if (typeof isPinned !== 'boolean') {
    throw new ValidationError('isPinned must be a boolean');
  }
  
  const note = await prisma.note.findUnique({
    where: { id },
  });
  
  if (!note) {
    throw new NotFoundError('Note not found');
  }
  
  if (note.userId !== authReq.user!.userId) {
    throw new AuthorizationError('Access denied');
  }
  
  await prisma.note.update({
    where: { id },
    data: {
      isPinned: isPinned,
      pinnedAt: isPinned ? new Date() : null,
      syncVersion: { increment: 1 },
    },
  });
  
  res.json({ success: true });
}));

/**
 * 获取笔记版本历史
 * GET /api/notes/:id/versions
 */
router.get('/:id/versions', asyncHandler(async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const { id } = req.params;
  
  // 验证 UUID 格式
  if (!isValidUUID(id)) {
    throw new ValidationError('Invalid note ID format');
  }
  
  const note = await prisma.note.findUnique({
    where: { id },
  });
  
  if (!note) {
    throw new NotFoundError('Note not found');
  }
  
  if (note.userId !== authReq.user!.userId) {
    throw new AuthorizationError('Access denied');
  }
  
  const versions = await prisma.noteVersion.findMany({
    where: { noteId: id },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: {
      id: true,
      size: true,
      createdAt: true,
    },
  });
  
  res.json(versions);
}));

/**
 * 恢复笔记版本
 * POST /api/notes/:id/versions/:versionId/restore
 */
router.post('/:id/versions/:versionId/restore', asyncHandler(async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const { id, versionId } = req.params;
  
  // 验证 UUID 格式
  if (!isValidUUID(id) || !isValidUUID(versionId)) {
    throw new ValidationError('Invalid ID format');
  }
  
  const note = await prisma.note.findUnique({
    where: { id },
  });
  
  if (!note) {
    throw new NotFoundError('Note not found');
  }
  
  if (note.userId !== authReq.user!.userId) {
    throw new AuthorizationError('Access denied');
  }
  
  const version = await prisma.noteVersion.findUnique({
    where: { id: versionId },
  });
  
  if (!version || version.noteId !== id) {
    throw new NotFoundError('Version not found');
  }
  
  // 创建当前版本的快照
  await prisma.noteVersion.create({
    data: {
      noteId: id,
      encryptedContent: note.encryptedContent,
      encryptedDEK: note.encryptedDEK,
      size: note.encryptedContent.length,
    },
  });
  
  // 恢复到指定版本
  await prisma.note.update({
    where: { id },
    data: {
      encryptedContent: version.encryptedContent,
      encryptedDEK: version.encryptedDEK,
      syncVersion: { increment: 1 },
    },
  });
  
  res.json({ success: true });
}));

/**
 * 获取版本内容
 * GET /api/notes/:id/versions/:versionId
 */
router.get('/:id/versions/:versionId', asyncHandler(async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const { id, versionId } = req.params;
  
  // 验证 UUID 格式
  if (!isValidUUID(id) || !isValidUUID(versionId)) {
    throw new ValidationError('Invalid ID format');
  }
  
  const note = await prisma.note.findUnique({
    where: { id },
  });
  
  if (!note) {
    throw new NotFoundError('Note not found');
  }
  
  if (note.userId !== authReq.user!.userId) {
    throw new AuthorizationError('Access denied');
  }
  
  const version = await prisma.noteVersion.findUnique({
    where: { id: versionId },
  });
  
  if (!version || version.noteId !== id) {
    throw new NotFoundError('Version not found');
  }
  
  res.json({
    id: version.id,
    encryptedContent: JSON.parse(version.encryptedContent),
    encryptedDEK: JSON.parse(version.encryptedDEK),
    size: version.size,
    createdAt: version.createdAt,
  });
}));

/**
 * 分享笔记
 * POST /api/notes/:id/shares
 */
router.post('/:id/shares', asyncHandler(async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const { id } = req.params;
  const { recipientEmail, permission, encryptedShareKey } = req.body;
  
  // 验证 UUID 格式
  if (!isValidUUID(id)) {
    throw new ValidationError('Invalid note ID format');
  }
  
  if (!recipientEmail || !permission || !encryptedShareKey) {
    throw new ValidationError('Missing required fields');
  }
  
  // 验证邮箱格式
  if (!isValidEmail(recipientEmail)) {
    throw new ValidationError('Invalid email format');
  }
  
  // 验证权限枚举
  if (!isValidSharePermission(permission)) {
    throw new ValidationError('Invalid permission value. Must be: read, write, or admin');
  }
  
  const note = await prisma.note.findUnique({
    where: { id },
  });
  
  if (!note) {
    throw new NotFoundError('Note not found');
  }
  
  if (note.userId !== authReq.user!.userId) {
    throw new AuthorizationError('Access denied');
  }
  
  // 查找接收者用户
  const recipient = await prisma.user.findUnique({
    where: { email: recipientEmail },
  });
  
  // 防止自己分享给自己
  const owner = await prisma.user.findUnique({
    where: { id: authReq.user!.userId },
    select: { email: true },
  });
  
  if (owner?.email === recipientEmail) {
    throw new ValidationError('Cannot share note with yourself');
  }
  
  const share = await prisma.share.create({
    data: {
      noteId: id,
      ownerId: authReq.user!.userId,
      recipientId: recipient?.id || null,
      recipientEmail,
      encryptedShareKey,
      permission,
    },
  });
  
  res.status(201).json({
    shareId: share.id,
    createdAt: share.createdAt,
  });
}));

/**
 * 获取笔记分享列表
 * GET /api/notes/:id/shares
 */
router.get('/:id/shares', asyncHandler(async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const { id } = req.params;
  
  // 验证 UUID 格式
  if (!isValidUUID(id)) {
    throw new ValidationError('Invalid note ID format');
  }
  
  const note = await prisma.note.findUnique({
    where: { id },
  });
  
  if (!note) {
    throw new NotFoundError('Note not found');
  }
  
  if (note.userId !== authReq.user!.userId) {
    throw new AuthorizationError('Access denied');
  }
  
  const shares = await prisma.share.findMany({
    where: {
      noteId: id,
      isRevoked: false,
    },
    select: {
      id: true,
      recipientEmail: true,
      permission: true,
      createdAt: true,
    },
  });
  
  res.json(shares);
}));

/**
 * 撤销分享
 * DELETE /api/notes/:id/shares/:shareId
 */
router.delete('/:id/shares/:shareId', asyncHandler(async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const { id, shareId } = req.params;
  
  // 验证 UUID 格式
  if (!isValidUUID(id) || !isValidUUID(shareId)) {
    throw new ValidationError('Invalid ID format');
  }
  
  const note = await prisma.note.findUnique({
    where: { id },
  });
  
  if (!note) {
    throw new NotFoundError('Note not found');
  }
  
  if (note.userId !== authReq.user!.userId) {
    throw new AuthorizationError('Access denied');
  }
  
  const share = await prisma.share.findUnique({
    where: { id: shareId },
  });
  
  if (!share || share.noteId !== id) {
    throw new NotFoundError('Share not found');
  }
  
  await prisma.share.update({
    where: { id: shareId },
    data: { isRevoked: true },
  });
  
  res.json({ success: true });
}));

/**
 * 设置笔记密码
 * POST /api/notes/:id/password
 */
router.post('/:id/password', asyncHandler(async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const { id } = req.params;
  const { passwordHash } = req.body;
  
  // 验证 UUID 格式
  if (!isValidUUID(id)) {
    throw new ValidationError('Invalid note ID format');
  }
  
  if (!passwordHash || typeof passwordHash !== 'string') {
    throw new ValidationError('Password hash is required');
  }
  
  const note = await prisma.note.findUnique({
    where: { id },
  });
  
  if (!note) {
    throw new NotFoundError('Note not found');
  }
  
  if (note.userId !== authReq.user!.userId) {
    throw new AuthorizationError('Access denied');
  }
  
  await prisma.note.update({
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
 * 移除笔记密码
 * DELETE /api/notes/:id/password
 */
router.delete('/:id/password', asyncHandler(async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const { id } = req.params;
  
  // 验证 UUID 格式
  if (!isValidUUID(id)) {
    throw new ValidationError('Invalid note ID format');
  }
  
  const note = await prisma.note.findUnique({
    where: { id },
  });
  
  if (!note) {
    throw new NotFoundError('Note not found');
  }
  
  if (note.userId !== authReq.user!.userId) {
    throw new AuthorizationError('Access denied');
  }
  
  await prisma.note.update({
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
 * 验证笔记密码
 * POST /api/notes/:id/password/verify
 */
router.post('/:id/password/verify', asyncHandler(async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const { id } = req.params;
  const { passwordHash } = req.body;
  
  // 验证 UUID 格式
  if (!isValidUUID(id)) {
    throw new ValidationError('Invalid note ID format');
  }
  
  if (!passwordHash || typeof passwordHash !== 'string') {
    throw new ValidationError('Password hash is required');
  }
  
  const note = await prisma.note.findUnique({
    where: { id },
  });
  
  if (!note) {
    throw new NotFoundError('Note not found');
  }
  
  if (note.userId !== authReq.user!.userId) {
    throw new AuthorizationError('Access denied');
  }
  
  const isValid = note.passwordHash ? secureCompare(note.passwordHash, passwordHash) : false;
  
  res.json({ valid: isValid });
}));

export default router;
