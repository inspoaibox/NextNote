import type { EncryptedData } from './crypto';

/**
 * 同步相关类型定义
 */

/** 向量时钟 */
export interface VectorClock {
  [deviceId: string]: number;
}

/** 同步操作类型 */
export type SyncOperation = 'create' | 'update' | 'delete';

/** 同步实体类型 */
export type SyncEntityType = 'note' | 'folder' | 'image';

/** 同步变更 */
export interface SyncChange {
  /** 变更ID */
  id: string;
  /** 实体类型 */
  entityType: SyncEntityType;
  /** 实体ID */
  entityId: string;
  /** 操作类型 */
  operation: SyncOperation;
  /** 加密的数据 */
  encryptedData: EncryptedData | null;
  /** 向量时钟 */
  vectorClock: VectorClock;
  /** 设备ID */
  deviceId: string;
  /** 时间戳 */
  timestamp: number;
  /** HMAC校验和 */
  checksum: string;
}

/** 同步状态 */
export type SyncStatus = 'idle' | 'syncing' | 'error' | 'offline';

/** 同步结果 */
export interface SyncResult {
  /** 是否成功 */
  success: boolean;
  /** 已同步的变更数量 */
  syncedCount: number;
  /** 冲突列表 */
  conflicts: SyncConflict[];
  /** 最后同步时间 */
  lastSyncTime: number;
}

/** 同步冲突 */
export interface SyncConflict {
  /** 实体类型 */
  entityType: SyncEntityType;
  /** 实体ID */
  entityId: string;
  /** 本地版本 */
  localVersion: SyncChange;
  /** 远程版本 */
  remoteVersion: SyncChange;
}

/** 冲突解决方式 */
export type ConflictResolution = 'keep-local' | 'keep-remote' | 'keep-both';

/** 同步推送请求 */
export interface SyncPushRequest {
  /** 变更列表 */
  changes: SyncChange[];
  /** 设备ID */
  deviceId: string;
}

/** 同步拉取请求 */
export interface SyncPullRequest {
  /** 上次同步时间 */
  since: number;
  /** 设备ID */
  deviceId: string;
}

/** 同步拉取响应 */
export interface SyncPullResponse {
  /** 变更列表 */
  changes: SyncChange[];
  /** 服务器时间 */
  serverTime: number;
}
