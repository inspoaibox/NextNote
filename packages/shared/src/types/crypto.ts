/**
 * 加密相关类型定义
 */

/** 加密数据结构 */
export interface EncryptedData {
  /** Base64 编码的初始化向量 */
  iv: string;
  /** Base64 编码的密文 */
  ciphertext: string;
  /** Base64 编码的认证标签 */
  tag: string;
  /** 加密算法 */
  algorithm: 'AES-256-GCM';
}

/** 加密的二进制数据 */
export interface EncryptedBinary {
  /** Base64 编码的初始化向量 */
  iv: string;
  /** Base64 编码的加密数据 */
  data: string;
  /** Base64 编码的认证标签 */
  tag: string;
  /** 加密算法 */
  algorithm: 'AES-256-GCM';
}

/** 包装的密钥 */
export interface WrappedKey {
  /** Base64 编码的包装密钥 */
  wrappedKey: string;
  /** 密钥包装算法 */
  algorithm: 'AES-KW';
}

/** 密钥派生参数 */
export interface KeyDerivationParams {
  /** Base64 编码的盐值 */
  salt: string;
  /** 迭代次数 */
  iterations: number;
  /** 内存成本 (KB) */
  memoryCost: number;
  /** 算法 */
  algorithm: 'Argon2id';
}

/** 恢复密钥 */
export interface RecoveryKey {
  /** 24个助记词 */
  words: string[];
  /** 创建时间 */
  createdAt: number;
}

/** 密钥存储 */
export interface KeyStore {
  /** 用户ID */
  userId: string;
  /** 加密的KEK */
  encryptedKEK: EncryptedData;
  /** 密钥派生参数 */
  derivationParams: KeyDerivationParams;
  /** 恢复密钥哈希 */
  recoveryKeyHash: string;
}
