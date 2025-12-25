import type { EncryptedData, KeyDerivationParams } from './crypto';

/**
 * 用户相关类型定义
 */

/** 用户实体 */
export interface User {
  /** 用户ID */
  id: string;
  /** 邮箱 */
  email: string;
  /** 加密的KEK */
  encryptedKEK: string;
  /** 密钥派生盐值 */
  salt: string;
  /** 恢复密钥哈希 */
  recoveryKeyHash: string;
  /** 创建时间 */
  createdAt: Date;
  /** 更新时间 */
  updatedAt: Date;
}

/** 设备实体 */
export interface Device {
  /** 设备ID */
  id: string;
  /** 用户ID */
  userId: string;
  /** 设备名称 */
  name: string;
  /** 设备公钥 */
  publicKey: string;
  /** 最后同步时间 */
  lastSyncAt: Date;
  /** 创建时间 */
  createdAt: Date;
  /** 是否已验证 */
  isVerified: boolean;
}

/** 注册请求 */
export interface RegisterRequest {
  /** 邮箱 */
  email: string;
  /** 加密的KEK */
  encryptedKEK: string;
  /** 密钥派生盐值 */
  salt: string;
  /** 恢复密钥哈希 */
  recoveryKeyHash: string;
  /** 设备名称 */
  deviceName: string;
  /** 设备公钥 */
  devicePublicKey: string;
}

/** 注册响应 */
export interface RegisterResponse {
  /** 用户ID */
  userId: string;
  /** 设备ID */
  deviceId: string;
  /** JWT令牌 */
  token: string;
  /** 恢复密钥（仅注册时返回） */
  recoveryWords: string[];
}

/** 登录请求 */
export interface LoginRequest {
  /** 邮箱 */
  email: string;
  /** 设备名称 */
  deviceName: string;
  /** 设备公钥 */
  devicePublicKey: string;
}

/** 登录响应 */
export interface LoginResponse {
  /** 用户ID */
  userId: string;
  /** 设备ID */
  deviceId: string;
  /** JWT令牌 */
  token: string;
  /** 加密的KEK */
  encryptedKEK: string;
  /** 密钥派生盐值 */
  salt: string;
  /** 是否需要设备验证 */
  requiresVerification: boolean;
}

/** JWT载荷 */
export interface JWTPayload {
  /** 用户ID */
  userId: string;
  /** 设备ID */
  deviceId: string;
  /** 过期时间 */
  exp: number;
  /** 签发时间 */
  iat: number;
}
