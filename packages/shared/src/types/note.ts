import type { EncryptedData, WrappedKey } from './crypto';

/**
 * 笔记相关类型定义
 */

/** 笔记可见性 */
export type NoteVisibility = 'private' | 'shared';

/** 笔记实体 */
export interface Note {
  /** 笔记ID */
  id: string;
  /** 用户ID */
  userId: string;
  /** 加密的标题 */
  encryptedTitle: EncryptedData;
  /** 加密的内容 */
  encryptedContent: EncryptedData;
  /** 加密的DEK */
  encryptedDEK: WrappedKey;
  /** 所属文件夹ID */
  folderId: string | null;
  /** 是否置顶 */
  isPinned: boolean;
  /** 置顶时间 */
  pinnedAt: number | null;
  /** 是否有密码保护 */
  hasPassword: boolean;
  /** 加密的密码盐值 */
  encryptedPasswordSalt: string | null;
  /** 标签列表 */
  tags: string[];
  /** 可见性 */
  visibility: NoteVisibility;
  /** 同步版本号 */
  syncVersion: number;
  /** 创建时间 */
  createdAt: number;
  /** 更新时间 */
  updatedAt: number;
  /** 是否已删除 */
  isDeleted: boolean;
  /** 删除时间 */
  deletedAt: number | null;
}

/** 本地笔记（解密后） */
export interface LocalNote {
  /** 笔记ID */
  id: string;
  /** 标题 */
  title: string;
  /** 内容 */
  content: string;
  /** 所属文件夹ID */
  folderId: string | null;
  /** 是否置顶 */
  isPinned: boolean;
  /** 置顶时间 */
  pinnedAt: number | null;
  /** 是否有密码保护 */
  hasPassword: boolean;
  /** 标签列表 */
  tags: string[];
  /** 同步版本号 */
  syncVersion: number;
  /** 本地版本号 */
  localVersion: number;
  /** 是否有未同步的修改 */
  isDirty: boolean;
  /** 创建时间 */
  createdAt: number;
  /** 更新时间 */
  updatedAt: number;
}

/** 笔记版本 */
export interface NoteVersion {
  /** 版本ID */
  id: string;
  /** 笔记ID */
  noteId: string;
  /** 加密的内容 */
  encryptedContent: EncryptedData;
  /** 加密的DEK */
  encryptedDEK: WrappedKey;
  /** 内容大小（字节） */
  size: number;
  /** 创建时间 */
  createdAt: number;
}

/** 创建笔记请求 */
export interface CreateNoteRequest {
  /** 加密的标题 */
  encryptedTitle: EncryptedData;
  /** 加密的内容 */
  encryptedContent: EncryptedData;
  /** 加密的DEK */
  encryptedDEK: WrappedKey;
  /** 所属文件夹ID */
  folderId?: string;
  /** 标签列表 */
  tags?: string[];
}

/** 更新笔记请求 */
export interface UpdateNoteRequest {
  /** 加密的标题 */
  encryptedTitle?: EncryptedData;
  /** 加密的内容 */
  encryptedContent?: EncryptedData;
  /** 加密的DEK */
  encryptedDEK?: WrappedKey;
  /** 所属文件夹ID */
  folderId?: string | null;
  /** 标签列表 */
  tags?: string[];
}
