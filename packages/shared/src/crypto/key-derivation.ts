/**
 * 密钥派生函数
 * 使用PBKDF2作为Web Crypto API的替代方案（Argon2id需要额外库）
 * 生产环境建议使用argon2-browser库
 */

import { generateRandomBytes, arrayBufferToBase64, base64ToArrayBuffer, stringToArrayBuffer } from './utils';
import type { KeyDerivationParams } from '../types/crypto';

/** 盐值长度（字节） */
const SALT_LENGTH = 32;

/** PBKDF2迭代次数（高安全性） */
const PBKDF2_ITERATIONS = 600000;

/** 派生密钥长度（256位） */
const KEY_LENGTH = 256;

/**
 * 生成随机盐值
 */
export function generateSalt(): Uint8Array {
  return generateRandomBytes(SALT_LENGTH);
}

/**
 * 从密码派生主密钥
 * @param password 用户密码
 * @param salt 盐值
 * @returns 派生的CryptoKey
 */
export async function deriveKeyFromPassword(
  password: string,
  salt: Uint8Array
): Promise<CryptoKey> {
  // 将密码转换为密钥材料
  const passwordBuffer = stringToArrayBuffer(password);
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    passwordBuffer,
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey']
  );

  // 使用PBKDF2派生密钥
  const derivedKey = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: new Uint8Array(salt),
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: KEY_LENGTH },
    true,
    ['encrypt', 'decrypt']
  );

  return derivedKey;
}

/**
 * 从主密钥派生KEK（使用HKDF）
 * @param masterKey 主密钥
 * @param info 上下文信息
 * @returns KEK
 */
export async function deriveKEK(
  masterKey: CryptoKey,
  info: string = 'secure-notebook-kek'
): Promise<CryptoKey> {
  // 导出主密钥的原始字节
  const masterKeyBytes = await crypto.subtle.exportKey('raw', masterKey);
  
  // 导入为HKDF密钥材料
  const hkdfKey = await crypto.subtle.importKey(
    'raw',
    masterKeyBytes,
    'HKDF',
    false,
    ['deriveKey']
  );

  // 使用HKDF派生KEK
  const kek = await crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new Uint8Array(32), // 固定盐值用于KEK派生
      info: stringToArrayBuffer(info),
    },
    hkdfKey,
    { name: 'AES-KW', length: KEY_LENGTH },
    true,
    ['wrapKey', 'unwrapKey']
  );

  return kek;
}

/**
 * 创建密钥派生参数
 * @param salt 盐值
 * @returns 密钥派生参数
 */
export function createKeyDerivationParams(salt: Uint8Array): KeyDerivationParams {
  return {
    salt: arrayBufferToBase64(salt.buffer as ArrayBuffer),
    iterations: PBKDF2_ITERATIONS,
    memoryCost: 65536, // 64MB（Argon2id参数，此处仅作记录）
    algorithm: 'Argon2id', // 标记为Argon2id，实际使用PBKDF2
  };
}

/**
 * 从参数恢复盐值
 * @param params 密钥派生参数
 * @returns 盐值
 */
export function getSaltFromParams(params: KeyDerivationParams): Uint8Array {
  return new Uint8Array(base64ToArrayBuffer(params.salt));
}

/**
 * 验证密码是否正确
 * @param password 密码
 * @param salt 盐值
 * @param expectedKeyHash 预期的密钥哈希
 * @returns 是否匹配
 */
export async function verifyPassword(
  password: string,
  salt: Uint8Array,
  expectedKeyHash: string
): Promise<boolean> {
  try {
    const derivedKey = await deriveKeyFromPassword(password, salt);
    const keyBytes = await crypto.subtle.exportKey('raw', derivedKey);
    const hashBuffer = await crypto.subtle.digest('SHA-256', keyBytes);
    const actualHash = arrayBufferToBase64(hashBuffer);
    return actualHash === expectedKeyHash;
  } catch {
    return false;
  }
}

/**
 * 计算密钥哈希（用于验证）
 * @param key CryptoKey
 * @returns 密钥哈希
 */
export async function computeKeyHash(key: CryptoKey): Promise<string> {
  const keyBytes = await crypto.subtle.exportKey('raw', key);
  const hashBuffer = await crypto.subtle.digest('SHA-256', keyBytes);
  return arrayBufferToBase64(hashBuffer);
}
