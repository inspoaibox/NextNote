/**
 * Backup Service Property Tests
 * Tests for Phase 8: Backup Functionality
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  createBackupMetadata,
  createBackupPackage,
  verifyBackupIntegrity,
  extractBackupData,
  serializeBackup,
  deserializeBackup,
  createBackupInfo,
  enforceVersionRetention,
} from '../backup-service';
import type { BackupInfo } from '../../types';

describe('Backup Service Property Tests', () => {
  /**
   * **Feature: secure-notebook, Property 11: Backup Integrity**
   * For any backup, corrupting any byte of the backup data should cause 
   * the SHA-256 checksum verification to fail during restore.
   * **Validates: Requirements 4.4**
   */
  describe('Property 11: Backup Integrity', () => {
    it('valid backup passes integrity check', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uint8Array({ minLength: 1, maxLength: 1000 }),
          fc.array(fc.uuid(), { minLength: 0, maxLength: 10 }),
          fc.array(fc.uuid(), { minLength: 0, maxLength: 5 }),
          async (data, noteIds, folderIds) => {
            const metadata = createBackupMetadata('user-1', noteIds, folderIds, []);
            const backup = await createBackupPackage(data.buffer, metadata);
            const result = await verifyBackupIntegrity(backup);
            
            return result.valid === true;
          }
        ),
        { numRuns: 50 }
      );
    });

    it('corrupted backup fails integrity check', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uint8Array({ minLength: 10, maxLength: 500 }),
          fc.integer({ min: 0, max: 499 }),
          async (data, corruptIndex) => {
            const metadata = createBackupMetadata('user-1', ['note-1'], ['folder-1'], []);
            const backup = await createBackupPackage(data.buffer, metadata);
            
            // Corrupt the data by modifying a character
            const idx = corruptIndex % backup.data.length;
            const chars = backup.data.split('');
            chars[idx] = chars[idx] === 'A' ? 'B' : 'A';
            const corruptedBackup = { ...backup, data: chars.join('') };
            
            const result = await verifyBackupIntegrity(corruptedBackup);
            
            return result.valid === false;
          }
        ),
        { numRuns: 50 }
      );
    });

    it('modified checksum fails integrity check', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uint8Array({ minLength: 1, maxLength: 500 }),
          async (data) => {
            const metadata = createBackupMetadata('user-1', ['note-1'], [], []);
            const backup = await createBackupPackage(data.buffer, metadata);
            
            // Modify the checksum
            const corruptedBackup = { 
              ...backup, 
              checksum: backup.checksum.replace(/[a-f0-9]/, 'x') 
            };
            
            const result = await verifyBackupIntegrity(corruptedBackup);
            
            return result.valid === false;
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  /**
   * **Feature: secure-notebook, Property 12: Backup Metadata Completeness**
   * For any backup, the encrypted metadata should contain references to all 
   * folders and notes that existed at backup time.
   * **Validates: Requirements 4.3**
   */
  describe('Property 12: Backup Metadata Completeness', () => {
    it('metadata contains all note IDs', () => {
      fc.assert(
        fc.property(
          fc.array(fc.uuid(), { minLength: 0, maxLength: 20 }),
          fc.array(fc.uuid(), { minLength: 0, maxLength: 10 }),
          (noteIds, folderIds) => {
            const metadata = createBackupMetadata('user-1', noteIds, folderIds, []);
            
            // All note IDs should be in metadata
            return noteIds.every(id => metadata.noteIds.includes(id));
          }
        ),
        { numRuns: 100 }
      );
    });

    it('metadata contains all folder IDs', () => {
      fc.assert(
        fc.property(
          fc.array(fc.uuid(), { minLength: 0, maxLength: 20 }),
          fc.array(fc.uuid(), { minLength: 0, maxLength: 10 }),
          (noteIds, folderIds) => {
            const metadata = createBackupMetadata('user-1', noteIds, folderIds, []);
            
            // All folder IDs should be in metadata
            return folderIds.every(id => metadata.folderIds.includes(id));
          }
        ),
        { numRuns: 100 }
      );
    });

    it('metadata has correct counts', () => {
      fc.assert(
        fc.property(
          fc.array(fc.uuid(), { minLength: 0, maxLength: 20 }),
          fc.array(fc.uuid(), { minLength: 0, maxLength: 10 }),
          fc.array(fc.uuid(), { minLength: 0, maxLength: 5 }),
          (noteIds, folderIds, imageIds) => {
            const metadata = createBackupMetadata('user-1', noteIds, folderIds, imageIds);
            
            return (
              metadata.noteIds.length === noteIds.length &&
              metadata.folderIds.length === folderIds.length &&
              metadata.imageIds.length === imageIds.length
            );
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: secure-notebook, Property 14: Cloud Backup Version Retention**
   * For any note with more than 30 cloud backups, only the last 30 versions 
   * should be retained.
   * **Validates: Requirements 5.3**
   */
  describe('Property 14: Cloud Backup Version Retention', () => {
    const MAX_VERSIONS = 30;

    const backupInfoArb: fc.Arbitrary<BackupInfo> = fc.record({
      id: fc.uuid(),
      timestamp: fc.integer({ min: 1000000000000, max: 2000000000000 }),
      size: fc.integer({ min: 100, max: 1000000 }),
      checksum: fc.hexaString({ minLength: 64, maxLength: 64 }),
      noteCount: fc.integer({ min: 0, max: 1000 }),
      folderCount: fc.integer({ min: 0, max: 100 }),
      type: fc.constant('cloud' as const),
    });

    it('retains at most 30 versions', () => {
      fc.assert(
        fc.property(
          fc.array(backupInfoArb, { minLength: 0, maxLength: 50 }),
          (backups) => {
            const { keep } = enforceVersionRetention(backups, MAX_VERSIONS);
            return keep.length <= MAX_VERSIONS;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('keeps most recent versions', () => {
      fc.assert(
        fc.property(
          fc.array(backupInfoArb, { minLength: 31, maxLength: 50 }),
          (backups) => {
            const { keep } = enforceVersionRetention(backups, MAX_VERSIONS);
            
            // Sort original by timestamp descending
            const sorted = [...backups].sort((a, b) => b.timestamp - a.timestamp);
            const expectedIds = new Set(sorted.slice(0, MAX_VERSIONS).map(b => b.id));
            
            // All kept backups should be in the expected set
            return keep.every(b => expectedIds.has(b.id));
          }
        ),
        { numRuns: 100 }
      );
    });

    it('removes oldest versions', () => {
      fc.assert(
        fc.property(
          fc.array(backupInfoArb, { minLength: 31, maxLength: 50 }),
          (backups) => {
            const { remove } = enforceVersionRetention(backups, MAX_VERSIONS);
            
            // Sort original by timestamp descending
            const sorted = [...backups].sort((a, b) => b.timestamp - a.timestamp);
            const expectedRemoveIds = new Set(sorted.slice(MAX_VERSIONS).map(b => b.id));
            
            // All removed backups should be in the expected set
            return remove.every(b => expectedRemoveIds.has(b.id));
          }
        ),
        { numRuns: 100 }
      );
    });

    it('does not remove when under limit', () => {
      fc.assert(
        fc.property(
          fc.array(backupInfoArb, { minLength: 0, maxLength: 29 }),
          (backups) => {
            const { keep, remove } = enforceVersionRetention(backups, MAX_VERSIONS);
            
            return keep.length === backups.length && remove.length === 0;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: secure-notebook, Property 15: Backup Metadata Recording**
   * For any completed backup, the local metadata should contain the correct 
   * size and checksum.
   * **Validates: Requirements 5.5**
   */
  describe('Property 15: Backup Metadata Recording', () => {
    it('backup info has correct size', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uint8Array({ minLength: 1, maxLength: 1000 }),
          async (data) => {
            const metadata = createBackupMetadata('user-1', ['note-1'], [], []);
            const backup = await createBackupPackage(data.buffer, metadata);
            const info = createBackupInfo('backup-1', backup);
            
            return info.size === backup.data.length;
          }
        ),
        { numRuns: 50 }
      );
    });

    it('backup info has correct checksum', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uint8Array({ minLength: 1, maxLength: 1000 }),
          async (data) => {
            const metadata = createBackupMetadata('user-1', ['note-1'], [], []);
            const backup = await createBackupPackage(data.buffer, metadata);
            const info = createBackupInfo('backup-1', backup);
            
            return info.checksum === backup.checksum;
          }
        ),
        { numRuns: 50 }
      );
    });

    it('backup info has correct note count', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uint8Array({ minLength: 1, maxLength: 500 }),
          fc.array(fc.uuid(), { minLength: 0, maxLength: 20 }),
          async (data, noteIds) => {
            const metadata = createBackupMetadata('user-1', noteIds, [], []);
            const backup = await createBackupPackage(data.buffer, metadata);
            const info = createBackupInfo('backup-1', backup);
            
            return info.noteCount === noteIds.length;
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe('Backup Serialization', () => {
    it('serialize and deserialize round-trip', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uint8Array({ minLength: 1, maxLength: 500 }),
          async (data) => {
            const metadata = createBackupMetadata('user-1', ['note-1'], ['folder-1'], []);
            const backup = await createBackupPackage(data.buffer, metadata);
            
            const serialized = serializeBackup(backup);
            const deserialized = deserializeBackup(serialized);
            
            return (
              deserialized !== null &&
              deserialized.checksum === backup.checksum &&
              deserialized.data === backup.data
            );
          }
        ),
        { numRuns: 50 }
      );
    });

    it('extract data returns original data', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uint8Array({ minLength: 1, maxLength: 500 }),
          async (data) => {
            const metadata = createBackupMetadata('user-1', ['note-1'], [], []);
            const backup = await createBackupPackage(data.buffer, metadata);
            
            const extracted = extractBackupData(backup);
            const extractedArray = new Uint8Array(extracted);
            
            // Compare arrays
            if (extractedArray.length !== data.length) return false;
            for (let i = 0; i < data.length; i++) {
              if (extractedArray[i] !== data[i]) return false;
            }
            return true;
          }
        ),
        { numRuns: 50 }
      );
    });
  });
});
