/**
 * 前端加密服务
 * 处理所有客户端加密/解密操作
 */

// 本地类型定义
export interface EncryptedData {
  iv: string;
  ciphertext: string;
  tag: string;
  algorithm: 'AES-256-GCM';
}

export interface WrappedKey {
  wrappedKey: string;
  algorithm: 'AES-KW';
}

// 简化的加密工具函数
function generateRandomBytes(length: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length));
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

function stringToArrayBuffer(str: string): ArrayBuffer {
  const encoder = new TextEncoder();
  return encoder.encode(str).buffer as ArrayBuffer;
}

function arrayBufferToString(buffer: ArrayBuffer): string {
  const decoder = new TextDecoder();
  return decoder.decode(buffer);
}

const IV_LENGTH = 12;
const TAG_LENGTH = 128;
const SALT_LENGTH = 32;
const PBKDF2_ITERATIONS = 600000;
const KEK_SESSION_KEY = 'secure-notebook-kek';

/** 加密服务类 */
class CryptoService {
  private kek: CryptoKey | null = null;
  private masterKey: CryptoKey | null = null;

  constructor() {
    // 尝试从 sessionStorage 恢复 KEK
    this.restoreKEKFromSession();
  }

  /** 从 sessionStorage 恢复 KEK */
  private async restoreKEKFromSession() {
    try {
      const kekData = sessionStorage.getItem(KEK_SESSION_KEY);
      if (kekData) {
        const kekBytes = base64ToArrayBuffer(kekData);
        this.kek = await crypto.subtle.importKey(
          'raw',
          kekBytes,
          { name: 'AES-KW', length: 256 },
          true,
          ['wrapKey', 'unwrapKey']
        );
      }
    } catch (error) {
      console.error('Failed to restore KEK from session:', error);
      sessionStorage.removeItem(KEK_SESSION_KEY);
    }
  }

  /** 保存 KEK 到 sessionStorage */
  private async saveKEKToSession(kek: CryptoKey) {
    try {
      const kekBytes = await crypto.subtle.exportKey('raw', kek);
      sessionStorage.setItem(KEK_SESSION_KEY, arrayBufferToBase64(kekBytes));
    } catch (error) {
      console.error('Failed to save KEK to session:', error);
    }
  }

  /** 生成盐值 */
  generateSalt(): string {
    const bytes = generateRandomBytes(SALT_LENGTH);
    return arrayBufferToBase64(bytes.buffer as ArrayBuffer);
  }

  /** 从密码派生主密钥 */
  async deriveKeyFromPassword(password: string, saltBase64: string): Promise<CryptoKey> {
    const salt = new Uint8Array(base64ToArrayBuffer(saltBase64));
    const passwordBuffer = stringToArrayBuffer(password);
    
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      passwordBuffer,
      'PBKDF2',
      false,
      ['deriveBits', 'deriveKey']
    );

    return crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: PBKDF2_ITERATIONS,
        hash: 'SHA-256',
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );
  }

  /** 从主密钥派生 KEK */
  async deriveKEK(masterKey: CryptoKey): Promise<CryptoKey> {
    const masterKeyBytes = await crypto.subtle.exportKey('raw', masterKey);
    
    const hkdfKey = await crypto.subtle.importKey(
      'raw',
      masterKeyBytes,
      'HKDF',
      false,
      ['deriveKey']
    );

    // 使用固定但非零的盐值（用于 KEK 派生的一致性）
    const salt = new TextEncoder().encode('secure-notebook-kek-salt-v1');

    return crypto.subtle.deriveKey(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt: salt,
        info: stringToArrayBuffer('secure-notebook-kek'),
      },
      hkdfKey,
      { name: 'AES-KW', length: 256 },
      true,
      ['wrapKey', 'unwrapKey']
    );
  }

  /** 生成 DEK */
  async generateDEK(): Promise<CryptoKey> {
    return crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );
  }

  /** 加密文本 */
  async encrypt(plaintext: string, dek: CryptoKey): Promise<EncryptedData> {
    const iv = generateRandomBytes(IV_LENGTH);
    const plaintextBuffer = stringToArrayBuffer(plaintext);

    const ciphertextWithTag = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: new Uint8Array(iv), tagLength: TAG_LENGTH },
      dek,
      plaintextBuffer
    );

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

  /** 解密文本 */
  async decrypt(encryptedData: EncryptedData, dek: CryptoKey): Promise<string> {
    const iv = new Uint8Array(base64ToArrayBuffer(encryptedData.iv));
    const ciphertext = new Uint8Array(base64ToArrayBuffer(encryptedData.ciphertext));
    const tag = new Uint8Array(base64ToArrayBuffer(encryptedData.tag));

    const ciphertextWithTag = new Uint8Array(ciphertext.length + tag.length);
    ciphertextWithTag.set(ciphertext);
    ciphertextWithTag.set(tag, ciphertext.length);

    const plaintextBuffer = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv, tagLength: TAG_LENGTH },
      dek,
      ciphertextWithTag
    );

    return arrayBufferToString(plaintextBuffer);
  }

  /** 包装 DEK */
  async wrapDEK(dek: CryptoKey, kek: CryptoKey): Promise<WrappedKey> {
    const wrappedKeyBuffer = await crypto.subtle.wrapKey('raw', dek, kek, 'AES-KW');
    return {
      wrappedKey: arrayBufferToBase64(wrappedKeyBuffer),
      algorithm: 'AES-KW',
    };
  }

  /** 解包装 DEK */
  async unwrapDEK(wrappedKey: WrappedKey, kek: CryptoKey): Promise<CryptoKey> {
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

  /** 加密 KEK 用于存储 */
  async encryptKEK(kek: CryptoKey, masterKey: CryptoKey): Promise<EncryptedData> {
    const kekBytes = await crypto.subtle.exportKey('raw', kek);
    const kekString = arrayBufferToBase64(kekBytes);
    
    // 将主密钥转换为 AES-GCM 密钥用于加密
    const masterKeyBytes = await crypto.subtle.exportKey('raw', masterKey);
    const encryptionKey = await crypto.subtle.importKey(
      'raw',
      masterKeyBytes,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt']
    );
    
    return this.encrypt(kekString, encryptionKey);
  }

  /** 解密 KEK */
  async decryptKEK(encryptedKEK: EncryptedData, masterKey: CryptoKey): Promise<CryptoKey> {
    const masterKeyBytes = await crypto.subtle.exportKey('raw', masterKey);
    const decryptionKey = await crypto.subtle.importKey(
      'raw',
      masterKeyBytes,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt']
    );
    
    const kekString = await this.decrypt(encryptedKEK, decryptionKey);
    const kekBytes = base64ToArrayBuffer(kekString);
    
    return crypto.subtle.importKey(
      'raw',
      kekBytes,
      { name: 'AES-KW', length: 256 },
      true,
      ['wrapKey', 'unwrapKey']
    );
  }

  /** 生成恢复密钥 */
  generateRecoveryKey(): string[] {
    // BIP-39 标准词库的子集（完整版应使用 2048 词）
    const wordlist = [
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
    
    const entropy = generateRandomBytes(32);
    const words: string[] = [];
    
    for (let i = 0; i < 24; i++) {
      // 使用更好的随机索引计算
      const byteIndex1 = i * 2 % 32;
      const byteIndex2 = (i * 2 + 1) % 32;
      const combinedValue = (entropy[byteIndex1] << 8) | entropy[byteIndex2];
      const wordIndex = combinedValue % wordlist.length;
      words.push(wordlist[wordIndex]);
    }
    
    return words;
  }

  /** 计算恢复密钥哈希 */
  async hashRecoveryKey(words: string[]): Promise<string> {
    const phrase = words.join(' ').toLowerCase();
    const buffer = stringToArrayBuffer(phrase);
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    return arrayBufferToBase64(hashBuffer);
  }

  /** 设置当前 KEK */
  setKEK(kek: CryptoKey) {
    this.kek = kek;
    // 同时保存到 sessionStorage
    this.saveKEKToSession(kek);
  }

  /** 获取当前 KEK */
  getKEK(): CryptoKey | null {
    return this.kek;
  }

  /** 检查 KEK 是否可用（包括从 session 恢复） */
  async ensureKEK(): Promise<CryptoKey | null> {
    if (this.kek) {
      return this.kek;
    }
    // 尝试从 session 恢复
    await this.restoreKEKFromSession();
    return this.kek;
  }

  /** 清除密钥 */
  clearKeys() {
    this.kek = null;
    this.masterKey = null;
    sessionStorage.removeItem(KEK_SESSION_KEY);
  }
}

export const cryptoService = new CryptoService();
