import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  wrapDEK,
  unwrapDEK,
  generateKEK,
  exportKEK,
  importKEK,
  rewrapDEK,
} from '../key-wrapping';
import { generateDEK, encrypt, decrypt, exportDEK } from '../encryption';
import { arrayBufferToBase64 } from '../utils';

describe('Key Wrapping', () => {
  /**
   * **Feature: secure-notebook, Property 2: Key Wrapping Round-Trip**
   * **Validates: Requirements 1.5**
   * 
   * For any DEK and KEK pair, wrapping the DEK with the KEK and then 
   * unwrapping should produce the original DEK.
   */
  it('Property 2: Key Wrapping Round-Trip', async () => {
    await fc.assert(
      fc.asyncProperty(fc.constant(null), async () => {
        const kek = await generateKEK();
        const originalDEK = await generateDEK();
        
        // 导出原始DEK用于比较
        const originalDEKBytes = await exportDEK(originalDEK);
        const originalDEKBase64 = arrayBufferToBase64(originalDEKBytes);
        
        // 包装
        const wrapped = await wrapDEK(originalDEK, kek);
        
        // 解包装
        const unwrappedDEK = await unwrapDEK(wrapped, kek);
        
        // 导出解包装后的DEK
        const unwrappedDEKBytes = await exportDEK(unwrappedDEK);
        const unwrappedDEKBase64 = arrayBufferToBase64(unwrappedDEKBytes);
        
        // 验证密钥相同
        expect(unwrappedDEKBase64).toBe(originalDEKBase64);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * **Feature: secure-notebook, Property 3: DEK Uniqueness**
   * **Validates: Requirements 1.4**
   * 
   * For any two generated DEKs, they should be different.
   */
  it('Property 3: DEK Uniqueness', async () => {
    await fc.assert(
      fc.asyncProperty(fc.constant(null), async () => {
        const dek1 = await generateDEK();
        const dek2 = await generateDEK();
        
        const dek1Bytes = await exportDEK(dek1);
        const dek2Bytes = await exportDEK(dek2);
        
        const dek1Base64 = arrayBufferToBase64(dek1Bytes);
        const dek2Base64 = arrayBufferToBase64(dek2Bytes);
        
        expect(dek1Base64).not.toBe(dek2Base64);
      }),
      { numRuns: 100 }
    );
  });

  it('should generate KEK with correct properties', async () => {
    const kek = await generateKEK();
    
    expect(kek).toBeDefined();
    expect(kek.type).toBe('secret');
    expect(kek.algorithm.name).toBe('AES-KW');
    expect((kek.algorithm as AesKeyGenParams).length).toBe(256);
    expect(kek.extractable).toBe(true);
    expect(kek.usages).toContain('wrapKey');
    expect(kek.usages).toContain('unwrapKey');
  });

  it('should fail unwrapping with wrong KEK', async () => {
    const kek1 = await generateKEK();
    const kek2 = await generateKEK();
    const dek = await generateDEK();
    
    const wrapped = await wrapDEK(dek, kek1);
    
    await expect(unwrapDEK(wrapped, kek2)).rejects.toThrow();
  });

  it('should fail unwrapping with tampered wrapped key', async () => {
    const kek = await generateKEK();
    const dek = await generateDEK();
    
    const wrapped = await wrapDEK(dek, kek);
    
    // 篡改包装密钥
    const tampered = {
      ...wrapped,
      wrappedKey: wrapped.wrappedKey.slice(0, -4) + 'XXXX',
    };
    
    await expect(unwrapDEK(tampered, kek)).rejects.toThrow();
  });

  it('should export and import KEK correctly', async () => {
    const originalKEK = await generateKEK();
    const dek = await generateDEK();
    
    // 使用原始KEK包装
    const wrapped = await wrapDEK(dek, originalKEK);
    
    // 导出KEK
    const kekBytes = await exportKEK(originalKEK);
    
    // 导入KEK
    const importedKEK = await importKEK(kekBytes);
    
    // 使用导入的KEK解包装
    const unwrappedDEK = await unwrapDEK(wrapped, importedKEK);
    
    // 验证DEK可以正常使用
    const plaintext = 'test message';
    const encrypted = await encrypt(plaintext, unwrappedDEK);
    const decrypted = await decrypt(encrypted, unwrappedDEK);
    
    expect(decrypted).toBe(plaintext);
  });

  it('should rewrap DEK with new KEK', async () => {
    const oldKEK = await generateKEK();
    const newKEK = await generateKEK();
    const dek = await generateDEK();
    
    // 使用旧KEK包装
    const oldWrapped = await wrapDEK(dek, oldKEK);
    
    // 重新包装
    const newWrapped = await rewrapDEK(oldWrapped, oldKEK, newKEK);
    
    // 验证新包装密钥不同
    expect(newWrapped.wrappedKey).not.toBe(oldWrapped.wrappedKey);
    
    // 验证可以用新KEK解包装
    const unwrappedDEK = await unwrapDEK(newWrapped, newKEK);
    
    // 验证DEK功能正常
    const plaintext = 'test message';
    const encrypted = await encrypt(plaintext, unwrappedDEK);
    const decrypted = await decrypt(encrypted, unwrappedDEK);
    
    expect(decrypted).toBe(plaintext);
  });

  it('should not be able to unwrap with old KEK after rewrap', async () => {
    const oldKEK = await generateKEK();
    const newKEK = await generateKEK();
    const dek = await generateDEK();
    
    const oldWrapped = await wrapDEK(dek, oldKEK);
    const newWrapped = await rewrapDEK(oldWrapped, oldKEK, newKEK);
    
    // 旧KEK不能解包装新的包装密钥
    await expect(unwrapDEK(newWrapped, oldKEK)).rejects.toThrow();
  });
});
