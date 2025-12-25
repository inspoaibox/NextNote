/**
 * 认证路由
 */

import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { generateToken, authenticate, type AuthenticatedRequest } from '../middleware/auth';
import { asyncHandler, ValidationError, AuthenticationError, NotFoundError } from '../middleware/error';
import { strictRateLimit } from '../middleware/rate-limit';
import type { RegisterRequest, LoginRequest } from '@secure-notebook/shared';
import { isValidEmail, encryptIpAddress, checkLoginAttempt, recordLoginAttempt } from '../utils/security';

const router = Router();
const prisma = new PrismaClient();

/**
 * 获取公开系统设置（无需认证）
 * GET /api/auth/system-info
 */
router.get('/system-info', asyncHandler(async (_req, res) => {
  let settings = await prisma.systemSettings.findUnique({
    where: { id: 'system' },
  });

  // 检查是否有用户（用于判断是否是首次安装）
  const userCount = await prisma.user.count();

  res.json({
    siteName: settings?.siteName || 'Secure Notebook',
    siteDescription: settings?.siteDescription || 'End-to-end encrypted note-taking app',
    allowRegistration: settings?.allowRegistration ?? true,
    maintenanceMode: settings?.maintenanceMode ?? false,
    maintenanceMessage: settings?.maintenanceMessage || null,
    isFirstUser: userCount === 0,
  });
}));

/**
 * 注册
 * POST /api/auth/register
 */
router.post('/register', strictRateLimit(), asyncHandler(async (req, res) => {
  const body = req.body as RegisterRequest;
  
  // 验证必填字段
  if (!body.email || !body.encryptedKEK || !body.salt || !body.recoveryKeyHash) {
    throw new ValidationError('Missing required fields');
  }
  
  // 验证邮箱格式
  if (!isValidEmail(body.email)) {
    throw new ValidationError('Invalid email format');
  }
  
  // 获取系统设置
  let settings = await prisma.systemSettings.findUnique({
    where: { id: 'system' },
  });
  
  // 检查是否是第一个用户（将成为管理员）
  const userCount = await prisma.user.count();
  const isFirstUser = userCount === 0;
  
  // 如果不是第一个用户，检查注册限制
  if (!isFirstUser) {
    // 检查是否允许注册
    if (settings && !settings.allowRegistration) {
      throw new ValidationError('Registration is currently disabled');
    }
    
    // 检查用户数量限制
    if (settings && settings.maxUsersLimit > 0 && userCount >= settings.maxUsersLimit) {
      throw new ValidationError('Maximum user limit reached');
    }
  }
  
  // 检查邮箱是否已存在
  const existingUser = await prisma.user.findUnique({
    where: { email: body.email },
  });
  
  if (existingUser) {
    throw new ValidationError('Email already registered');
  }
  
  // 创建用户和设备
  const user = await prisma.user.create({
    data: {
      email: body.email,
      encryptedKEK: typeof body.encryptedKEK === 'string' ? body.encryptedKEK : JSON.stringify(body.encryptedKEK),
      salt: body.salt,
      recoveryKeyHash: body.recoveryKeyHash,
      role: isFirstUser ? 'admin' : 'user', // 第一个用户自动成为管理员
      devices: {
        create: {
          name: body.deviceName || 'Unknown Device',
          publicKey: body.devicePublicKey || '',
          isVerified: true, // 首个设备自动验证
        },
      },
    },
    include: {
      devices: true,
    },
  });
  
  // 如果是第一个用户，创建默认系统设置
  if (isFirstUser && !settings) {
    await prisma.systemSettings.create({
      data: { id: 'system' },
    });
  }
  
  const device = user.devices[0];
  
  // 生成JWT
  const token = generateToken({
    userId: user.id,
    deviceId: device.id,
  });
  
  // 记录审计日志
  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: 'register',
      deviceId: device.id,
      encryptedIpAddress: encryptIpAddress(req.ip || 'unknown'),
      userAgent: req.headers['user-agent']?.slice(0, 500) || 'unknown',
    },
  });
  
  res.status(201).json({
    userId: user.id,
    deviceId: device.id,
    token,
    role: user.role,
  });
}));

/**
 * 登录
 * POST /api/auth/login
 */
router.post('/login', strictRateLimit(), asyncHandler(async (req, res) => {
  const body = req.body as LoginRequest;
  
  if (!body.email) {
    throw new ValidationError('Email is required');
  }
  
  // 检查登录尝试限制
  const loginCheck = checkLoginAttempt(body.email);
  if (!loginCheck.allowed) {
    const waitMinutes = Math.ceil((loginCheck.lockedUntil! - Date.now()) / 60000);
    throw new AuthenticationError(`Too many login attempts. Please try again in ${waitMinutes} minutes.`);
  }
  
  // 查找用户
  const user = await prisma.user.findUnique({
    where: { email: body.email },
  });
  
  if (!user) {
    recordLoginAttempt(body.email, false);
    throw new AuthenticationError('Invalid credentials');
  }
  
  // 检查用户是否被禁用
  if (!user.isActive) {
    recordLoginAttempt(body.email, false);
    throw new AuthenticationError('Account is disabled');
  }
  
  // 记录成功登录
  recordLoginAttempt(body.email, true);
  
  // 查找或创建设备
  let device = await prisma.device.findFirst({
    where: {
      userId: user.id,
      name: body.deviceName,
    },
  });
  
  const isNewDevice = !device;
  
  if (!device) {
    device = await prisma.device.create({
      data: {
        userId: user.id,
        name: body.deviceName || 'Unknown Device',
        publicKey: body.devicePublicKey || '',
        isVerified: false, // 新设备需要验证
      },
    });
  }
  
  // 更新最后同步时间
  await prisma.device.update({
    where: { id: device.id },
    data: { lastSyncAt: new Date() },
  });
  
  // 生成JWT
  const token = generateToken({
    userId: user.id,
    deviceId: device.id,
  });
  
  // 记录审计日志
  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: 'login',
      deviceId: device.id,
      encryptedIpAddress: encryptIpAddress(req.ip || 'unknown'),
      userAgent: req.headers['user-agent']?.slice(0, 500) || 'unknown',
      metadata: { isNewDevice },
    },
  });
  
  res.json({
    userId: user.id,
    deviceId: device.id,
    token,
    encryptedKEK: typeof user.encryptedKEK === 'string' ? JSON.parse(user.encryptedKEK) : user.encryptedKEK,
    salt: user.salt,
    role: user.role,
    requiresVerification: isNewDevice && !device.isVerified,
  });
}));

/**
 * 获取当前用户信息
 * GET /api/auth/me
 */
router.get('/me', authenticate, asyncHandler(async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  
  const user = await prisma.user.findUnique({
    where: { id: authReq.user!.userId },
    select: {
      id: true,
      email: true,
      createdAt: true,
      devices: {
        select: {
          id: true,
          name: true,
          lastSyncAt: true,
          isVerified: true,
          createdAt: true,
        },
      },
    },
  });
  
  if (!user) {
    throw new NotFoundError('User not found');
  }
  
  res.json(user);
}));

/**
 * 修改密码
 * POST /api/auth/change-password
 */
router.post('/change-password', authenticate, asyncHandler(async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const { newEncryptedKEK, newSalt } = req.body;
  
  if (!newEncryptedKEK || !newSalt) {
    throw new ValidationError('Missing required fields');
  }
  
  await prisma.user.update({
    where: { id: authReq.user!.userId },
    data: {
      encryptedKEK: typeof newEncryptedKEK === 'string' ? newEncryptedKEK : JSON.stringify(newEncryptedKEK),
      salt: newSalt,
    },
  });
  
  // 记录审计日志
  await prisma.auditLog.create({
    data: {
      userId: authReq.user!.userId,
      action: 'password_change',
      deviceId: authReq.user!.deviceId,
      encryptedIpAddress: encryptIpAddress(req.ip || 'unknown'),
      userAgent: req.headers['user-agent']?.slice(0, 500) || 'unknown',
    },
  });
  
  res.json({ success: true });
}));

/**
 * 撤销所有设备会话
 * POST /api/auth/revoke-all
 */
router.post('/revoke-all', authenticate, asyncHandler(async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  
  // 删除除当前设备外的所有设备
  await prisma.device.deleteMany({
    where: {
      userId: authReq.user!.userId,
      id: { not: authReq.user!.deviceId },
    },
  });
  
  // 记录审计日志
  await prisma.auditLog.create({
    data: {
      userId: authReq.user!.userId,
      action: 'session_revoke',
      deviceId: authReq.user!.deviceId,
      encryptedIpAddress: encryptIpAddress(req.ip || 'unknown'),
      userAgent: req.headers['user-agent']?.slice(0, 500) || 'unknown',
    },
  });
  
  res.json({ success: true });
}));

export default router;
