/**
 * Socket.IO 同步处理器
 * 处理实时同步事件
 */

import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';

interface AuthPayload {
  userId: string;
  deviceId: string;
}

interface SyncEvent {
  type: 'note' | 'folder';
  action: 'create' | 'update' | 'delete';
  entityId: string;
  data?: unknown;
  syncVersion: number;
  timestamp: number;
}

// 用户房间映射
const userSockets = new Map<string, Set<string>>();

/**
 * 初始化 Socket.IO 同步处理
 */
export function initSyncHandler(io: Server) {
  const JWT_SECRET = process.env.JWT_SECRET;
  
  if (!JWT_SECRET && process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET environment variable must be set in production');
  }
  
  const EFFECTIVE_JWT_SECRET = JWT_SECRET || 'dev-secret-only-for-development';

  // 认证中间件
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error('Authentication required'));
    }

    try {
      const payload = jwt.verify(token, EFFECTIVE_JWT_SECRET) as AuthPayload;
      socket.data.userId = payload.userId;
      socket.data.deviceId = payload.deviceId;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const userId = socket.data.userId;
    const deviceId = socket.data.deviceId;

    console.log(`[Sync] Client connected: ${socket.id}, user: ${userId}, device: ${deviceId}`);

    // 加入用户房间
    socket.join(`user:${userId}`);

    // 记录用户socket
    if (!userSockets.has(userId)) {
      userSockets.set(userId, new Set());
    }
    userSockets.get(userId)!.add(socket.id);

    // 处理同步请求
    socket.on('sync:request', async (data: { since: number }) => {
      console.log(`[Sync] Sync request from ${socket.id}, since: ${data.since}`);
      // 客户端请求同步，服务端可以推送最新数据
      socket.emit('sync:ack', { serverTime: Date.now() });
    });

    // 处理心跳
    socket.on('sync:heartbeat', () => {
      socket.emit('sync:heartbeat:ack', { serverTime: Date.now() });
    });

    // 断开连接
    socket.on('disconnect', () => {
      console.log(`[Sync] Client disconnected: ${socket.id}`);
      userSockets.get(userId)?.delete(socket.id);
      if (userSockets.get(userId)?.size === 0) {
        userSockets.delete(userId);
      }
    });
  });
}

/**
 * 广播同步事件给用户的所有设备
 */
export function broadcastSyncEvent(io: Server, userId: string, event: SyncEvent, excludeSocketId?: string) {
  const room = `user:${userId}`;
  
  if (excludeSocketId) {
    io.to(room).except(excludeSocketId).emit('sync:update', event);
  } else {
    io.to(room).emit('sync:update', event);
  }
  
  console.log(`[Sync] Broadcast to ${room}:`, event.type, event.action, event.entityId);
}

/**
 * 检查用户是否在线
 */
export function isUserOnline(userId: string): boolean {
  return userSockets.has(userId) && userSockets.get(userId)!.size > 0;
}

/**
 * 获取用户在线设备数
 */
export function getUserDeviceCount(userId: string): number {
  return userSockets.get(userId)?.size || 0;
}
