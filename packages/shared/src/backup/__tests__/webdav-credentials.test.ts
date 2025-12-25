/**
 * WebDAV Credentials Security Tests
 * Property 13: WebDAV Credentials Security
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  encryptCredentials,
  decryptCredentials,
  isCredentialsEncrypted,
  type WebDAVCredentials,
} from '../webdav-client';

describe('WebDAV Credentials Security', () => {
  /**
   * **Feature: secure-notebook, Property 13: WebDAV Credentials Security**
   * For any stored WebDAV credentials, they should be encrypted with the device-specific key.
   */
  describe('Property 13: WebDAV Credentials Security', () => {
    it('should encrypt WebDAV credentials', () => {
      fc.assert(
        fc.property(
          fc.record({
            url: fc.webUrl(),
            username: fc.string({ minLength: 1, maxLength: 50 }),
            password: fc.string({ minLength: 1, maxLength: 100 }),
          }),
          fc.string({ minLength: 32, maxLength: 32 }), // device key
          (credentials, deviceKey) => {
            const encrypted = encryptCredentials(credentials, deviceKey);
            
            // Encrypted credentials should not contain plaintext password
            expect(encrypted.encryptedPassword).not.toBe(credentials.password);
            expect(encrypted.encryptedPassword.length).toBeGreaterThan(credentials.password.length);
            
            // Should be detected as encrypted
            expect(isCredentialsEncrypted(encrypted)).toBe(true);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should decrypt WebDAV credentials correctly', () => {
      fc.assert(
        fc.property(
          fc.record({
            url: fc.webUrl(),
            username: fc.string({ minLength: 1, maxLength: 50 }),
            password: fc.string({ minLength: 1, maxLength: 100 }),
          }),
          fc.string({ minLength: 32, maxLength: 32 }),
          (credentials, deviceKey) => {
            const encrypted = encryptCredentials(credentials, deviceKey);
            const decrypted = decryptCredentials(encrypted, deviceKey);
            
            expect(decrypted.url).toBe(credentials.url);
            expect(decrypted.username).toBe(credentials.username);
            expect(decrypted.password).toBe(credentials.password);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should fail decryption with wrong device key', () => {
      const credentials: WebDAVCredentials = {
        url: 'https://webdav.example.com',
        username: 'user',
        password: 'secret123',
      };
      const deviceKey1 = 'a'.repeat(32);
      const deviceKey2 = 'b'.repeat(32);

      const encrypted = encryptCredentials(credentials, deviceKey1);
      
      expect(() => decryptCredentials(encrypted, deviceKey2)).toThrow();
    });

    it('should not store plaintext password', () => {
      const credentials: WebDAVCredentials = {
        url: 'https://webdav.example.com',
        username: 'user',
        password: 'mySecretPassword123!',
      };
      const deviceKey = 'x'.repeat(32);

      const encrypted = encryptCredentials(credentials, deviceKey);
      const serialized = JSON.stringify(encrypted);

      // Plaintext password should not appear in serialized form
      expect(serialized).not.toContain(credentials.password);
    });
  });
});
