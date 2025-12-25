/**
 * 桌面版本地认证服务
 * 不需要服务器，使用本地密码保护数据
 */

import { isElectron, configStorageAdapter } from '../storage/electron-adapter';
import { cryptoService, type EncryptedData } from './crypto-service';

interface DesktopAuthConfig {
  isSetup: boolean;
  encryptedKEK: EncryptedData;
  salt: string;
  passwordHash: string; // 用于验证密码
  createdAt: number;
  lastLoginAt: number;
}

const AUTH_CONFIG_KEY = 'desktop-auth';

/**
 * 检查是否是桌面版
 */
export function isDesktopMode(): boolean {
  return isElectron;
}

/**
 * 检查桌面版是否已设置密码
 */
export async function isDesktopSetup(): Promise<boolean> {
  if (!isElectron) return false;
  
  const config = await configStorageAdapter.get<{ [AUTH_CONFIG_KEY]: DesktopAuthConfig }>();
  return config?.[AUTH_CONFIG_KEY]?.isSetup ?? false;
}

/**
 * 获取桌面版认证配置
 */
export async function getDesktopAuthConfig(): Promise<DesktopAuthConfig | null> {
  if (!isElectron) return null;
  
  const config = await configStorageAdapter.get<{ [AUTH_CONFIG_KEY]: DesktopAuthConfig }>();
  return config?.[AUTH_CONFIG_KEY] ?? null;
}

/**
 * 桌面版首次设置密码
 */
export async function setupDesktopPassword(password: string): Promise<{
  encryptedKEK: EncryptedData;
  salt: string;
}> {
  if (!isElectron) {
    throw new Error('Not in desktop mode');
  }
  
  // 生成盐值
  const salt = cryptoService.generateSalt();
  
  // 从密码派生主密钥
  const masterKey = await cryptoService.deriveKeyFromPassword(password, salt);
  
  // 从主密钥派生 KEK
  const kek = await cryptoService.deriveKEK(masterKey);
  
  // 加密 KEK
  const encryptedKEK = await cryptoService.encryptKEK(kek, masterKey);
  
  // 生成密码哈希（用于验证）
  const passwordHash = await hashPassword(password, salt);
  
  // 保存配置
  const authConfig: DesktopAuthConfig = {
    isSetup: true,
    encryptedKEK,
    salt,
    passwordHash,
    createdAt: Date.now(),
    lastLoginAt: Date.now(),
  };
  
  const existingConfig = await configStorageAdapter.get<Record<string, unknown>>() || {};
  await configStorageAdapter.save({
    ...existingConfig,
    [AUTH_CONFIG_KEY]: authConfig,
  });
  
  // 设置 KEK 到内存
  cryptoService.setKEK(kek);
  
  return { encryptedKEK, salt };
}

/**
 * 桌面版登录（解锁）
 */
export async function unlockDesktop(password: string): Promise<boolean> {
  if (!isElectron) {
    throw new Error('Not in desktop mode');
  }
  
  const authConfig = await getDesktopAuthConfig();
  if (!authConfig) {
    throw new Error('Desktop not setup');
  }
  
  // 验证密码
  const passwordHash = await hashPassword(password, authConfig.salt);
  if (passwordHash !== authConfig.passwordHash) {
    throw new Error('Invalid password');
  }
  
  // 解密 KEK
  const masterKey = await cryptoService.deriveKeyFromPassword(password, authConfig.salt);
  const kek = await cryptoService.decryptKEK(authConfig.encryptedKEK, masterKey);
  
  // 设置 KEK 到内存
  cryptoService.setKEK(kek);
  
  // 更新最后登录时间
  const existingConfig = await configStorageAdapter.get<Record<string, unknown>>() || {};
  await configStorageAdapter.save({
    ...existingConfig,
    [AUTH_CONFIG_KEY]: {
      ...authConfig,
      lastLoginAt: Date.now(),
    },
  });
  
  return true;
}

/**
 * 桌面版修改密码
 */
export async function changeDesktopPassword(oldPassword: string, newPassword: string): Promise<boolean> {
  if (!isElectron) {
    throw new Error('Not in desktop mode');
  }
  
  const authConfig = await getDesktopAuthConfig();
  if (!authConfig) {
    throw new Error('Desktop not setup');
  }
  
  // 验证旧密码
  const oldPasswordHash = await hashPassword(oldPassword, authConfig.salt);
  if (oldPasswordHash !== authConfig.passwordHash) {
    throw new Error('Invalid old password');
  }
  
  // 解密现有 KEK
  const oldMasterKey = await cryptoService.deriveKeyFromPassword(oldPassword, authConfig.salt);
  const kek = await cryptoService.decryptKEK(authConfig.encryptedKEK, oldMasterKey);
  
  // 生成新盐值
  const newSalt = cryptoService.generateSalt();
  
  // 用新密码加密 KEK
  const newMasterKey = await cryptoService.deriveKeyFromPassword(newPassword, newSalt);
  const newEncryptedKEK = await cryptoService.encryptKEK(kek, newMasterKey);
  
  // 生成新密码哈希
  const newPasswordHash = await hashPassword(newPassword, newSalt);
  
  // 更新配置
  const existingConfig = await configStorageAdapter.get<Record<string, unknown>>() || {};
  await configStorageAdapter.save({
    ...existingConfig,
    [AUTH_CONFIG_KEY]: {
      ...authConfig,
      encryptedKEK: newEncryptedKEK,
      salt: newSalt,
      passwordHash: newPasswordHash,
    },
  });
  
  return true;
}

/**
 * 密码哈希（用于验证）
 */
async function hashPassword(password: string, salt: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + salt);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * 桌面版锁定（清除内存中的 KEK）
 */
export function lockDesktop(): void {
  cryptoService.clearKeys();
}

/**
 * 检查桌面版是否已解锁
 */
export function isDesktopUnlocked(): boolean {
  return cryptoService.getKEK() !== null;
}
