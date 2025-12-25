/**
 * Note Password Recovery Tests
 * Property 44: Note Password Recovery
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  createNotePasswordRecoveryData,
  recoverNoteWithRecoveryKey,
  resetNotePasswordWithRecovery,
  removeNotePasswordWithRecovery,
} from '../note-password';
import { generateKEK } from '../../crypto/key-wrapping';

describe('Note Password Recovery', () => {
  /**
   * **Feature: secure-notebook, Property 44: Note Password Recovery**
   * For any password-protected note, using the account recovery key should allow
   * password reset without data loss.
   */
  describe('Property 44: Note Password Recovery', () => {
    it('should recover note content using recovery key', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 100 }),
          fc.string({ minLength: 8, maxLength: 20 }),
          async (content, notePassword) => {
            const recoveryKey = await generateKEK();

            // Create password-protected note with recovery data
            const protectedData = await createNotePasswordRecoveryData(
              content,
              recoveryKey,
              notePassword
            );

            // Recover using recovery key
            const recoveredContent = await recoverNoteWithRecoveryKey(
              protectedData.encryptedContent,
              protectedData.recoveryWrappedDEK,
              recoveryKey
            );

            expect(recoveredContent).toBe(content);
          }
        ),
        { numRuns: 5 }
      );
    }, 60000);

    it('should reset note password without data loss', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 100 }),
          fc.string({ minLength: 8, maxLength: 20 }),
          fc.string({ minLength: 8, maxLength: 20 }),
          async (content, oldPassword, newPassword) => {
            const recoveryKey = await generateKEK();

            // Create password-protected note
            const protectedData = await createNotePasswordRecoveryData(
              content,
              recoveryKey,
              oldPassword
            );

            // Reset password using recovery key
            const newProtectedData = await resetNotePasswordWithRecovery(
              protectedData.encryptedContent,
              protectedData.recoveryWrappedDEK,
              recoveryKey,
              newPassword
            );

            // Verify content is preserved after password reset
            const recoveredContent = await recoverNoteWithRecoveryKey(
              newProtectedData.encryptedContent,
              newProtectedData.recoveryWrappedDEK,
              recoveryKey
            );

            expect(recoveredContent).toBe(content);
          }
        ),
        { numRuns: 5 }
      );
    }, 60000);

    it('should remove password protection using recovery key', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 100 }),
          fc.string({ minLength: 8, maxLength: 20 }),
          async (content, notePassword) => {
            const recoveryKey = await generateKEK();
            const masterKEK = await generateKEK();

            // Create password-protected note
            const protectedData = await createNotePasswordRecoveryData(
              content,
              recoveryKey,
              notePassword
            );

            // Remove password using recovery key
            const unprotectedData = await removeNotePasswordWithRecovery(
              protectedData.encryptedContent,
              protectedData.recoveryWrappedDEK,
              recoveryKey,
              masterKEK
            );

            // Verify content is preserved and no longer password-protected
            expect(unprotectedData.encryptedContent).toBeDefined();
            expect(unprotectedData.encryptedDEK).toBeDefined();
            // The new DEK should be wrapped with master key only
            expect(unprotectedData.encryptedDEK.algorithm).toBe('AES-KW');
          }
        ),
        { numRuns: 5 }
      );
    }, 60000);

    it('should fail recovery with wrong recovery key', async () => {
      const content = 'Secret note content';
      const notePassword = 'myPassword123';
      
      const recoveryKey = await generateKEK();
      const wrongRecoveryKey = await generateKEK();

      const protectedData = await createNotePasswordRecoveryData(
        content,
        recoveryKey,
        notePassword
      );

      // Attempt recovery with wrong key should fail
      await expect(
        recoverNoteWithRecoveryKey(
          protectedData.encryptedContent,
          protectedData.recoveryWrappedDEK,
          wrongRecoveryKey
        )
      ).rejects.toThrow();
    }, 60000);
  });
});
