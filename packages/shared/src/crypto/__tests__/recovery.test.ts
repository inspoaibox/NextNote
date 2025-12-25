import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  generateRecoveryKey,
  deriveKeyFromRecoveryWords,
  hashRecoveryKey,
  verifyRecoveryKey,
  validateRecoveryWords,
  getWordlist,
} from '../recovery';
import { encrypt, decrypt } from '../encryption';

describe('Recovery Key', () => {
  /**
   * **Feature: secure-notebook, Property 6: Recovery Key Round-Trip**
   * **Validates: Requirements 2.3**
   * 
   * For any user account, deriving a key from the recovery words and using it 
   * to decrypt the KEK should allow access to all encrypted data.
   */
  it('Property 6: Recovery Key Round-Trip', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 100 }),
        async (plaintext) => {
          // 生成恢复密钥
          const recoveryKey = generateRecoveryKey();
          
          // 从恢复密钥派生加密密钥
          const key1 = await deriveKeyFromRecoveryWords(recoveryKey.words);
          
          // 加密数据
          const encrypted = await encrypt(plaintext, key1);
          
          // 再次从相同的恢复词派生密钥
          const key2 = await deriveKeyFromRecoveryWords(recoveryKey.words);
          
          // 解密数据
          const decrypted = await decrypt(encrypted, key2);
          
          // 验证数据一致
          expect(decrypted).toBe(plaintext);
        }
      ),
      { numRuns: 20 } // 减少运行次数以避免超时
    );
  }, 30000); // 30秒超时

  it('should generate recovery key with 24 words', () => {
    const recoveryKey = generateRecoveryKey();
    
    expect(recoveryKey.words).toHaveLength(24);
    expect(recoveryKey.createdAt).toBeLessThanOrEqual(Date.now());
  });

  it('should generate unique recovery keys', () => {
    const key1 = generateRecoveryKey();
    const key2 = generateRecoveryKey();
    
    // 两个恢复密钥应该不同
    expect(key1.words.join(' ')).not.toBe(key2.words.join(' '));
  });

  it('should generate words from wordlist', () => {
    const recoveryKey = generateRecoveryKey();
    const wordlist = getWordlist();
    
    for (const word of recoveryKey.words) {
      expect(wordlist).toContain(word);
    }
  });

  it('should derive consistent key from same recovery words', async () => {
    const recoveryKey = generateRecoveryKey();
    
    const key1 = await deriveKeyFromRecoveryWords(recoveryKey.words);
    const key2 = await deriveKeyFromRecoveryWords(recoveryKey.words);
    
    // 使用key1加密，key2解密
    const plaintext = 'test message';
    const encrypted = await encrypt(plaintext, key1);
    const decrypted = await decrypt(encrypted, key2);
    
    expect(decrypted).toBe(plaintext);
  });

  it('should derive different keys from different recovery words', async () => {
    const key1Words = generateRecoveryKey().words;
    const key2Words = generateRecoveryKey().words;
    
    const key1 = await deriveKeyFromRecoveryWords(key1Words);
    const key2 = await deriveKeyFromRecoveryWords(key2Words);
    
    // 使用key1加密
    const plaintext = 'test message';
    const encrypted = await encrypt(plaintext, key1);
    
    // key2不能解密
    await expect(decrypt(encrypted, key2)).rejects.toThrow();
  });

  it('should reject invalid word count', async () => {
    const words = ['abandon', 'ability', 'able']; // 只有3个词
    
    await expect(deriveKeyFromRecoveryWords(words)).rejects.toThrow(
      'Recovery key must have 24 words'
    );
  });

  it('should reject invalid words', async () => {
    const words = Array(24).fill('invalidword');
    
    await expect(deriveKeyFromRecoveryWords(words)).rejects.toThrow(
      'Invalid recovery word'
    );
  });

  it('should hash recovery key consistently', async () => {
    const recoveryKey = generateRecoveryKey();
    
    const hash1 = await hashRecoveryKey(recoveryKey.words);
    const hash2 = await hashRecoveryKey(recoveryKey.words);
    
    expect(hash1).toBe(hash2);
  });

  it('should verify correct recovery key', async () => {
    const recoveryKey = generateRecoveryKey();
    const hash = await hashRecoveryKey(recoveryKey.words);
    
    const isValid = await verifyRecoveryKey(recoveryKey.words, hash);
    expect(isValid).toBe(true);
  });

  it('should reject incorrect recovery key', async () => {
    const key1 = generateRecoveryKey();
    const key2 = generateRecoveryKey();
    
    const hash1 = await hashRecoveryKey(key1.words);
    
    const isValid = await verifyRecoveryKey(key2.words, hash1);
    expect(isValid).toBe(false);
  });

  it('should validate correct recovery words', () => {
    const recoveryKey = generateRecoveryKey();
    
    expect(validateRecoveryWords(recoveryKey.words)).toBe(true);
  });

  it('should invalidate wrong word count', () => {
    expect(validateRecoveryWords(['abandon', 'ability'])).toBe(false);
  });

  it('should invalidate invalid words', () => {
    const words = Array(24).fill('notaword');
    expect(validateRecoveryWords(words)).toBe(false);
  });

  it('should be case insensitive', async () => {
    const recoveryKey = generateRecoveryKey();
    const upperWords = recoveryKey.words.map(w => w.toUpperCase());
    
    const key1 = await deriveKeyFromRecoveryWords(recoveryKey.words);
    const key2 = await deriveKeyFromRecoveryWords(upperWords);
    
    const plaintext = 'test';
    const encrypted = await encrypt(plaintext, key1);
    const decrypted = await decrypt(encrypted, key2);
    
    expect(decrypted).toBe(plaintext);
  });
});
