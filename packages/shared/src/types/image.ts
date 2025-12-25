import type { EncryptedBinary } from './crypto';

/**
 * 图片相关类型定义
 */

/** 图片记录 */
export interface ImageRecord {
  /** 图片ID */
  id: string;
  /** 笔记ID */
  noteId: string;
  /** 用户ID */
  userId: string;
  /** 加密的图片数据 */
  encryptedData: EncryptedBinary;
  /** MIME类型 */
  mimeType: string;
  /** 文件大小（字节） */
  size: number;
  /** SHA-256校验和 */
  checksum: string;
  /** 是否标记为删除 */
  markedForDeletion: boolean;
  /** 计划删除时间 */
  deletionDate: number | null;
  /** 创建时间 */
  createdAt: number;
}

/** 图片引用 */
export interface ImageReference {
  /** 图片ID */
  id: string;
  /** 本地URL（blob URL或远程URL） */
  url: string;
  /** MIME类型 */
  mimeType: string;
  /** 文件大小 */
  size: number;
}

/** 上传图片请求 */
export interface UploadImageRequest {
  /** 笔记ID */
  noteId: string;
  /** 加密的图片数据 */
  encryptedData: EncryptedBinary;
  /** MIME类型 */
  mimeType: string;
  /** 文件大小 */
  size: number;
  /** 校验和 */
  checksum: string;
}

/** 上传图片响应 */
export interface UploadImageResponse {
  /** 图片ID */
  imageId: string;
  /** 是否成功 */
  success: boolean;
}

/** 图片删除延迟天数 */
export const IMAGE_DELETION_DELAY_DAYS = 30;
