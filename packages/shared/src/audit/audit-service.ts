/**
 * Audit Service Module
 * Handles security audit logging
 */

/**
 * Audit log action types
 */
export type AuditAction =
  | 'login'
  | 'logout'
  | 'login_failed'
  | 'password_change'
  | 'recovery_key_used'
  | 'note_created'
  | 'note_updated'
  | 'note_deleted'
  | 'note_shared'
  | 'share_revoked'
  | 'backup_created'
  | 'backup_restored'
  | 'device_added'
  | 'device_removed'
  | 'session_revoked';

/**
 * Audit log entry
 */
export interface AuditLogEntry {
  /** Unique log ID */
  id: string;
  /** User ID */
  userId: string;
  /** Action performed */
  action: AuditAction;
  /** Device ID (if applicable) */
  deviceId: string | null;
  /** Encrypted IP address */
  encryptedIpAddress: string;
  /** User agent string */
  userAgent: string;
  /** Additional metadata */
  metadata: Record<string, unknown> | null;
  /** Timestamp */
  createdAt: number;
}

/**
 * Audit log creation params
 */
export interface CreateAuditLogParams {
  userId: string;
  action: AuditAction;
  deviceId?: string;
  ipAddress: string;
  userAgent: string;
  metadata?: Record<string, unknown>;
}

/**
 * Generate audit log ID
 */
export function generateAuditLogId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return `audit_${timestamp}_${random}`;
}

/**
 * Create audit log entry
 * Note: IP address should be encrypted before storing
 */
export function createAuditLogEntry(
  params: CreateAuditLogParams,
  encryptedIpAddress: string
): AuditLogEntry {
  return {
    id: generateAuditLogId(),
    userId: params.userId,
    action: params.action,
    deviceId: params.deviceId || null,
    encryptedIpAddress,
    userAgent: params.userAgent,
    metadata: params.metadata || null,
    createdAt: Date.now(),
  };
}

/**
 * Check if audit log entry has required fields
 */
export function isValidAuditLogEntry(entry: AuditLogEntry): boolean {
  return (
    typeof entry.id === 'string' &&
    entry.id.length > 0 &&
    typeof entry.userId === 'string' &&
    entry.userId.length > 0 &&
    typeof entry.action === 'string' &&
    typeof entry.encryptedIpAddress === 'string' &&
    entry.encryptedIpAddress.length > 0 &&
    typeof entry.userAgent === 'string' &&
    typeof entry.createdAt === 'number'
  );
}

/**
 * Check if IP address is encrypted (not plaintext)
 */
export function isIpAddressEncrypted(value: string): boolean {
  // Plaintext IP addresses match these patterns
  const ipv4Pattern = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;
  const ipv6Pattern = /^[0-9a-fA-F:]+$/;
  
  // If it matches plaintext patterns, it's not encrypted
  if (ipv4Pattern.test(value) || ipv6Pattern.test(value)) {
    return false;
  }
  
  // Encrypted data should be longer and contain base64 characters
  return value.length > 20;
}

/**
 * Filter audit logs by action
 */
export function filterLogsByAction(
  logs: AuditLogEntry[],
  actions: AuditAction[]
): AuditLogEntry[] {
  return logs.filter(log => actions.includes(log.action));
}

/**
 * Filter audit logs by date range
 */
export function filterLogsByDateRange(
  logs: AuditLogEntry[],
  startDate: number,
  endDate: number
): AuditLogEntry[] {
  return logs.filter(log => 
    log.createdAt >= startDate && log.createdAt <= endDate
  );
}

/**
 * Get recent audit logs (last N entries)
 */
export function getRecentLogs(
  logs: AuditLogEntry[],
  count: number = 100
): AuditLogEntry[] {
  return [...logs]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, count);
}

/**
 * Get login history for a user
 */
export function getLoginHistory(logs: AuditLogEntry[]): AuditLogEntry[] {
  return filterLogsByAction(logs, ['login', 'login_failed', 'logout']);
}

/**
 * Get security-related events
 */
export function getSecurityEvents(logs: AuditLogEntry[]): AuditLogEntry[] {
  return filterLogsByAction(logs, [
    'login_failed',
    'password_change',
    'recovery_key_used',
    'session_revoked',
    'device_removed',
  ]);
}

/**
 * Count failed login attempts in time window
 */
export function countFailedLogins(
  logs: AuditLogEntry[],
  windowMs: number = 15 * 60 * 1000 // 15 minutes
): number {
  const cutoff = Date.now() - windowMs;
  return logs.filter(
    log => log.action === 'login_failed' && log.createdAt >= cutoff
  ).length;
}

/**
 * Check if account should be locked due to failed attempts
 */
export function shouldLockAccount(
  logs: AuditLogEntry[],
  maxAttempts: number = 5,
  windowMs: number = 15 * 60 * 1000
): boolean {
  return countFailedLogins(logs, windowMs) >= maxAttempts;
}
