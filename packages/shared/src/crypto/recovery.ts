/**
 * 恢复密钥生成和验证
 * 使用BIP39风格的助记词
 */

import { generateRandomBytes, arrayBufferToBase64, sha256, stringToArrayBuffer } from './utils';
import type { RecoveryKey } from '../types/crypto';

/** BIP39英文词表（简化版，实际应使用完整2048词） */
const WORDLIST = [
  'abandon', 'ability', 'able', 'about', 'above', 'absent', 'absorb', 'abstract',
  'absurd', 'abuse', 'access', 'accident', 'account', 'accuse', 'achieve', 'acid',
  'acoustic', 'acquire', 'across', 'act', 'action', 'actor', 'actress', 'actual',
  'adapt', 'add', 'addict', 'address', 'adjust', 'admit', 'adult', 'advance',
  'advice', 'aerobic', 'affair', 'afford', 'afraid', 'again', 'age', 'agent',
  'agree', 'ahead', 'aim', 'air', 'airport', 'aisle', 'alarm', 'album',
  'alcohol', 'alert', 'alien', 'all', 'alley', 'allow', 'almost', 'alone',
  'alpha', 'already', 'also', 'alter', 'always', 'amateur', 'amazing', 'among',
  'amount', 'amused', 'analyst', 'anchor', 'ancient', 'anger', 'angle', 'angry',
  'animal', 'ankle', 'announce', 'annual', 'another', 'answer', 'antenna', 'antique',
  'anxiety', 'any', 'apart', 'apology', 'appear', 'apple', 'approve', 'april',
  'arch', 'arctic', 'area', 'arena', 'argue', 'arm', 'armed', 'armor',
  'army', 'around', 'arrange', 'arrest', 'arrive', 'arrow', 'art', 'artefact',
  'artist', 'artwork', 'ask', 'aspect', 'assault', 'asset', 'assist', 'assume',
  'asthma', 'athlete', 'atom', 'attack', 'attend', 'attitude', 'attract', 'auction',
  'audit', 'august', 'aunt', 'author', 'auto', 'autumn', 'average', 'avocado',
  'avoid', 'awake', 'aware', 'away', 'awesome', 'awful', 'awkward', 'axis',
  'baby', 'bachelor', 'bacon', 'badge', 'bag', 'balance', 'balcony', 'ball',
  'bamboo', 'banana', 'banner', 'bar', 'barely', 'bargain', 'barrel', 'base',
  'basic', 'basket', 'battle', 'beach', 'bean', 'beauty', 'because', 'become',
  'beef', 'before', 'begin', 'behave', 'behind', 'believe', 'below', 'belt',
  'bench', 'benefit', 'best', 'betray', 'better', 'between', 'beyond', 'bicycle',
  'bid', 'bike', 'bind', 'biology', 'bird', 'birth', 'bitter', 'black',
  'blade', 'blame', 'blanket', 'blast', 'bleak', 'bless', 'blind', 'blood',
  'blossom', 'blouse', 'blue', 'blur', 'blush', 'board', 'boat', 'body',
  'boil', 'bomb', 'bone', 'bonus', 'book', 'boost', 'border', 'boring',
  'borrow', 'boss', 'bottom', 'bounce', 'box', 'boy', 'bracket', 'brain',
  'brand', 'brass', 'brave', 'bread', 'breeze', 'brick', 'bridge', 'brief',
  'bright', 'bring', 'brisk', 'broccoli', 'broken', 'bronze', 'broom', 'brother',
  'brown', 'brush', 'bubble', 'buddy', 'budget', 'buffalo', 'build', 'bulb',
  'bulk', 'bullet', 'bundle', 'bunker', 'burden', 'burger', 'burst', 'bus',
  'business', 'busy', 'butter', 'buyer', 'buzz', 'cabbage', 'cabin', 'cable',
];

/** 恢复密钥词数 */
const RECOVERY_WORD_COUNT = 24;

/** 每个词的熵位数 */
const BITS_PER_WORD = 11;

/**
 * 生成恢复密钥（24个助记词）
 * @returns 恢复密钥
 */
export function generateRecoveryKey(): RecoveryKey {
  // 生成256位随机熵
  const entropy = generateRandomBytes(32);
  const words: string[] = [];
  
  // 将熵转换为词索引
  for (let i = 0; i < RECOVERY_WORD_COUNT; i++) {
    // 简化实现：使用字节直接映射到词表
    const byteIndex = Math.floor(i * 32 / RECOVERY_WORD_COUNT);
    const wordIndex = entropy[byteIndex] % WORDLIST.length;
    words.push(WORDLIST[wordIndex]);
  }
  
  return {
    words,
    createdAt: Date.now(),
  };
}

/**
 * 从恢复密钥派生加密密钥
 * @param words 助记词数组
 * @returns 派生的CryptoKey
 */
export async function deriveKeyFromRecoveryWords(
  words: string[]
): Promise<CryptoKey> {
  if (words.length !== RECOVERY_WORD_COUNT) {
    throw new Error(`Recovery key must have ${RECOVERY_WORD_COUNT} words`);
  }
  
  // 验证所有词都在词表中
  for (const word of words) {
    if (!WORDLIST.includes(word.toLowerCase())) {
      throw new Error(`Invalid recovery word: ${word}`);
    }
  }
  
  // 将词连接并哈希作为密钥材料
  const phrase = words.join(' ').toLowerCase();
  const phraseBuffer = stringToArrayBuffer(phrase);
  
  // 使用PBKDF2派生密钥
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    phraseBuffer,
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey']
  );
  
  // 使用固定盐值（恢复密钥场景）
  const salt = stringToArrayBuffer('secure-notebook-recovery-salt');
  
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}

/**
 * 计算恢复密钥哈希（用于验证）
 * @param words 助记词数组
 * @returns 哈希值
 */
export async function hashRecoveryKey(words: string[]): Promise<string> {
  const phrase = words.join(' ').toLowerCase();
  return sha256(phrase);
}

/**
 * 验证恢复密钥
 * @param words 助记词数组
 * @param expectedHash 预期哈希
 * @returns 是否匹配
 */
export async function verifyRecoveryKey(
  words: string[],
  expectedHash: string
): Promise<boolean> {
  try {
    const actualHash = await hashRecoveryKey(words);
    return actualHash === expectedHash;
  } catch {
    return false;
  }
}

/**
 * 验证助记词格式
 * @param words 助记词数组
 * @returns 是否有效
 */
export function validateRecoveryWords(words: string[]): boolean {
  if (words.length !== RECOVERY_WORD_COUNT) {
    return false;
  }
  
  for (const word of words) {
    if (!WORDLIST.includes(word.toLowerCase())) {
      return false;
    }
  }
  
  return true;
}

/**
 * 获取词表（用于自动完成等）
 * @returns 词表
 */
export function getWordlist(): readonly string[] {
  return WORDLIST;
}
