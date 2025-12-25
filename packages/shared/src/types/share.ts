/**
 * 共享相关类型定义
 */

/** 共享权限 */
export type SharePermission = 'view' | 'edit';

/** 共享记录 */
export interface ShareRecord {
  /** 共享ID */
  id: string;
  /** 笔记ID */
  noteId: string;
  /** 所有者ID */
  ownerId: string;
  /** 接收者邮箱 */
  recipientEmail: string;
  /** 加密的共享密钥（用接收者公钥加密） */
  encryptedShareKey: string;
  /** 权限级别 */
  permission: SharePermission;
  /** 创建时间 */
  createdAt: number;
  /** 过期时间 */
  expiresAt: number | null;
  /** 是否已撤销 */
  isRevoked: boolean;
}

/** 创建共享请求 */
export interface CreateShareRequest {
  /** 笔记ID */
  noteId: string;
  /** 接收者邮箱 */
  recipientEmail: string;
  /** 加密的共享密钥 */
  encryptedShareKey: string;
  /** 权限级别 */
  permission: SharePermission;
  /** 过期时间（可选） */
  expiresAt?: number;
}

/** 共享访问请求 */
export interface ShareAccessRequest {
  /** 共享ID */
  shareId: string;
  /** 共享密钥 */
  shareKey: string;
}

/** 共享访问响应 */
export interface ShareAccessResponse {
  /** 是否有权限 */
  hasAccess: boolean;
  /** 权限级别 */
  permission?: SharePermission;
  /** 加密的笔记数据 */
  encryptedNote?: string;
  /** 错误信息 */
  error?: string;
}
