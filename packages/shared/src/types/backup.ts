import type { EncryptedData } from './crypto';

/**
 * 备份相关类型定义
 */

/** WebDAV配置 */
export interface WebDAVConfig {
  /** WebDAV服务器URL */
  url: string;
  /** 用户名 */
  username: string;
  /** 加密的密码 */
  encryptedPassword: EncryptedData;
  /** 备份路径 */
  path: string;
  /** 是否启用 */
  enabled: boolean;
}

/** 备份信息 */
export interface BackupInfo {
  /** 备份ID */
  id: string;
  /** 备份时间戳 */
  timestamp: number;
  /** 备份大小（字节） */
  size: number;
  /** SHA-256校验和 */
  checksum: string;
  /** 笔记数量 */
  noteCount: number;
  /** 文件夹数量 */
  folderCount: number;
  /** 备份类型 */
  type: 'webdav' | 'cloud';
}

/** 备份元数据 */
export interface BackupMetadata {
  /** 备份版本 */
  version: string;
  /** 创建时间 */
  createdAt: number;
  /** 用户ID */
  userId: string;
  /** 笔记ID列表 */
  noteIds: string[];
  /** 文件夹ID列表 */
  folderIds: string[];
  /** 图片ID列表 */
  imageIds: string[];
  /** 校验和 */
  checksum: string;
}

/** 备份数据包 */
export interface BackupBundle {
  /** 元数据 */
  metadata: BackupMetadata;
  /** 加密的笔记数据 */
  encryptedNotes: string;
  /** 加密的文件夹数据 */
  encryptedFolders: string;
  /** 加密的图片引用 */
  encryptedImages: string;
}

/** 备份结果 */
export interface BackupResult {
  /** 是否成功 */
  success: boolean;
  /** 备份信息 */
  backupInfo?: BackupInfo;
  /** 错误信息 */
  error?: string;
}

/** 恢复结果 */
export interface RestoreResult {
  /** 是否成功 */
  success: boolean;
  /** 恢复的笔记数量 */
  notesRestored: number;
  /** 恢复的文件夹数量 */
  foldersRestored: number;
  /** 错误信息 */
  error?: string;
}

/** 云备份设置 */
export interface CloudBackupSettings {
  /** 是否启用 */
  enabled: boolean;
  /** 备份频率（小时） */
  frequencyHours: number;
  /** 保留版本数 */
  retentionCount: number;
  /** 上次备份时间 */
  lastBackupAt: number | null;
}

/** 最大云备份版本数 */
export const MAX_CLOUD_BACKUP_VERSIONS = 30;
