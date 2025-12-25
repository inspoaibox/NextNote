import type { EncryptedData } from './crypto';

/**
 * 文件夹相关类型定义
 */

/** 文件夹实体 */
export interface Folder {
  /** 文件夹ID */
  id: string;
  /** 用户ID */
  userId: string;
  /** 加密的名称 */
  encryptedName: EncryptedData;
  /** 父文件夹ID */
  parentId: string | null;
  /** 排序顺序 */
  order: number;
  /** 是否有密码保护 */
  hasPassword: boolean;
  /** 密码是否继承自父文件夹 */
  passwordInherited: boolean;
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

/** 本地文件夹（解密后） */
export interface LocalFolder {
  /** 文件夹ID */
  id: string;
  /** 名称 */
  name: string;
  /** 父文件夹ID */
  parentId: string | null;
  /** 排序顺序 */
  order: number;
  /** 是否有密码保护 */
  hasPassword: boolean;
  /** 同步版本号 */
  syncVersion: number;
  /** 是否有未同步的修改 */
  isDirty: boolean;
  /** 创建时间 */
  createdAt: number;
  /** 更新时间 */
  updatedAt: number;
}

/** 文件夹树节点 */
export interface FolderNode extends LocalFolder {
  /** 子文件夹 */
  children: FolderNode[];
  /** 笔记数量 */
  noteCount: number;
  /** 层级深度 */
  depth: number;
}

/** 创建文件夹请求 */
export interface CreateFolderRequest {
  /** 加密的名称 */
  encryptedName: EncryptedData;
  /** 父文件夹ID */
  parentId?: string;
}

/** 更新文件夹请求 */
export interface UpdateFolderRequest {
  /** 加密的名称 */
  encryptedName?: EncryptedData;
  /** 父文件夹ID */
  parentId?: string | null;
  /** 排序顺序 */
  order?: number;
}

/** 最大文件夹嵌套深度 */
export const MAX_FOLDER_DEPTH = 10;
