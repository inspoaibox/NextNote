/**
 * Dual Encryption Property Tests
 * Property 39: Note Password Dual Encryption
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  setNotePassword,
  decryptPasswordProtectedNote,
} from '../note-password';
import { generateKEK } from '../../crypto/key-wrapping';
import { generateDEK, encrypt, decrypt } from '../../crypto/encryption';
import { deriveKEK } from '../../crypto/key-derivation';

describe('Dual Encryption Property Tests', () => {
  /**
   * **Feature: secure-notebook, Property 39: Note Password Dual Encryption**
   * For any password-protected note, decryption should require both the Master Key
   * and the password-derived key.
   * **Validates: Requirements 16.1, 16.4**
   */
  describe('Property 39: Note Password Dual Encryption', () => {
    it('should require both master key and note password for decryption', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 100 }),
          fc.string({ minLength: 8, maxLength: 20 }),
          async (content, notePassword) => {
            // Generate master key (AES-GCM for encryption)
            const masterKey = await generateDEK();

            // Set password protection
            const protectedData = await setNotePassword(
              content,
              masterKey,
              notePassword
            );

            // Decrypt with correct master key and password
            const decrypted = await decryptPasswordProtectedNote(
              protectedData.encryptedContent,
              protectedData.encryptedDEK,
              protectedData.encryptedSalt,
              masterKey,
              notePassword
            );

            expect(decrypted).toBe(content);
          }
        ),
        { numRuns: 5 }
      );
    }, 60000);

    it('should fail decryption with wrong note password', async () => {
      const content = 'Secret content';
      const correctPassword = 'correctPassword123';
      const wrongPassword = 'wrongPassword456';

      const masterKey = await generateDEK();

      const protectedData = await setNotePassword(
        content,
        masterKey,
        correctPassword
      );

      // Attempt decryption with wrong password should fail
      await expect(
        decryptPasswordProtectedNote(
          protectedData.encryptedContent,
          protectedData.encryptedDEK,
          protectedData.encryptedSalt,
          masterKey,
          wrongPassword
        )
      ).rejects.toThrow();
    }, 60000);

    it('should fail decryption with wrong master key', async () => {
      const content = 'Secret content';
      const notePassword = 'myPassword123';

      const masterKey = await generateDEK();
      const wrongMasterKey = await generateDEK();

      const protectedData = await setNotePassword(
        content,
        masterKey,
        notePassword
      );

      // Attempt decryption with wrong master key should fail
      // (salt decryption will fail)
      await expect(
        decryptPasswordProtectedNote(
          protectedData.encryptedContent,
          protectedData.encryptedDEK,
          protectedData.encryptedSalt,
          wrongMasterKey,
          notePassword
        )
      ).rejects.toThrow();
    }, 60000);

    it('encrypted content should be different from plaintext', async () => {
      const content = 'This is my secret note content';
      const notePassword = 'myPassword123';

      const masterKey = await generateDEK();

      const protectedData = await setNotePassword(
        content,
        masterKey,
        notePassword
      );

      // Encrypted content should not contain plaintext
      const serialized = JSON.stringify(protectedData.encryptedContent);
      expect(serialized).not.toContain(content);
    }, 60000);

    it('DEK should be wrapped (not plaintext)', async () => {
      const content = 'Secret content';
      const notePassword = 'myPassword123';

      const masterKey = await generateDEK();

      const protectedData = await setNotePassword(
        content,
        masterKey,
        notePassword
      );

      // DEK should be wrapped with AES-KW
      expect(protectedData.encryptedDEK.algorithm).toBe('AES-KW');
      expect(protectedData.encryptedDEK.wrappedKey).toBeDefined();
      expect(protectedData.encryptedDEK.wrappedKey.length).toBeGreaterThan(0);
    }, 60000);
  });
});
