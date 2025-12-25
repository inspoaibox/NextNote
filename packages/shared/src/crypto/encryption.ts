/**
 * AES-256-GCM 加密/解密实现
 */

import {
  generateRandomBytes,
  arrayBufferToBase64,
  base64ToArrayBuffer,
  stringToArrayBuffer,
  arrayBufferToString,
} from './utils';
import type { EncryptedData, EncryptedBinary } from '../types/crypto';

/** IV长度（12字节，GCM推荐） */
const IV_LENGTH = 12;

/** 认证标签长度（128位） */
const TAG_LENGTH = 128;

/**
 * 生成数据加密密钥（DEK）
 * @returns 256位AES-GCM密钥
 */
export async function generateDEK(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}

/**
 * 加密文本数据
 * @param plaintext 明文
 * @param dek 数据加密密钥
 * @returns 加密数据
 */
export async function encrypt(
  plaintext: string,
  dek: CryptoKey
): Promise<EncryptedData> {
  const iv = generateRandomBytes(IV_LENGTH);
  const plaintextBuffer = stringToArrayBuffer(plaintext);

  const ciphertextWithTag = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: new Uint8Array(iv),
      tagLength: TAG_LENGTH,
    },
    dek,
    plaintextBuffer
  );

  // GCM模式下，认证标签附加在密文末尾
  const ciphertextArray = new Uint8Array(ciphertextWithTag);
  const tagStart = ciphertextArray.length - TAG_LENGTH / 8;
  const ciphertext = ciphertextArray.slice(0, tagStart);
  const tag = ciphertextArray.slice(tagStart);

  return {
    iv: arrayBufferToBase64(iv.buffer as ArrayBuffer),
    ciphertext: arrayBufferToBase64(ciphertext.buffer as ArrayBuffer),
    tag: arrayBufferToBase64(tag.buffer as ArrayBuffer),
    algorithm: 'AES-256-GCM',
  };
}

/**
 * 解密文本数据
 * @param encryptedData 加密数据
 * @param dek 数据加密密钥
 * @returns 明文
 */
export async function decrypt(
  encryptedData: EncryptedData,
  dek: CryptoKey
): Promise<string> {
  const iv = new Uint8Array(base64ToArrayBuffer(encryptedData.iv));
  const ciphertext = new Uint8Array(base64ToArrayBuffer(encryptedData.ciphertext));
  const tag = new Uint8Array(base64ToArrayBuffer(encryptedData.tag));

  // 重新组合密文和标签
  const ciphertextWithTag = new Uint8Array(ciphertext.length + tag.length);
  ciphertextWithTag.set(ciphertext);
  ciphertextWithTag.set(tag, ciphertext.length);

  const plaintextBuffer = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: iv,
      tagLength: TAG_LENGTH,
    },
    dek,
    ciphertextWithTag
  );

  return arrayBufferToString(plaintextBuffer);
}

/**
 * 加密二进制数据（如图片）
 * @param data 二进制数据
 * @param dek 数据加密密钥
 * @returns 加密的二进制数据
 */
export async function encryptBinary(
  data: ArrayBuffer,
  dek: CryptoKey
): Promise<EncryptedBinary> {
  const iv = generateRandomBytes(IV_LENGTH);

  const ciphertextWithTag = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: new Uint8Array(iv),
      tagLength: TAG_LENGTH,
    },
    dek,
    data
  );

  const ciphertextArray = new Uint8Array(ciphertextWithTag);
  const tagStart = ciphertextArray.length - TAG_LENGTH / 8;
  const ciphertext = ciphertextArray.slice(0, tagStart);
  const tag = ciphertextArray.slice(tagStart);

  return {
    iv: arrayBufferToBase64(iv.buffer as ArrayBuffer),
    data: arrayBufferToBase64(ciphertext.buffer as ArrayBuffer),
    tag: arrayBufferToBase64(tag.buffer as ArrayBuffer),
    algorithm: 'AES-256-GCM',
  };
}

/**
 * 解密二进制数据
 * @param encryptedBinary 加密的二进制数据
 * @param dek 数据加密密钥
 * @returns 原始二进制数据
 */
export async function decryptBinary(
  encryptedBinary: EncryptedBinary,
  dek: CryptoKey
): Promise<ArrayBuffer> {
  const iv = new Uint8Array(base64ToArrayBuffer(encryptedBinary.iv));
  const ciphertext = new Uint8Array(base64ToArrayBuffer(encryptedBinary.data));
  const tag = new Uint8Array(base64ToArrayBuffer(encryptedBinary.tag));

  const ciphertextWithTag = new Uint8Array(ciphertext.length + tag.length);
  ciphertextWithTag.set(ciphertext);
  ciphertextWithTag.set(tag, ciphertext.length);

  return crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: iv,
      tagLength: TAG_LENGTH,
    },
    dek,
    ciphertextWithTag
  );
}

/**
 * 导出DEK为原始字节
 * @param dek 数据加密密钥
 * @returns 原始字节
 */
export async function exportDEK(dek: CryptoKey): Promise<ArrayBuffer> {
  return crypto.subtle.exportKey('raw', dek);
}

/**
 * 从原始字节导入DEK
 * @param keyBytes 原始字节
 * @returns 数据加密密钥
 */
export async function importDEK(keyBytes: ArrayBuffer): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}
