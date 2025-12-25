// 导出所有类型
export * from './types';

// 导出加密模块
export * from './crypto';

// 导出同步模块
export * from './sync';

// 导出备份模块
export * from './backup';

// 导出密码保护模块
export * from './password';

// 导出共享模块（排除与 types 重复的类型）
export {
  generateShareKey,
  createShareRecord,
  isShareValid,
  hasPermission,
  revokeShare,
  isNoteShared,
  getActiveShares,
  getSharesByRecipient,
  DEFAULT_NOTE_VISIBILITY,
} from './sharing';

// 导出编辑器模块（排除与 types 重复的类型）
export {
  generateImageId,
  createImageReference,
  markImageForDeletion,
  unmarkImageForDeletion,
  shouldDeleteImage,
  markNoteImagesForDeletion,
  getImagesForPermanentDeletion,
  getImagesForNote,
  isValidImageType,
  getExtensionFromMimeType,
  generateMarkdownImageRef,
  extractImageIds,
  areImageReferencesUnique,
} from './editor/image-service';
export * from './editor/markdown-service';

// 导出搜索模块
export * from './search';

// 导出审计模块（排除与 types 重复的类型）
export {
  generateAuditLogId,
  createAuditLogEntry,
  isValidAuditLogEntry,
  isIpAddressEncrypted,
  filterLogsByAction,
  filterLogsByDateRange,
  getRecentLogs,
  getLoginHistory,
  getSecurityEvents,
  countFailedLogins,
  shouldLockAccount,
} from './audit/audit-service';
export type { AuditLogEntry, CreateAuditLogParams } from './audit/audit-service';
