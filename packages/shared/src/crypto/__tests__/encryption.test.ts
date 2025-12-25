import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  generateDEK,
  encrypt,
  decrypt,
  encryptBinary,
  decryptBinary,
  exportDEK,
  importDEK,
} from '../encryption';
import { arrayBufferToBase64, stringToArrayBuffer } from '../utils';

describe('Encryption', () => {
  /**
   * **Feature: secure-notebook, Property 1: Encryption Round-Trip Consistency**
   * **Validates: Requirements 1.1, 1.2, 4.2, 5.2, 8.2, 8.3, 10.2**
   * 
   * For any plaintext content, encrypting with a DEK and then decrypting 
   * with the same DEK should produce the original plaintext.
   */
  it('Property 1: Encryption Round-Trip - text encryption/decryption', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 0, maxLength: 10000 }),
        async (plaintext) => {
          const dek = await generateDEK();
          const encrypted = await encrypt(plaintext, dek);
          const decrypted = await decrypt(encrypted, dek);
          
          expect(decrypted).toBe(plaintext);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Feature: secure-notebook, Property 1: Encryption Round-Trip Consistency**
   * **Validates: Requirements 8.2, 8.3**
   * 
   * For any binary data, encrypting and decrypting should produce the original data.
   */
  it('Property 1: Encryption Round-Trip - binary encryption/decryption', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uint8Array({ minLength: 0, maxLength: 10000 }),
        async (data) => {
          const dek = await generateDEK();
          const encrypted = await encryptBinary(data.buffer, dek);
          const decrypted = await decryptBinary(encrypted, dek);
          
          const decryptedArray = new Uint8Array(decrypted);
          expect(decryptedArray.length).toBe(data.length);
          
          for (let i = 0; i < data.length; i++) {
            expect(decryptedArray[i]).toBe(data[i]);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should generate DEK with correct properties', async () => {
    const dek = await generateDEK();
    
    expect(dek).toBeDefined();
    expect(dek.type).toBe('secret');
    expect(dek.algorithm.name).toBe('AES-GCM');
    expect((dek.algorithm as AesKeyGenParams).length).toBe(256);
    expect(dek.extractable).toBe(true);
    expect(dek.usages).toContain('encrypt');
    expect(dek.usages).toContain('decrypt');
  });

  it('should produce different ciphertext for same plaintext (due to random IV)', async () => {
    const dek = await generateDEK();
    const plaintext = 'same plaintext';
    
    const encrypted1 = await encrypt(plaintext, dek);
    const encrypted2 = await encrypt(plaintext, dek);
    
    // IV应该不同
    expect(encrypted1.iv).not.toBe(encrypted2.iv);
    // 密文也应该不同
    expect(encrypted1.ciphertext).not.toBe(encrypted2.ciphertext);
  });

  it('should fail decryption with wrong key', async () => {
    const dek1 = await generateDEK();
    const dek2 = await generateDEK();
    const plaintext = 'secret message';
    
    const encrypted = await encrypt(plaintext, dek1);
    
    await expect(decrypt(encrypted, dek2)).rejects.toThrow();
  });

  it('should fail decryption with tampered ciphertext', async () => {
    const dek = await generateDEK();
    const plaintext = 'secret message';
    
    const encrypted = await encrypt(plaintext, dek);
    
    // 篡改密文
    const tamperedCiphertext = encrypted.ciphertext.slice(0, -4) + 'XXXX';
    const tampered = { ...encrypted, ciphertext: tamperedCiphertext };
    
    await expect(decrypt(tampered, dek)).rejects.toThrow();
  });

  it('should fail decryption with tampered tag', async () => {
    const dek = await generateDEK();
    const plaintext = 'secret message';
    
    const encrypted = await encrypt(plaintext, dek);
    
    // 篡改认证标签
    const tamperedTag = encrypted.tag.slice(0, -4) + 'XXXX';
    const tampered = { ...encrypted, tag: tamperedTag };
    
    await expect(decrypt(tampered, dek)).rejects.toThrow();
  });

  it('should export and import DEK correctly', async () => {
    const originalDEK = await generateDEK();
    const plaintext = 'test message';
    
    // 导出DEK
    const keyBytes = await exportDEK(originalDEK);
    
    // 导入DEK
    const importedDEK = await importDEK(keyBytes);
    
    // 使用原始DEK加密
    const encrypted = await encrypt(plaintext, originalDEK);
    
    // 使用导入的DEK解密
    const decrypted = await decrypt(encrypted, importedDEK);
    
    expect(decrypted).toBe(plaintext);
  });

  it('should handle empty string', async () => {
    const dek = await generateDEK();
    const plaintext = '';
    
    const encrypted = await encrypt(plaintext, dek);
    const decrypted = await decrypt(encrypted, dek);
    
    expect(decrypted).toBe(plaintext);
  });

  it('should handle unicode characters', async () => {
    const dek = await generateDEK();
    const plaintext = '你好世界 🌍 مرحبا العالم';
    
    const encrypted = await encrypt(plaintext, dek);
    const decrypted = await decrypt(encrypted, dek);
    
    expect(decrypted).toBe(plaintext);
  });

  it('should handle large content', async () => {
    const dek = await generateDEK();
    const plaintext = 'x'.repeat(100000);
    
    const encrypted = await encrypt(plaintext, dek);
    const decrypted = await decrypt(encrypted, dek);
    
    expect(decrypted).toBe(plaintext);
  });
});
