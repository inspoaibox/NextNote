/**
 * Share Service Property Tests
 * Tests for Phase 10: Sharing Functionality
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  ShareRecord,
  SharePermission,
  DEFAULT_NOTE_VISIBILITY,
  generateShareKey,
  createShareRecord,
  isShareValid,
  hasPermission,
  revokeShare,
  isNoteShared,
  getActiveShares,
} from '../share-service';

describe('Share Service Property Tests', () => {
  /**
   * **Feature: secure-notebook, Property 32: Default Note Visibility**
   * For any newly created note, the default visibility should be private.
   * **Validates: Requirements 14.1**
   */
  describe('Property 32: Default Note Visibility', () => {
    it('default visibility is private', () => {
      expect(DEFAULT_NOTE_VISIBILITY).toBe('private');
    });
  });

  /**
   * **Feature: secure-notebook, Property 33: Share Key Generation**
   * For any shared note, a unique share key should be generated.
   * **Validates: Requirements 14.2**
   */
  describe('Property 33: Share Key Generation', () => {
    it('generated share keys are unique', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 10, max: 100 }),
          (count) => {
            const keys = new Set<string>();
            
            for (let i = 0; i < count; i++) {
              keys.add(generateShareKey());
            }
            
            // All keys should be unique
            return keys.size === count;
          }
        ),
        { numRuns: 50 }
      );
    });

    it('share keys have correct length', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 50 }),
          () => {
            const key = generateShareKey();
            // 32 bytes = 64 hex characters
            return key.length === 64;
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  /**
   * **Feature: secure-notebook, Property 34: Share Access Control**
   * For any shared note access attempt, the system should verify the share key 
   * and enforce the permission level.
   * **Validates: Requirements 14.3, 14.4, 14.6**
   */
  describe('Property 34: Share Access Control', () => {
    const shareRecordArb: fc.Arbitrary<ShareRecord> = fc.record({
      id: fc.uuid(),
      noteId: fc.uuid(),
      ownerId: fc.uuid(),
      recipientId: fc.option(fc.uuid(), { nil: null }),
      recipientEmail: fc.emailAddress(),
      encryptedShareKey: fc.hexaString({ minLength: 64, maxLength: 64 }),
      permission: fc.constantFrom('view', 'edit') as fc.Arbitrary<SharePermission>,
      createdAt: fc.integer({ min: 1000000000000, max: 2000000000000 }),
      expiresAt: fc.option(fc.integer({ min: 2000000000000, max: 3000000000000 }), { nil: null }),
      isRevoked: fc.constant(false),
    });

    it('view permission allows viewing', () => {
      fc.assert(
        fc.property(shareRecordArb, (share) => {
          const viewShare = { ...share, permission: 'view' as SharePermission, isRevoked: false };
          return hasPermission(viewShare, 'view') === true;
        }),
        { numRuns: 100 }
      );
    });

    it('view permission does not allow editing', () => {
      fc.assert(
        fc.property(shareRecordArb, (share) => {
          const viewShare = { ...share, permission: 'view' as SharePermission, isRevoked: false };
          return hasPermission(viewShare, 'edit') === false;
        }),
        { numRuns: 100 }
      );
    });

    it('edit permission allows both viewing and editing', () => {
      fc.assert(
        fc.property(shareRecordArb, (share) => {
          const editShare = { ...share, permission: 'edit' as SharePermission, isRevoked: false };
          return hasPermission(editShare, 'view') && hasPermission(editShare, 'edit');
        }),
        { numRuns: 100 }
      );
    });

    it('revoked share denies all access', () => {
      fc.assert(
        fc.property(shareRecordArb, (share) => {
          const revokedShare = { ...share, isRevoked: true };
          return !hasPermission(revokedShare, 'view') && !hasPermission(revokedShare, 'edit');
        }),
        { numRuns: 100 }
      );
    });

    it('expired share denies all access', () => {
      fc.assert(
        fc.property(shareRecordArb, (share) => {
          const expiredShare = { 
            ...share, 
            expiresAt: Date.now() - 1000, // Expired 1 second ago
            isRevoked: false,
          };
          return !hasPermission(expiredShare, 'view') && !hasPermission(expiredShare, 'edit');
        }),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: secure-notebook, Property 35: Share Revocation**
   * For any revoked share, the share key should be invalidated.
   * **Validates: Requirements 14.5**
   */
  describe('Property 35: Share Revocation', () => {
    const shareRecordArb: fc.Arbitrary<ShareRecord> = fc.record({
      id: fc.uuid(),
      noteId: fc.uuid(),
      ownerId: fc.uuid(),
      recipientId: fc.option(fc.uuid(), { nil: null }),
      recipientEmail: fc.emailAddress(),
      encryptedShareKey: fc.hexaString({ minLength: 64, maxLength: 64 }),
      permission: fc.constantFrom('view', 'edit') as fc.Arbitrary<SharePermission>,
      createdAt: fc.integer({ min: 1000000000000, max: 2000000000000 }),
      expiresAt: fc.constant(null),
      isRevoked: fc.constant(false),
    });

    it('revoking share sets isRevoked to true', () => {
      fc.assert(
        fc.property(shareRecordArb, (share) => {
          const revoked = revokeShare(share);
          return revoked.isRevoked === true;
        }),
        { numRuns: 100 }
      );
    });

    it('revoked share is not valid', () => {
      fc.assert(
        fc.property(shareRecordArb, (share) => {
          const revoked = revokeShare(share);
          return isShareValid(revoked) === false;
        }),
        { numRuns: 100 }
      );
    });

    it('revoked share is not included in active shares', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          fc.array(shareRecordArb, { minLength: 1, maxLength: 10 }),
          (noteId, shares) => {
            // Set all shares to the same note
            const noteShares = shares.map(s => ({ ...s, noteId }));
            
            // Revoke some shares
            const revokedShares = noteShares.map((s, i) => 
              i % 2 === 0 ? revokeShare(s) : s
            );
            
            const active = getActiveShares(revokedShares, noteId);
            
            // No revoked shares should be in active list
            return active.every(s => !s.isRevoked);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Share Utility Functions', () => {
    it('isNoteShared returns true when note has active shares', () => {
      fc.assert(
        fc.property(fc.uuid(), (noteId) => {
          const share = createShareRecord(
            noteId,
            'owner-1',
            'recipient@example.com',
            'encrypted-key',
            'view'
          );
          
          return isNoteShared([share], noteId) === true;
        }),
        { numRuns: 100 }
      );
    });

    it('isNoteShared returns false when note has no shares', () => {
      fc.assert(
        fc.property(fc.uuid(), fc.uuid(), (noteId, otherNoteId) => {
          if (noteId === otherNoteId) return true;
          
          const share = createShareRecord(
            otherNoteId,
            'owner-1',
            'recipient@example.com',
            'encrypted-key',
            'view'
          );
          
          return isNoteShared([share], noteId) === false;
        }),
        { numRuns: 100 }
      );
    });
  });
});
