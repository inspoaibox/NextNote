/**
 * Integrity Verification Property Tests
 * Tests for Phase 7: Sync Engine
 */

import { describe, it, expect, beforeAll } from 'vitest';
import * as fc from 'fast-check';
import {
  computeHMAC,
  verifyHMAC,
  generateHMACKey,
  computeSHA256,
  verifySHA256,
  createIntegrityEnvelope,
  verifyIntegrityEnvelope,
} from '../integrity';

describe('Integrity Verification Property Tests', () => {
  let hmacKey: CryptoKey;

  beforeAll(async () => {
    hmacKey = await generateHMACKey();
  });

  /**
   * **Feature: secure-notebook, Property 10: Sync Integrity Verification**
   * For any synced data, the HMAC-SHA256 checksum should match the computed 
   * checksum of the received data.
   * **Validates: Requirements 3.6**
   */
  describe('Property 10: Sync Integrity Verification', () => {
    it('HMAC verification succeeds for unmodified data', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 0, maxLength: 10000 }),
          async (data) => {
            const hmac = await computeHMAC(data, hmacKey);
            const isValid = await verifyHMAC(data, hmac, hmacKey);
            
            return isValid === true;
          }
        ),
        { numRuns: 50 }
      );
    });

    it('HMAC verification fails for modified data', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 1000 }),
          fc.string({ minLength: 1, maxLength: 1000 }),
          async (data, modification) => {
            if (data === modification) return true; // Skip if same
            
            const hmac = await computeHMAC(data, hmacKey);
            const isValid = await verifyHMAC(modification, hmac, hmacKey);
            
            return isValid === false;
          }
        ),
        { numRuns: 50 }
      );
    });

    it('same data produces same HMAC', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 0, maxLength: 1000 }),
          async (data) => {
            const hmac1 = await computeHMAC(data, hmacKey);
            const hmac2 = await computeHMAC(data, hmacKey);
            
            return hmac1 === hmac2;
          }
        ),
        { numRuns: 50 }
      );
    });

    it('different data produces different HMAC', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 500 }),
          fc.string({ minLength: 1, maxLength: 500 }),
          async (data1, data2) => {
            if (data1 === data2) return true; // Skip if same
            
            const hmac1 = await computeHMAC(data1, hmacKey);
            const hmac2 = await computeHMAC(data2, hmacKey);
            
            return hmac1 !== hmac2;
          }
        ),
        { numRuns: 50 }
      );
    });

    it('different keys produce different HMACs for same data', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 500 }),
          async (data) => {
            const key1 = await generateHMACKey();
            const key2 = await generateHMACKey();
            
            const hmac1 = await computeHMAC(data, key1);
            const hmac2 = await computeHMAC(data, key2);
            
            // Different keys should produce different HMACs (with overwhelming probability)
            return hmac1 !== hmac2;
          }
        ),
        { numRuns: 20 }
      );
    });
  });

  describe('SHA-256 Hash Properties', () => {
    it('SHA-256 verification succeeds for unmodified data', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 0, maxLength: 5000 }),
          async (data) => {
            const hash = await computeSHA256(data);
            const isValid = await verifySHA256(data, hash);
            
            return isValid === true;
          }
        ),
        { numRuns: 50 }
      );
    });

    it('SHA-256 verification fails for modified data', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 500 }),
          fc.string({ minLength: 1, maxLength: 500 }),
          async (data, modification) => {
            if (data === modification) return true;
            
            const hash = await computeSHA256(data);
            const isValid = await verifySHA256(modification, hash);
            
            return isValid === false;
          }
        ),
        { numRuns: 50 }
      );
    });

    it('same data produces same SHA-256 hash', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 0, maxLength: 1000 }),
          async (data) => {
            const hash1 = await computeSHA256(data);
            const hash2 = await computeSHA256(data);
            
            return hash1 === hash2;
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe('Integrity Envelope', () => {
    it('envelope verification succeeds for valid envelope', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 0, maxLength: 1000 }),
          async (data) => {
            const envelope = await createIntegrityEnvelope(data, hmacKey);
            const result = await verifyIntegrityEnvelope(envelope, hmacKey);
            
            return result.valid === true && result.data === data;
          }
        ),
        { numRuns: 50 }
      );
    });

    it('envelope verification fails for tampered data', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 500 }),
          fc.string({ minLength: 1, maxLength: 500 }),
          async (data, tamperedData) => {
            if (data === tamperedData) return true;
            
            const envelope = await createIntegrityEnvelope(data, hmacKey);
            const tamperedEnvelope = { ...envelope, data: tamperedData };
            const result = await verifyIntegrityEnvelope(tamperedEnvelope, hmacKey);
            
            return result.valid === false && result.data === null;
          }
        ),
        { numRuns: 50 }
      );
    });

    it('envelope contains timestamp', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 0, maxLength: 500 }),
          async (data) => {
            const before = Date.now();
            const envelope = await createIntegrityEnvelope(data, hmacKey);
            const after = Date.now();
            
            return envelope.timestamp >= before && envelope.timestamp <= after;
          }
        ),
        { numRuns: 50 }
      );
    });
  });
});
