/**
 * Search Index Encryption Tests
 * Property 31: Search Index Encryption
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { encrypt, decrypt, generateDEK } from '../../crypto/encryption';

/**
 * Simulated encrypted search index entry
 */
interface EncryptedSearchIndex {
  noteId: string;
  encryptedTitleTokens: string; // Encrypted JSON array
  encryptedContentTokens: string; // Encrypted JSON array
  encryptedTags: string; // Encrypted JSON array
  updatedAt: number;
}

/**
 * Plaintext search index entry
 */
interface PlaintextSearchIndex {
  noteId: string;
  titleTokens: string[];
  contentTokens: string[];
  tags: string[];
  updatedAt: number;
}

/**
 * Encrypt search index entry
 */
async function encryptSearchIndex(
  index: PlaintextSearchIndex,
  dek: CryptoKey
): Promise<EncryptedSearchIndex> {
  const encryptedTitleTokens = await encrypt(JSON.stringify(index.titleTokens), dek);
  const encryptedContentTokens = await encrypt(JSON.stringify(index.contentTokens), dek);
  const encryptedTags = await encrypt(JSON.stringify(index.tags), dek);

  return {
    noteId: index.noteId,
    encryptedTitleTokens: JSON.stringify(encryptedTitleTokens),
    encryptedContentTokens: JSON.stringify(encryptedContentTokens),
    encryptedTags: JSON.stringify(encryptedTags),
    updatedAt: index.updatedAt,
  };
}

/**
 * Decrypt search index entry
 */
async function decryptSearchIndex(
  encrypted: EncryptedSearchIndex,
  dek: CryptoKey
): Promise<PlaintextSearchIndex> {
  const titleTokens = JSON.parse(
    await decrypt(JSON.parse(encrypted.encryptedTitleTokens), dek)
  );
  const contentTokens = JSON.parse(
    await decrypt(JSON.parse(encrypted.encryptedContentTokens), dek)
  );
  const tags = JSON.parse(
    await decrypt(JSON.parse(encrypted.encryptedTags), dek)
  );

  return {
    noteId: encrypted.noteId,
    titleTokens,
    contentTokens,
    tags,
    updatedAt: encrypted.updatedAt,
  };
}

describe('Search Index Encryption', () => {
  /**
   * **Feature: secure-notebook, Property 31: Search Index Encryption**
   * For any stored search index, the index data should be encrypted.
   * **Validates: Requirements 12.5**
   */
  describe('Property 31: Search Index Encryption', () => {
    it('should encrypt search index data', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 1, maxLength: 10 }),
          fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 1, maxLength: 20 }),
          fc.array(fc.string({ minLength: 1, maxLength: 10 }), { minLength: 0, maxLength: 5 }),
          async (noteId, titleTokens, contentTokens, tags) => {
            const dek = await generateDEK();

            const plaintext: PlaintextSearchIndex = {
              noteId,
              titleTokens,
              contentTokens,
              tags,
              updatedAt: Date.now(),
            };

            const encrypted = await encryptSearchIndex(plaintext, dek);

            // Encrypted data should not contain plaintext tokens
            const serialized = JSON.stringify(encrypted);
            for (const token of titleTokens) {
              if (token.length > 3) {
                // Only check longer tokens to avoid false positives
                expect(serialized).not.toContain(`"${token}"`);
              }
            }
            for (const token of contentTokens) {
              if (token.length > 3) {
                expect(serialized).not.toContain(`"${token}"`);
              }
            }
          }
        ),
        { numRuns: 20 }
      );
    });

    it('should decrypt search index correctly', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 1, maxLength: 10 }),
          fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 1, maxLength: 20 }),
          fc.array(fc.string({ minLength: 1, maxLength: 10 }), { minLength: 0, maxLength: 5 }),
          async (noteId, titleTokens, contentTokens, tags) => {
            const dek = await generateDEK();

            const plaintext: PlaintextSearchIndex = {
              noteId,
              titleTokens,
              contentTokens,
              tags,
              updatedAt: Date.now(),
            };

            const encrypted = await encryptSearchIndex(plaintext, dek);
            const decrypted = await decryptSearchIndex(encrypted, dek);

            expect(decrypted.noteId).toBe(plaintext.noteId);
            expect(decrypted.titleTokens).toEqual(plaintext.titleTokens);
            expect(decrypted.contentTokens).toEqual(plaintext.contentTokens);
            expect(decrypted.tags).toEqual(plaintext.tags);
          }
        ),
        { numRuns: 20 }
      );
    });

    it('should fail decryption with wrong key', async () => {
      const dek1 = await generateDEK();
      const dek2 = await generateDEK();

      const plaintext: PlaintextSearchIndex = {
        noteId: 'test-note-id',
        titleTokens: ['hello', 'world'],
        contentTokens: ['this', 'is', 'content'],
        tags: ['tag1', 'tag2'],
        updatedAt: Date.now(),
      };

      const encrypted = await encryptSearchIndex(plaintext, dek1);

      // Attempt decryption with wrong key should fail
      await expect(decryptSearchIndex(encrypted, dek2)).rejects.toThrow();
    });

    it('encrypted index should have different ciphertext for same plaintext', async () => {
      const dek = await generateDEK();

      const plaintext: PlaintextSearchIndex = {
        noteId: 'test-note-id',
        titleTokens: ['hello', 'world'],
        contentTokens: ['content'],
        tags: ['tag'],
        updatedAt: Date.now(),
      };

      const encrypted1 = await encryptSearchIndex(plaintext, dek);
      const encrypted2 = await encryptSearchIndex(plaintext, dek);

      // Due to random IV, ciphertexts should be different
      expect(encrypted1.encryptedTitleTokens).not.toBe(encrypted2.encryptedTitleTokens);
      expect(encrypted1.encryptedContentTokens).not.toBe(encrypted2.encryptedContentTokens);
    });
  });
});
