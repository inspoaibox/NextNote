/**
 * 同步服务
 * 处理实时同步和离线支持
 */

import { io, Socket } from 'socket.io-client';
import type { EncryptedData, WrappedKey } from './crypto-service';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

export type SyncStatus = 'connected' | 'connecting' | 'disconnected' | 'offline' | 'error';

export interface SyncEvent {
  type: 'note' | 'folder';
  action: 'create' | 'update' | 'delete';
  entityId: string;
  data?: unknown;
  syncVersion: number;
  timestamp: number;
}

export interface SyncedNote {
  id: string;
  encryptedTitle: EncryptedData;
  encryptedContent: EncryptedData;
  encryptedDEK: WrappedKey;
  folderId: string | null;
  isPinned: boolean;
  hasPassword: boolean;
  tags: string[];
  syncVersion: number;
  createdAt: string;
  updatedAt: string;
}

export interface SyncedFolder {
  id: string;
  encryptedName: EncryptedData;
  parentId: string | null;
  order: number;
  hasPassword: boolean;
  syncVersion: number;
  createdAt: string;
  updatedAt: string;
}

type SyncEventHandler = (event: SyncEvent) => void;
type StatusChangeHandler = (status: SyncStatus) => void;

class SyncService {
  private socket: Socket | null = null;
  private status: SyncStatus = 'disconnected';
  private eventHandlers: Set<SyncEventHandler> = new Set();
  private statusHandlers: Set<StatusChangeHandler> = new Set();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private lastSyncTime = 0;
  private isOnline = navigator.onLine;

  constructor() {
    // 监听网络状态
    window.addEventListener('online', this.handleOnline);
    window.addEventListener('offline', this.handleOffline);
  }

  private handleOnline = () => {
    this.isOnline = true;
    if (this.status === 'offline') {
      this.reconnect();
    }
  };

  private handleOffline = () => {
    this.isOnline = false;
    this.setStatus('offline');
  };

  private setStatus(status: SyncStatus) {
    if (this.status !== status) {
      this.status = status;
      this.statusHandlers.forEach(handler => handler(status));
    }
  }

  /**
   * 连接到同步服务器
   */
  connect(token: string) {
    if (this.socket?.connected) {
      return;
    }

    if (!this.isOnline) {
      this.setStatus('offline');
      return;
    }

    this.setStatus('connecting');

    this.socket = io(API_BASE_URL, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: this.maxReconnectAttempts,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    this.socket.on('connect', () => {
      console.log('[Sync] Connected to server');
      this.setStatus('connected');
      this.reconnectAttempts = 0;
      
      // 请求同步最新数据
      if (this.lastSyncTime > 0) {
        this.socket?.emit('sync:request', { since: this.lastSyncTime });
      }
    });

    this.socket.on('disconnect', (reason) => {
      console.log('[Sync] Disconnected:', reason);
      if (this.isOnline) {
        this.setStatus('disconnected');
      } else {
        this.setStatus('offline');
      }
    });

    this.socket.on('connect_error', (error) => {
      console.error('[Sync] Connection error:', error);
      this.reconnectAttempts++;
      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        this.setStatus('error');
      }
    });

    // 处理同步更新事件
    this.socket.on('sync:update', (event: SyncEvent) => {
      console.log('[Sync] Received update:', event);
      this.lastSyncTime = event.timestamp;
      this.eventHandlers.forEach(handler => handler(event));
    });

    // 处理同步确认
    this.socket.on('sync:ack', (data: { serverTime: number }) => {
      this.lastSyncTime = data.serverTime;
    });

    // 心跳响应
    this.socket.on('sync:heartbeat:ack', (data: { serverTime: number }) => {
      this.lastSyncTime = data.serverTime;
    });
  }

  /**
   * 断开连接
   */
  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.setStatus('disconnected');
  }

  /**
   * 重新连接
   */
  reconnect() {
    const token = this.getStoredToken();
    if (token) {
      this.disconnect();
      this.connect(token);
    }
  }

  private getStoredToken(): string | null {
    try {
      const authData = localStorage.getItem('auth-data');
      if (authData) {
        return JSON.parse(authData).token;
      }
    } catch {
      // ignore
    }
    return null;
  }

  /**
   * 获取当前同步状态
   */
  getStatus(): SyncStatus {
    return this.status;
  }

  /**
   * 检查是否已连接
   */
  isConnected(): boolean {
    return this.socket?.connected ?? false;
  }

  /**
   * 订阅同步事件
   */
  onSyncEvent(handler: SyncEventHandler): () => void {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }

  /**
   * 订阅状态变化
   */
  onStatusChange(handler: StatusChangeHandler): () => void {
    this.statusHandlers.add(handler);
    // 立即通知当前状态
    handler(this.status);
    return () => this.statusHandlers.delete(handler);
  }

  /**
   * 发送心跳
   */
  sendHeartbeat() {
    if (this.socket?.connected) {
      this.socket.emit('sync:heartbeat');
    }
  }

  /**
   * 请求同步
   */
  requestSync(since?: number) {
    if (this.socket?.connected) {
      this.socket.emit('sync:request', { since: since || this.lastSyncTime });
    }
  }

  /**
   * 获取最后同步时间
   */
  getLastSyncTime(): number {
    return this.lastSyncTime;
  }

  /**
   * 设置最后同步时间
   */
  setLastSyncTime(time: number) {
    this.lastSyncTime = time;
  }

  /**
   * 清理资源
   */
  destroy() {
    window.removeEventListener('online', this.handleOnline);
    window.removeEventListener('offline', this.handleOffline);
    this.disconnect();
    this.eventHandlers.clear();
    this.statusHandlers.clear();
  }
}

export const syncService = new SyncService();
