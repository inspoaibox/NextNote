/**
 * Vector Clock Property Tests
 * Tests for Phase 7: Sync Engine
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  createVectorClock,
  incrementClock,
  compareClocks,
  happenedBefore,
  areConcurrent,
  areEqual,
  mergeClocks,
  dominates,
} from '../vector-clock';
import type { VectorClock } from '../../types';

// Use UUID-like device IDs to avoid prototype pollution issues
const deviceIdArb = fc.uuid();

// Generate vector clocks with UUID keys
const vectorClockArb: fc.Arbitrary<VectorClock> = fc.array(
  fc.tuple(fc.uuid(), fc.integer({ min: 1, max: 100 })),
  { minLength: 0, maxLength: 5 }
).map(entries => {
  const clock = Object.create(null) as VectorClock;
  for (const [key, value] of entries) {
    clock[key] = value;
  }
  return clock;
});

describe('Vector Clock Property Tests', () => {
  /**
   * **Feature: secure-notebook, Property 9: Vector Clock Ordering**
   * For any set of sync changes, applying them in vector clock order should 
   * produce a consistent final state regardless of arrival order.
   * **Validates: Requirements 3.3**
   */
  describe('Property 9: Vector Clock Ordering', () => {
    it('incrementing clock increases the device timestamp', () => {
      fc.assert(
        fc.property(vectorClockArb, deviceIdArb, (clock, deviceId) => {
          const before = clock[deviceId] || 0;
          const after = incrementClock(clock, deviceId);
          
          return after[deviceId] === before + 1;
        }),
        { numRuns: 100 }
      );
    });

    it('happenedBefore is transitive', () => {
      fc.assert(
        fc.property(
          vectorClockArb,
          deviceIdArb,
          deviceIdArb,
          (baseClock, device1, device2) => {
            // Create a chain: a -> b -> c
            const a = baseClock;
            const b = incrementClock(a, device1);
            const c = incrementClock(b, device2);
            
            // If a < b and b < c, then a < c
            if (happenedBefore(a, b) && happenedBefore(b, c)) {
              return happenedBefore(a, c);
            }
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('happenedBefore is antisymmetric', () => {
      fc.assert(
        fc.property(vectorClockArb, vectorClockArb, (a, b) => {
          // If a < b, then NOT b < a
          if (happenedBefore(a, b)) {
            return !happenedBefore(b, a);
          }
          return true;
        }),
        { numRuns: 100 }
      );
    });

    it('equal clocks do not have happened-before relationship', () => {
      fc.assert(
        fc.property(vectorClockArb, (clock) => {
          return !happenedBefore(clock, clock);
        }),
        { numRuns: 100 }
      );
    });

    it('merged clock dominates both inputs', () => {
      fc.assert(
        fc.property(vectorClockArb, vectorClockArb, (a, b) => {
          const merged = mergeClocks(a, b);
          
          return dominates(merged, a) && dominates(merged, b);
        }),
        { numRuns: 100 }
      );
    });

    it('merge is commutative', () => {
      fc.assert(
        fc.property(vectorClockArb, vectorClockArb, (a, b) => {
          const ab = mergeClocks(a, b);
          const ba = mergeClocks(b, a);
          
          return areEqual(ab, ba);
        }),
        { numRuns: 100 }
      );
    });

    it('merge is associative', () => {
      fc.assert(
        fc.property(vectorClockArb, vectorClockArb, vectorClockArb, (a, b, c) => {
          const ab_c = mergeClocks(mergeClocks(a, b), c);
          const a_bc = mergeClocks(a, mergeClocks(b, c));
          
          return areEqual(ab_c, a_bc);
        }),
        { numRuns: 100 }
      );
    });

    it('merge is idempotent', () => {
      fc.assert(
        fc.property(vectorClockArb, (clock) => {
          const merged = mergeClocks(clock, clock);
          return areEqual(merged, clock);
        }),
        { numRuns: 100 }
      );
    });

    it('concurrent clocks are symmetric', () => {
      fc.assert(
        fc.property(vectorClockArb, vectorClockArb, (a, b) => {
          // If a || b, then b || a
          return areConcurrent(a, b) === areConcurrent(b, a);
        }),
        { numRuns: 100 }
      );
    });

    it('clocks are either ordered or concurrent', () => {
      fc.assert(
        fc.property(vectorClockArb, vectorClockArb, (a, b) => {
          const aBeforeB = happenedBefore(a, b);
          const bBeforeA = happenedBefore(b, a);
          const equal = areEqual(a, b);
          const concurrent = areConcurrent(a, b);
          
          // Exactly one of these should be true
          const conditions = [aBeforeB, bBeforeA, equal, concurrent];
          const trueCount = conditions.filter(Boolean).length;
          
          return trueCount === 1;
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Vector Clock Basic Operations', () => {
    it('new clock is empty', () => {
      const clock = createVectorClock();
      expect(Object.keys(clock)).toHaveLength(0);
    });

    it('increment creates entry for new device', () => {
      fc.assert(
        fc.property(deviceIdArb, (deviceId) => {
          const clock = createVectorClock();
          const incremented = incrementClock(clock, deviceId);
          
          return incremented[deviceId] === 1;
        }),
        { numRuns: 100 }
      );
    });

    it('compare returns 0 for equal clocks', () => {
      fc.assert(
        fc.property(vectorClockArb, (clock) => {
          return compareClocks(clock, clock) === 0;
        }),
        { numRuns: 100 }
      );
    });

    it('compare returns -1 when first clock happened before', () => {
      fc.assert(
        fc.property(deviceIdArb, (deviceId) => {
          const clock = createVectorClock();
          const later = incrementClock(clock, deviceId);
          return compareClocks(clock, later) === -1;
        }),
        { numRuns: 100 }
      );
    });

    it('compare returns 1 when first clock happened after', () => {
      fc.assert(
        fc.property(deviceIdArb, (deviceId) => {
          const clock = createVectorClock();
          const later = incrementClock(clock, deviceId);
          return compareClocks(later, clock) === 1;
        }),
        { numRuns: 100 }
      );
    });
  });
});
