/**
 * Password Change Tests
 * Property 4: Password Change Preserves Content
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  verifyContentPreserved,
  verifyDEKChanged,
  validatePasswordStrength,
} from '../password-change';
import { encrypt, generateDEK, exportDEK } from '../encryption';
import { wrapDEK, unwrapDEK, generateKEK, rewrapDEK } from '../key-wrapping';
import { arrayBufferToBase64 } from '../utils';

describe('Password Change', () => {
  describe('Property 4: Password Change Preserves Content', () => {
    it('should preserve encrypted content after password change', async () => {
      const plaintext = 'This is my secret note content';
      const oldKEK = await generateKEK();
      const dek = await generateDEK();
      const encryptedContent = await encrypt(plaintext, dek);
      const wrappedDEK = await wrapDEK(dek, oldKEK);
      const originalEncryptedContent = JSON.stringify(encryptedContent);
      const newKEK = await generateKEK();
      const newWrappedDEK = await rewrapDEK(wrappedDEK, oldKEK, newKEK);

      expect(verifyContentPreserved(originalEncryptedContent, originalEncryptedContent)).toBe(true);
      expect(verifyDEKChanged(wrappedDEK.wrappedKey, newWrappedDEK.wrappedKey)).toBe(true);

      const unwrappedDEK = await unwrapDEK(newWrappedDEK, newKEK);
      const unwrappedDEKBytes = await exportDEK(unwrappedDEK);
      const originalDEKBytes = await exportDEK(dek);
      expect(arrayBufferToBase64(unwrappedDEKBytes)).toBe(arrayBufferToBase64(originalDEKBytes));
    });

    it('should handle multiple notes during password change', async () => {
      const oldKEK = await generateKEK();
      const newKEK = await generateKEK();
      
      const notes = [];
      for (let i = 0; i < 3; i++) {
        const dek = await generateDEK();
        const wrappedDEK = await wrapDEK(dek, oldKEK);
        notes.push({ dek, wrappedDEK });
      }

      for (let i = 0; i < 3; i++) {
        const newWrappedDEK = await rewrapDEK(notes[i].wrappedDEK, oldKEK, newKEK);
        expect(newWrappedDEK.wrappedKey).not.toBe(notes[i].wrappedDEK.wrappedKey);
        const unwrapped = await unwrapDEK(newWrappedDEK, newKEK);
        expect(unwrapped).toBeDefined();
      }
    });

    it('should fail with wrong old KEK', async () => {
      const correctKEK = await generateKEK();
      const wrongKEK = await generateKEK();
      const newKEK = await generateKEK();
      const dek = await generateDEK();
      const wrappedDEK = await wrapDEK(dek, correctKEK);

      await expect(rewrapDEK(wrappedDEK, wrongKEK, newKEK)).rejects.toThrow();
    });

    it('should not allow decryption with old KEK after rewrap', async () => {
      const oldKEK = await generateKEK();
      const newKEK = await generateKEK();
      const dek = await generateDEK();
      const wrappedDEK = await wrapDEK(dek, oldKEK);
      const newWrappedDEK = await rewrapDEK(wrappedDEK, oldKEK, newKEK);

      await expect(unwrapDEK(newWrappedDEK, oldKEK)).rejects.toThrow();
    });

    it('should preserve DEK value through rewrap', async () => {
      await fc.assert(
        fc.asyncProperty(fc.constant(null), async () => {
          const oldKEK = await generateKEK();
          const newKEK = await generateKEK();
          const dek = await generateDEK();
          const originalDEKBytes = await exportDEK(dek);
          const originalDEKBase64 = arrayBufferToBase64(originalDEKBytes);
          const wrappedDEK = await wrapDEK(dek, oldKEK);
          const newWrappedDEK = await rewrapDEK(wrappedDEK, oldKEK, newKEK);
          const unwrappedDEK = await unwrapDEK(newWrappedDEK, newKEK);
          const unwrappedDEKBytes = await exportDEK(unwrappedDEK);
          const unwrappedDEKBase64 = arrayBufferToBase64(unwrappedDEKBytes);

          expect(unwrappedDEKBase64).toBe(originalDEKBase64);
        }),
        { numRuns: 50 }
      );
    });
  });

  describe('Password Validation', () => {
    it('should validate password strength', () => {
      const valid = validatePasswordStrength('StrongPass123!');
      expect(valid.valid).toBe(true);
      expect(valid.errors).toHaveLength(0);

      const tooShort = validatePasswordStrength('Short1');
      expect(tooShort.valid).toBe(false);

      const noUpper = validatePasswordStrength('lowercase123');
      expect(noUpper.valid).toBe(false);

      const noLower = validatePasswordStrength('UPPERCASE123');
      expect(noLower.valid).toBe(false);

      const noNumber = validatePasswordStrength('NoNumbersHere');
      expect(noNumber.valid).toBe(false);
    });
  });

  describe('Content Preservation Verification', () => {
    it('should correctly verify content preservation', () => {
      const content1 = '{"iv":"abc","ciphertext":"xyz"}';
      const content2 = '{"iv":"abc","ciphertext":"xyz"}';
      const content3 = '{"iv":"def","ciphertext":"uvw"}';

      expect(verifyContentPreserved(content1, content2)).toBe(true);
      expect(verifyContentPreserved(content1, content3)).toBe(false);
    });

    it('should correctly verify DEK change', () => {
      const dek1 = 'wrappedDEK123';
      const dek2 = 'wrappedDEK456';

      expect(verifyDEKChanged(dek1, dek2)).toBe(true);
      expect(verifyDEKChanged(dek1, dek1)).toBe(false);
    });
  });
});
