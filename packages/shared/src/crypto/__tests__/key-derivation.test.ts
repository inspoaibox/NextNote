import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  generateSalt,
  deriveKeyFromPassword,
  deriveKEK,
  createKeyDerivationParams,
  getSaltFromParams,
  verifyPassword,
  computeKeyHash,
} from '../key-derivation';
import { arrayBufferToBase64 } from '../utils';

describe('Key Derivation', () => {
  /**
   * **Feature: secure-notebook, Property 5: Salt Uniqueness Per User**
   * **Validates: Requirements 2.1**
   * 
   * For any two generated salts, they should be different.
   */
  it('Property 5: Salt Uniqueness - generated salts should be unique', async () => {
    await fc.assert(
      fc.asyncProperty(fc.constant(null), async () => {
        const salt1 = generateSalt();
        const salt2 = generateSalt();
        
        const salt1Base64 = arrayBufferToBase64(salt1.buffer);
        const salt2Base64 = arrayBufferToBase64(salt2.buffer);
        
        // 两个随机生成的盐值应该不同
        expect(salt1Base64).not.toBe(salt2Base64);
      }),
      { numRuns: 100 }
    );
  });

  it('should generate salt with correct length (32 bytes)', () => {
    const salt = generateSalt();
    expect(salt.length).toBe(32);
  });

  it('should derive consistent key from same password and salt', async () => {
    const password = 'test-password-123';
    const salt = generateSalt();
    
    const key1 = await deriveKeyFromPassword(password, salt);
    const key2 = await deriveKeyFromPassword(password, salt);
    
    const hash1 = await computeKeyHash(key1);
    const hash2 = await computeKeyHash(key2);
    
    expect(hash1).toBe(hash2);
  });

  it('should derive different keys from different passwords', async () => {
    const salt = generateSalt();
    
    const key1 = await deriveKeyFromPassword('password1', salt);
    const key2 = await deriveKeyFromPassword('password2', salt);
    
    const hash1 = await computeKeyHash(key1);
    const hash2 = await computeKeyHash(key2);
    
    expect(hash1).not.toBe(hash2);
  });

  it('should derive different keys from different salts', async () => {
    const password = 'same-password';
    const salt1 = generateSalt();
    const salt2 = generateSalt();
    
    const key1 = await deriveKeyFromPassword(password, salt1);
    const key2 = await deriveKeyFromPassword(password, salt2);
    
    const hash1 = await computeKeyHash(key1);
    const hash2 = await computeKeyHash(key2);
    
    expect(hash1).not.toBe(hash2);
  });

  it('should derive KEK from master key', async () => {
    const password = 'test-password';
    const salt = generateSalt();
    
    const masterKey = await deriveKeyFromPassword(password, salt);
    const kek = await deriveKEK(masterKey);
    
    expect(kek).toBeDefined();
    expect(kek.type).toBe('secret');
  });

  it('should create and restore key derivation params', () => {
    const salt = generateSalt();
    const params = createKeyDerivationParams(salt);
    
    expect(params.algorithm).toBe('Argon2id');
    expect(params.iterations).toBeGreaterThan(0);
    expect(params.memoryCost).toBe(65536);
    
    const restoredSalt = getSaltFromParams(params);
    expect(restoredSalt.length).toBe(salt.length);
    
    // 验证盐值内容相同
    for (let i = 0; i < salt.length; i++) {
      expect(restoredSalt[i]).toBe(salt[i]);
    }
  });

  it('should verify correct password', async () => {
    const password = 'correct-password';
    const salt = generateSalt();
    
    const key = await deriveKeyFromPassword(password, salt);
    const keyHash = await computeKeyHash(key);
    
    const isValid = await verifyPassword(password, salt, keyHash);
    expect(isValid).toBe(true);
  });

  it('should reject incorrect password', async () => {
    const correctPassword = 'correct-password';
    const wrongPassword = 'wrong-password';
    const salt = generateSalt();
    
    const key = await deriveKeyFromPassword(correctPassword, salt);
    const keyHash = await computeKeyHash(key);
    
    const isValid = await verifyPassword(wrongPassword, salt, keyHash);
    expect(isValid).toBe(false);
  });
});
