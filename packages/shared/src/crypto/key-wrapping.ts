/**
 * 密钥包装/解包装实现
 * 使用AES-KW (Key Wrap) 算法
 */

import { arrayBufferToBase64, base64ToArrayBuffer } from './utils';
import type { WrappedKey } from '../types/crypto';

/**
 * 使用KEK包装DEK
 * @param dek 数据加密密钥
 * @param kek 密钥加密密钥
 * @returns 包装后的密钥
 */
export async function wrapDEK(
  dek: CryptoKey,
  kek: CryptoKey
): Promise<WrappedKey> {
  const wrappedKeyBuffer = await crypto.subtle.wrapKey(
    'raw',
    dek,
    kek,
    'AES-KW'
  );

  return {
    wrappedKey: arrayBufferToBase64(wrappedKeyBuffer),
    algorithm: 'AES-KW',
  };
}

/**
 * 使用KEK解包装DEK
 * @param wrappedKey 包装后的密钥
 * @param kek 密钥加密密钥
 * @returns 数据加密密钥
 */
export async function unwrapDEK(
  wrappedKey: WrappedKey,
  kek: CryptoKey
): Promise<CryptoKey> {
  const wrappedKeyBuffer = base64ToArrayBuffer(wrappedKey.wrappedKey);

  return crypto.subtle.unwrapKey(
    'raw',
    wrappedKeyBuffer,
    kek,
    'AES-KW',
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}

/**
 * 生成用于密钥包装的KEK
 * @returns KEK
 */
export async function generateKEK(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    { name: 'AES-KW', length: 256 },
    true,
    ['wrapKey', 'unwrapKey']
  );
}

/**
 * 导出KEK为原始字节
 * @param kek 密钥加密密钥
 * @returns 原始字节
 */
export async function exportKEK(kek: CryptoKey): Promise<ArrayBuffer> {
  return crypto.subtle.exportKey('raw', kek);
}

/**
 * 从原始字节导入KEK
 * @param keyBytes 原始字节
 * @returns 密钥加密密钥
 */
export async function importKEK(keyBytes: ArrayBuffer): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'AES-KW', length: 256 },
    true,
    ['wrapKey', 'unwrapKey']
  );
}

/**
 * 重新包装DEK（用于密码变更）
 * @param wrappedKey 原包装密钥
 * @param oldKEK 旧KEK
 * @param newKEK 新KEK
 * @returns 新包装密钥
 */
export async function rewrapDEK(
  wrappedKey: WrappedKey,
  oldKEK: CryptoKey,
  newKEK: CryptoKey
): Promise<WrappedKey> {
  // 使用旧KEK解包装
  const dek = await unwrapDEK(wrappedKey, oldKEK);
  // 使用新KEK重新包装
  return wrapDEK(dek, newKEK);
}
