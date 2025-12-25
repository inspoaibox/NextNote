/**
 * 安全工具函数
 */

import crypto from 'crypto';

// UUID v4 格式验证正则
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * 验证 UUID 格式
 */
export function isValidUUID(id: string): boolean {
  return typeof id === 'string' && UUID_REGEX.test(id);
}

/**
 * 验证分享权限枚举值
 */
export function isValidSharePermission(permission: string): boolean {
  return ['read', 'write', 'admin'].includes(permission);
}

/**
 * 验证标签数组
 */
export function isValidTagsArray(tags: unknown): tags is string[] {
  if (!Array.isArray(tags)) return false;
  if (tags.length > 50) return false; // 最多50个标签
  return tags.every(tag => 
    typeof tag === 'string' && 
    tag.length > 0 && 
    tag.length <= 100 && // 单个标签最长100字符
    !/<|>|script/i.test(tag) // 防止XSS
  );
}

/**
 * 验证加密数据对象格式
 */
export function isValidEncryptedData(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false;
  const obj = data as Record<string, unknown>;
  return (
    typeof obj.ciphertext === 'string' &&
    typeof obj.iv === 'string' &&
    typeof obj.tag === 'string'
  );
}

/**
 * 时间恒定的字符串比较，防止时序攻击
 */
export function secureCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // 即使长度不同，也要执行比较以保持恒定时间
    const dummy = Buffer.alloc(a.length);
    crypto.timingSafeEqual(dummy, dummy);
    return false;
  }
  
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * 使用 PBKDF2 哈希密码（用于笔记/文件夹密码）
 * 注意：这是服务端二次哈希，客户端已经做了一次 SHA-256
 */
export async function hashPasswordServer(clientHash: string, salt?: string): Promise<{ hash: string; salt: string }> {
  const useSalt = salt || crypto.randomBytes(16).toString('hex');
  
  return new Promise((resolve, reject) => {
    crypto.pbkdf2(clientHash, useSalt, 100000, 64, 'sha512', (err, derivedKey) => {
      if (err) reject(err);
      else resolve({
        hash: derivedKey.toString('hex'),
        salt: useSalt,
      });
    });
  });
}

/**
 * 验证密码哈希
 */
export async function verifyPasswordServer(clientHash: string, storedHash: string, salt: string): Promise<boolean> {
  const { hash } = await hashPasswordServer(clientHash, salt);
  return secureCompare(hash, storedHash);
}

/**
 * 生成安全的随机令牌
 */
export function generateSecureToken(length: number = 32): string {
  return crypto.randomBytes(length).toString('hex');
}

/**
 * 加密 IP 地址（用于审计日志）
 */
export function encryptIpAddress(ip: string): string {
  const key = process.env.IP_ENCRYPTION_KEY || process.env.JWT_SECRET || 'default-key';
  const keyHash = crypto.createHash('sha256').update(key).digest();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', keyHash, iv);
  
  let encrypted = cipher.update(ip, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  return iv.toString('hex') + ':' + encrypted;
}

/**
 * 解密 IP 地址
 */
export function decryptIpAddress(encrypted: string): string {
  try {
    const key = process.env.IP_ENCRYPTION_KEY || process.env.JWT_SECRET || 'default-key';
    const keyHash = crypto.createHash('sha256').update(key).digest();
    const [ivHex, encryptedData] = encrypted.split(':');
    
    if (!ivHex || !encryptedData) {
      return encrypted; // 返回原始值（可能是旧数据）
    }
    
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', keyHash, iv);
    
    let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch {
    return '[encrypted]';
  }
}

/**
 * 清理用户输入，防止 XSS
 */
export function sanitizeInput(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

/**
 * 验证邮箱格式
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email) && email.length <= 254;
}

/**
 * 登录尝试限制器
 */
const loginAttempts = new Map<string, { count: number; lastAttempt: number; lockedUntil?: number }>();

const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000; // 15分钟
const ATTEMPT_WINDOW_MS = 60 * 60 * 1000; // 1小时

export function checkLoginAttempt(identifier: string): { allowed: boolean; remainingAttempts?: number; lockedUntil?: number } {
  const now = Date.now();
  const record = loginAttempts.get(identifier);
  
  if (!record) {
    return { allowed: true, remainingAttempts: MAX_LOGIN_ATTEMPTS };
  }
  
  // 检查是否被锁定
  if (record.lockedUntil && record.lockedUntil > now) {
    return { allowed: false, lockedUntil: record.lockedUntil };
  }
  
  // 检查是否超过时间窗口，重置计数
  if (now - record.lastAttempt > ATTEMPT_WINDOW_MS) {
    loginAttempts.delete(identifier);
    return { allowed: true, remainingAttempts: MAX_LOGIN_ATTEMPTS };
  }
  
  // 检查尝试次数
  if (record.count >= MAX_LOGIN_ATTEMPTS) {
    record.lockedUntil = now + LOCK_DURATION_MS;
    return { allowed: false, lockedUntil: record.lockedUntil };
  }
  
  return { allowed: true, remainingAttempts: MAX_LOGIN_ATTEMPTS - record.count };
}

export function recordLoginAttempt(identifier: string, success: boolean): void {
  const now = Date.now();
  
  if (success) {
    loginAttempts.delete(identifier);
    return;
  }
  
  const record = loginAttempts.get(identifier);
  
  if (record) {
    record.count++;
    record.lastAttempt = now;
  } else {
    loginAttempts.set(identifier, { count: 1, lastAttempt: now });
  }
}

// 定期清理过期记录
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of loginAttempts.entries()) {
    if (now - record.lastAttempt > ATTEMPT_WINDOW_MS) {
      loginAttempts.delete(key);
    }
  }
}, 60 * 60 * 1000); // 每小时清理一次
