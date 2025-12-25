/**
 * Conflict Detection Module
 * Detects and handles concurrent modifications in distributed sync
 */

import type { VectorClock, SyncChange, ConflictResolution } from '../types';
import { areConcurrent, happenedBefore, mergeClocks } from './vector-clock';

/**
 * Conflict information
 */
export interface Conflict {
  entityType: 'note' | 'folder' | 'image';
  entityId: string;
  localChange: SyncChange;
  remoteChange: SyncChange;
  detectedAt: number;
}

/**
 * Resolved conflict result
 */
export interface ResolvedConflict {
  conflict: Conflict;
  resolution: ConflictResolution;
  resultingChange: SyncChange;
  mergedClock: VectorClock;
}

/**
 * Detect if two changes are in conflict
 */
export function detectConflict(
  localChange: SyncChange,
  remoteChange: SyncChange
): Conflict | null {
  // Must be for the same entity
  if (
    localChange.entityType !== remoteChange.entityType ||
    localChange.entityId !== remoteChange.entityId
  ) {
    return null;
  }
  
  // Check if the changes are concurrent using vector clocks
  if (areConcurrent(localChange.vectorClock, remoteChange.vectorClock)) {
    return {
      entityType: localChange.entityType,
      entityId: localChange.entityId,
      localChange,
      remoteChange,
      detectedAt: Date.now(),
    };
  }
  
  return null;
}

/**
 * Detect conflicts in a batch of changes
 */
export function detectConflicts(
  localChanges: SyncChange[],
  remoteChanges: SyncChange[]
): Conflict[] {
  const conflicts: Conflict[] = [];
  
  for (const local of localChanges) {
    for (const remote of remoteChanges) {
      const conflict = detectConflict(local, remote);
      if (conflict) {
        conflicts.push(conflict);
      }
    }
  }
  
  return conflicts;
}

/**
 * Resolve a conflict based on the chosen resolution strategy
 */
export function resolveConflict(
  conflict: Conflict,
  resolution: ConflictResolution
): ResolvedConflict {
  const { localChange, remoteChange } = conflict;
  const mergedClock = mergeClocks(localChange.vectorClock, remoteChange.vectorClock);
  
  let resultingChange: SyncChange;
  
  switch (resolution) {
    case 'keep-local':
      resultingChange = {
        ...localChange,
        vectorClock: mergedClock,
      };
      break;
      
    case 'keep-remote':
      resultingChange = {
        ...remoteChange,
        vectorClock: mergedClock,
      };
      break;
      
    case 'keep-both':
      // For keep-both, we create a new change that represents both versions
      // The actual implementation would create a copy of the entity
      resultingChange = {
        ...localChange,
        operation: 'create', // Create a copy
        vectorClock: mergedClock,
      };
      break;
      
    default:
      throw new Error(`Unknown resolution strategy: ${resolution}`);
  }
  
  return {
    conflict,
    resolution,
    resultingChange,
    mergedClock,
  };
}

/**
 * Determine the order of changes based on vector clocks
 * Returns changes sorted in causal order
 */
export function orderChangesByCausality(changes: SyncChange[]): SyncChange[] {
  return [...changes].sort((a, b) => {
    if (happenedBefore(a.vectorClock, b.vectorClock)) {
      return -1;
    }
    if (happenedBefore(b.vectorClock, a.vectorClock)) {
      return 1;
    }
    // Concurrent or equal - use timestamp as tiebreaker
    return a.timestamp - b.timestamp;
  });
}

/**
 * Check if a change should be applied based on current state
 */
export function shouldApplyChange(
  change: SyncChange,
  currentClock: VectorClock
): boolean {
  // Apply if the change happened after our current state
  return happenedBefore(currentClock, change.vectorClock) ||
    areConcurrent(currentClock, change.vectorClock);
}

/**
 * Merge changes from multiple sources, detecting and handling conflicts
 */
export function mergeChanges(
  localChanges: SyncChange[],
  remoteChanges: SyncChange[],
  conflictResolver: (conflict: Conflict) => ConflictResolution
): { merged: SyncChange[]; conflicts: ResolvedConflict[] } {
  const conflicts = detectConflicts(localChanges, remoteChanges);
  const resolvedConflicts: ResolvedConflict[] = [];
  
  // Resolve all conflicts
  for (const conflict of conflicts) {
    const resolution = conflictResolver(conflict);
    resolvedConflicts.push(resolveConflict(conflict, resolution));
  }
  
  // Get entity IDs that had conflicts
  const conflictedIds = new Set(conflicts.map(c => c.entityId));
  
  // Filter out conflicted changes and add resolved ones
  const nonConflictedLocal = localChanges.filter(c => !conflictedIds.has(c.entityId));
  const nonConflictedRemote = remoteChanges.filter(c => !conflictedIds.has(c.entityId));
  const resolvedChanges = resolvedConflicts.map(r => r.resultingChange);
  
  // Combine and order all changes
  const allChanges = [...nonConflictedLocal, ...nonConflictedRemote, ...resolvedChanges];
  const merged = orderChangesByCausality(allChanges);
  
  return { merged, conflicts: resolvedConflicts };
}
