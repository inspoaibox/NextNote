/**
 * Vector Clock Implementation
 * Used for distributed synchronization and conflict detection
 */

import type { VectorClock } from '../types';

/**
 * Create a new empty vector clock
 */
export function createVectorClock(): VectorClock {
  return Object.create(null) as VectorClock;
}

/**
 * Increment the clock for a specific device
 */
export function incrementClock(clock: VectorClock, deviceId: string): VectorClock {
  const result = Object.create(null) as VectorClock;
  for (const key of Object.keys(clock)) {
    result[key] = clock[key];
  }
  result[deviceId] = (clock[deviceId] || 0) + 1;
  return result;
}

/**
 * Get the timestamp for a specific device
 */
export function getTimestamp(clock: VectorClock, deviceId: string): number {
  return clock[deviceId] || 0;
}

/**
 * Compare two vector clocks
 * Returns:
 *   -1 if a < b (a happened before b)
 *    0 if a || b (concurrent, neither happened before the other) or equal
 *    1 if a > b (a happened after b)
 */
export function compareClocks(a: VectorClock, b: VectorClock): -1 | 0 | 1 {
  if (happenedBefore(a, b)) return -1;
  if (happenedBefore(b, a)) return 1;
  return 0;
}

/**
 * Check if clock a happened before clock b
 */
export function happenedBefore(a: VectorClock, b: VectorClock): boolean {
  const allDevices = new Set([...Object.keys(a), ...Object.keys(b)]);
  
  let strictlyLess = false;
  
  for (const device of allDevices) {
    const aTime = a[device] || 0;
    const bTime = b[device] || 0;
    
    if (aTime > bTime) {
      return false; // a has a higher timestamp somewhere
    }
    if (aTime < bTime) {
      strictlyLess = true;
    }
  }
  
  return strictlyLess;
}

/**
 * Check if two clocks are concurrent (neither happened before the other)
 */
export function areConcurrent(a: VectorClock, b: VectorClock): boolean {
  return !happenedBefore(a, b) && !happenedBefore(b, a) && !areEqual(a, b);
}

/**
 * Check if two clocks are equal
 */
export function areEqual(a: VectorClock, b: VectorClock): boolean {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  
  // Check all keys in a
  for (const key of aKeys) {
    if ((a[key] || 0) !== (b[key] || 0)) {
      return false;
    }
  }
  
  // Check all keys in b
  for (const key of bKeys) {
    if ((a[key] || 0) !== (b[key] || 0)) {
      return false;
    }
  }
  
  return true;
}

/**
 * Merge two vector clocks (take maximum of each component)
 */
export function mergeClocks(a: VectorClock, b: VectorClock): VectorClock {
  const result = Object.create(null) as VectorClock;
  
  for (const key of Object.keys(a)) {
    result[key] = a[key];
  }
  
  for (const [device, time] of Object.entries(b)) {
    result[device] = Math.max(result[device] || 0, time);
  }
  
  return result;
}

/**
 * Clone a vector clock
 */
export function cloneClock(clock: VectorClock): VectorClock {
  const result = Object.create(null) as VectorClock;
  for (const key of Object.keys(clock)) {
    result[key] = clock[key];
  }
  return result;
}

/**
 * Check if a clock dominates another (a >= b for all components)
 */
export function dominates(a: VectorClock, b: VectorClock): boolean {
  for (const device of Object.keys(b)) {
    if ((a[device] || 0) < b[device]) {
      return false;
    }
  }
  return true;
}
