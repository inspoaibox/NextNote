/**
 * Conflict Detection Property Tests
 * Tests for Phase 7: Sync Engine
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  detectConflict,
  detectConflicts,
  resolveConflict,
  orderChangesByCausality,
  mergeChanges,
} from '../conflict-detection';
import { incrementClock, createVectorClock, mergeClocks } from '../vector-clock';
import type { SyncChange, VectorClock, ConflictResolution } from '../../types';

// Arbitrary for generating sync changes
const syncChangeArb = (entityId?: string): fc.Arbitrary<SyncChange> =>
  fc.record({
    entityType: fc.constantFrom('note', 'folder') as fc.Arbitrary<'note' | 'folder'>,
    entityId: entityId ? fc.constant(entityId) : fc.uuid(),
    operation: fc.constantFrom('create', 'update', 'delete') as fc.Arbitrary<'create' | 'update' | 'delete'>,
    encryptedData: fc.record({
      iv: fc.string(),
      ciphertext: fc.string(),
      tag: fc.string(),
      algorithm: fc.constant('AES-256-GCM' as const),
    }),
    vectorClock: fc.dictionary(
      fc.string({ minLength: 1, maxLength: 10 }),
      fc.integer({ min: 1, max: 100 })
    ) as fc.Arbitrary<VectorClock>,
    deviceId: fc.uuid(),
    timestamp: fc.integer({ min: 1000000000000, max: 2000000000000 }),
  });

describe('Conflict Detection Property Tests', () => {
  /**
   * **Feature: secure-notebook, Property 8: Conflict Detection**
   * For any two concurrent modifications to the same note from different devices,
   * the sync engine should detect the conflict and preserve both versions.
   * **Validates: Requirements 3.2**
   */
  describe('Property 8: Conflict Detection', () => {
    it('detects conflict for concurrent changes to same entity', () => {
      fc.assert(
        fc.property(fc.uuid(), fc.uuid(), fc.uuid(), (entityId, device1, device2) => {
          // Create two concurrent changes from different devices
          const baseClock = createVectorClock();
          const clock1 = incrementClock(baseClock, device1);
          const clock2 = incrementClock(baseClock, device2);

          const change1: SyncChange = {
            entityType: 'note',
            entityId,
            operation: 'update',
            encryptedData: { iv: '', ciphertext: 'data1', tag: '', algorithm: 'AES-256-GCM' },
            vectorClock: clock1,
            deviceId: device1,
            timestamp: Date.now(),
          };
          
          const change2: SyncChange = {
            entityType: 'note',
            entityId,
            operation: 'update',
            encryptedData: { iv: '', ciphertext: 'data2', tag: '', algorithm: 'AES-256-GCM' },
            vectorClock: clock2,
            deviceId: device2,
            timestamp: Date.now() + 1,
          };
          
          const conflict = detectConflict(change1, change2);
          
          // Should detect conflict for concurrent changes
          return conflict !== null && conflict.entityId === entityId;
        }),
        { numRuns: 100 }
      );
    });

    it('no conflict for sequential changes', () => {
      fc.assert(
        fc.property(fc.uuid(), fc.uuid(), (entityId, deviceId) => {
          const clock1 = incrementClock(createVectorClock(), deviceId);
          const clock2 = incrementClock(clock1, deviceId);
          
          const change1: SyncChange = {
            entityType: 'note',
            entityId,
            operation: 'update',
            encryptedData: { iv: '', ciphertext: 'data1', tag: '', algorithm: 'AES-256-GCM' },
            vectorClock: clock1,
            deviceId,
            timestamp: Date.now(),
          };
          
          const change2: SyncChange = {
            entityType: 'note',
            entityId,
            operation: 'update',
            encryptedData: { iv: '', ciphertext: 'data2', tag: '', algorithm: 'AES-256-GCM' },
            vectorClock: clock2,
            deviceId,
            timestamp: Date.now() + 1,
          };
          
          const conflict = detectConflict(change1, change2);
          
          // Should not detect conflict for sequential changes
          return conflict === null;
        }),
        { numRuns: 100 }
      );
    });

    it('no conflict for changes to different entities', () => {
      fc.assert(
        fc.property(fc.uuid(), fc.uuid(), fc.uuid(), fc.uuid(), (entity1, entity2, device1, device2) => {
          if (entity1 === entity2) return true; // Skip if same entity
          
          const clock1 = incrementClock(createVectorClock(), device1);
          const clock2 = incrementClock(createVectorClock(), device2);
          
          const change1: SyncChange = {
            entityType: 'note',
            entityId: entity1,
            operation: 'update',
            encryptedData: { iv: '', ciphertext: 'data1', tag: '', algorithm: 'AES-256-GCM' },
            vectorClock: clock1,
            deviceId: device1,
            timestamp: Date.now(),
          };
          
          const change2: SyncChange = {
            entityType: 'note',
            entityId: entity2,
            operation: 'update',
            encryptedData: { iv: '', ciphertext: 'data2', tag: '', algorithm: 'AES-256-GCM' },
            vectorClock: clock2,
            deviceId: device2,
            timestamp: Date.now() + 1,
          };
          
          const conflict = detectConflict(change1, change2);
          
          return conflict === null;
        }),
        { numRuns: 100 }
      );
    });

    it('conflict resolution preserves entity id', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          fc.uuid(),
          fc.uuid(),
          fc.constantFrom('keep-local', 'keep-remote', 'keep-both') as fc.Arbitrary<ConflictResolution>,
          (entityId, device1, device2, resolution) => {
            const clock1 = incrementClock(createVectorClock(), device1);
            const clock2 = incrementClock(createVectorClock(), device2);
            
            const change1: SyncChange = {
              entityType: 'note',
              entityId,
              operation: 'update',
              encryptedData: { iv: '', ciphertext: 'data1', tag: '', algorithm: 'AES-256-GCM' },
              vectorClock: clock1,
              deviceId: device1,
              timestamp: Date.now(),
            };
            
            const change2: SyncChange = {
              entityType: 'note',
              entityId,
              operation: 'update',
              encryptedData: { iv: '', ciphertext: 'data2', tag: '', algorithm: 'AES-256-GCM' },
              vectorClock: clock2,
              deviceId: device2,
              timestamp: Date.now() + 1,
            };
            
            const conflict = detectConflict(change1, change2);
            if (!conflict) return true;
            
            const resolved = resolveConflict(conflict, resolution);
            
            return resolved.resultingChange.entityId === entityId;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('resolved conflict has merged vector clock', () => {
      fc.assert(
        fc.property(fc.uuid(), fc.uuid(), fc.uuid(), (entityId, device1, device2) => {
          const clock1 = incrementClock(createVectorClock(), device1);
          const clock2 = incrementClock(createVectorClock(), device2);
          
          const change1: SyncChange = {
            entityType: 'note',
            entityId,
            operation: 'update',
            encryptedData: { iv: '', ciphertext: 'data1', tag: '', algorithm: 'AES-256-GCM' },
            vectorClock: clock1,
            deviceId: device1,
            timestamp: Date.now(),
          };
          
          const change2: SyncChange = {
            entityType: 'note',
            entityId,
            operation: 'update',
            encryptedData: { iv: '', ciphertext: 'data2', tag: '', algorithm: 'AES-256-GCM' },
            vectorClock: clock2,
            deviceId: device2,
            timestamp: Date.now() + 1,
          };
          
          const conflict = detectConflict(change1, change2);
          if (!conflict) return true;
          
          const resolved = resolveConflict(conflict, 'keep-local');
          const expectedMerged = mergeClocks(clock1, clock2);
          
          // Check that merged clock has both device timestamps
          return (
            resolved.mergedClock[device1] === expectedMerged[device1] &&
            resolved.mergedClock[device2] === expectedMerged[device2]
          );
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Change Ordering', () => {
    it('ordered changes maintain causal order', () => {
      fc.assert(
        fc.property(fc.uuid(), fc.uuid(), (entityId, deviceId) => {
          const clock1 = incrementClock(createVectorClock(), deviceId);
          const clock2 = incrementClock(clock1, deviceId);
          const clock3 = incrementClock(clock2, deviceId);
          
          const changes: SyncChange[] = [
            {
              entityType: 'note',
              entityId,
              operation: 'update',
              encryptedData: { iv: '', ciphertext: 'data3', tag: '', algorithm: 'AES-256-GCM' },
              vectorClock: clock3,
              deviceId,
              timestamp: Date.now() + 2,
            },
            {
              entityType: 'note',
              entityId,
              operation: 'update',
              encryptedData: { iv: '', ciphertext: 'data1', tag: '', algorithm: 'AES-256-GCM' },
              vectorClock: clock1,
              deviceId,
              timestamp: Date.now(),
            },
            {
              entityType: 'note',
              entityId,
              operation: 'update',
              encryptedData: { iv: '', ciphertext: 'data2', tag: '', algorithm: 'AES-256-GCM' },
              vectorClock: clock2,
              deviceId,
              timestamp: Date.now() + 1,
            },
          ];
          
          const ordered = orderChangesByCausality(changes);
          
          // First change should have clock1, last should have clock3
          return (
            ordered[0].vectorClock[deviceId] === 1 &&
            ordered[1].vectorClock[deviceId] === 2 &&
            ordered[2].vectorClock[deviceId] === 3
          );
        }),
        { numRuns: 100 }
      );
    });
  });
});
