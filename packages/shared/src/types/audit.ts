/**
 * 审计日志相关类型定义
 */

/** 审计操作类型 */
export type AuditAction =
  | 'login'
  | 'logout'
  | 'register'
  | 'password_change'
  | 'device_add'
  | 'device_remove'
  | 'session_revoke'
  | 'note_create'
  | 'note_delete'
  | 'note_share'
  | 'backup_create'
  | 'backup_restore';

/** 审计日志 */
export interface AuditLog {
  /** 日志ID */
  id: string;
  /** 用户ID */
  userId: string;
  /** 操作类型 */
  action: AuditAction;
  /** 设备ID */
  deviceId: string;
  /** 加密的IP地址 */
  encryptedIpAddress: string;
  /** User Agent */
  userAgent: string;
  /** 额外数据 */
  metadata?: Record<string, unknown>;
  /** 创建时间 */
  createdAt: number;
}

/** 审计日志查询请求 */
export interface AuditLogQueryRequest {
  /** 限制数量 */
  limit?: number;
  /** 偏移量 */
  offset?: number;
  /** 操作类型过滤 */
  action?: AuditAction;
  /** 开始时间 */
  startTime?: number;
  /** 结束时间 */
  endTime?: number;
}

/** 审计日志查询响应 */
export interface AuditLogQueryResponse {
  /** 日志列表 */
  logs: AuditLog[];
  /** 总数 */
  total: number;
}

/** 最大审计日志返回数量 */
export const MAX_AUDIT_LOG_LIMIT = 100;
