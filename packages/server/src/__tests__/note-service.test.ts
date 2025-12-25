/**
 * Note Service Property Tests
 * Tests for Phase 5: Note Core Functionality
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as fc from 'fast-check';

/**
 * Note interface for testing
 */
interface TestNote {
  id: string;
  title: string;
  isPinned: boolean;
  pinnedAt: number | null;
  updatedAt: number;
  syncVersion: number;
}

/**
 * Note Version interface for testing
 */
interface TestNoteVersion {
  id: string;
  noteId: string;
  content: string;
  createdAt: number;
}

/**
 * Sort notes according to pin ordering rules:
 * 1. Pinned notes appear before unpinned notes
 * 2. Pinned notes are ordered by pinnedAt descending (most recently pinned first)
 * 3. Unpinned notes are ordered by updatedAt descending
 */
function sortNotesByPinOrder(notes: TestNote[]): TestNote[] {
  return [...notes].sort((a, b) => {
    // Pinned notes come first
    if (a.isPinned && !b.isPinned) return -1;
    if (!a.isPinned && b.isPinned) return 1;
    
    // Both pinned: sort by pinnedAt descending
    if (a.isPinned && b.isPinned) {
      return (b.pinnedAt || 0) - (a.pinnedAt || 0);
    }
    
    // Both unpinned: sort by updatedAt descending
    return b.updatedAt - a.updatedAt;
  });
}

/**
 * Simulate version creation on note save
 */
function createVersionOnSave(
  note: TestNote,
  content: string,
  versions: TestNoteVersion[]
): { note: TestNote; versions: TestNoteVersion[] } {
  const newVersion: TestNoteVersion = {
    id: `version-${Date.now()}-${Math.random()}`,
    noteId: note.id,
    content,
    createdAt: Date.now(),
  };
  
  const updatedNote: TestNote = {
    ...note,
    syncVersion: note.syncVersion + 1,
    updatedAt: Date.now(),
  };
  
  return {
    note: updatedNote,
    versions: [...versions, newVersion],
  };
}

/**
 * Enforce version retention limit (keep last N versions)
 */
function enforceVersionLimit(
  versions: TestNoteVersion[],
  limit: number
): TestNoteVersion[] {
  if (versions.length <= limit) return versions;
  
  // Sort by createdAt descending and keep only the most recent
  const sorted = [...versions].sort((a, b) => b.createdAt - a.createdAt);
  return sorted.slice(0, limit);
}

describe('Note Service Property Tests', () => {
  /**
   * **Feature: secure-notebook, Property 25: Pin Ordering**
   * For any list of notes where some are pinned, pinned notes should appear 
   * before unpinned notes, and pinned notes should be ordered by pin timestamp descending.
   * **Validates: Requirements 9.1, 9.2, 9.3**
   */
  describe('Property 25: Pin Ordering', () => {
    // Arbitrary for generating test notes
    const noteArb = fc.record({
      id: fc.uuid(),
      title: fc.string({ minLength: 1, maxLength: 100 }),
      isPinned: fc.boolean(),
      pinnedAt: fc.option(fc.integer({ min: 1000000000000, max: 2000000000000 }), { nil: null }),
      updatedAt: fc.integer({ min: 1000000000000, max: 2000000000000 }),
      syncVersion: fc.integer({ min: 1, max: 1000 }),
    }).map(note => ({
      ...note,
      // Ensure pinnedAt is set only when isPinned is true
      pinnedAt: note.isPinned ? (note.pinnedAt || Date.now()) : null,
    }));

    it('pinned notes always appear before unpinned notes', () => {
      fc.assert(
        fc.property(fc.array(noteArb, { minLength: 1, maxLength: 50 }), (notes) => {
          const sorted = sortNotesByPinOrder(notes);
          
          // Find the last pinned note index and first unpinned note index
          let lastPinnedIndex = -1;
          let firstUnpinnedIndex = sorted.length;
          
          sorted.forEach((note, index) => {
            if (note.isPinned) {
              lastPinnedIndex = index;
            } else if (firstUnpinnedIndex === sorted.length) {
              firstUnpinnedIndex = index;
            }
          });
          
          // All pinned notes should come before all unpinned notes
          return lastPinnedIndex < firstUnpinnedIndex || lastPinnedIndex === -1;
        }),
        { numRuns: 100 }
      );
    });

    it('pinned notes are ordered by pinnedAt descending', () => {
      fc.assert(
        fc.property(fc.array(noteArb, { minLength: 2, maxLength: 50 }), (notes) => {
          const sorted = sortNotesByPinOrder(notes);
          const pinnedNotes = sorted.filter(n => n.isPinned);
          
          // Check that pinned notes are in descending order by pinnedAt
          for (let i = 1; i < pinnedNotes.length; i++) {
            const prev = pinnedNotes[i - 1].pinnedAt || 0;
            const curr = pinnedNotes[i].pinnedAt || 0;
            if (prev < curr) return false;
          }
          
          return true;
        }),
        { numRuns: 100 }
      );
    });

    it('unpinned notes are ordered by updatedAt descending', () => {
      fc.assert(
        fc.property(fc.array(noteArb, { minLength: 2, maxLength: 50 }), (notes) => {
          const sorted = sortNotesByPinOrder(notes);
          const unpinnedNotes = sorted.filter(n => !n.isPinned);
          
          // Check that unpinned notes are in descending order by updatedAt
          for (let i = 1; i < unpinnedNotes.length; i++) {
            if (unpinnedNotes[i - 1].updatedAt < unpinnedNotes[i].updatedAt) {
              return false;
            }
          }
          
          return true;
        }),
        { numRuns: 100 }
      );
    });

    it('sorting preserves all notes (no notes lost or duplicated)', () => {
      fc.assert(
        fc.property(fc.array(noteArb, { minLength: 0, maxLength: 50 }), (notes) => {
          const sorted = sortNotesByPinOrder(notes);
          
          // Same length
          if (sorted.length !== notes.length) return false;
          
          // Same set of IDs
          const originalIds = new Set(notes.map(n => n.id));
          const sortedIds = new Set(sorted.map(n => n.id));
          
          if (originalIds.size !== sortedIds.size) return false;
          
          for (const id of originalIds) {
            if (!sortedIds.has(id)) return false;
          }
          
          return true;
        }),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: secure-notebook, Property 36: Version Snapshot Creation**
   * For any note save, a version snapshot should be created with timestamp.
   * **Validates: Requirements 15.1**
   */
  describe('Property 36: Version Snapshot Creation', () => {
    const noteArb = fc.record({
      id: fc.uuid(),
      title: fc.string({ minLength: 1, maxLength: 100 }),
      isPinned: fc.constant(false),
      pinnedAt: fc.constant(null),
      updatedAt: fc.integer({ min: 1000000000000, max: 2000000000000 }),
      syncVersion: fc.integer({ min: 1, max: 1000 }),
    });

    const contentArb = fc.string({ minLength: 0, maxLength: 10000 });

    it('saving a note creates a new version', () => {
      fc.assert(
        fc.property(noteArb, contentArb, (note, content) => {
          const initialVersions: TestNoteVersion[] = [];
          const { versions } = createVersionOnSave(note, content, initialVersions);
          
          return versions.length === 1;
        }),
        { numRuns: 100 }
      );
    });

    it('each save increments version count', () => {
      fc.assert(
        fc.property(
          noteArb,
          fc.array(contentArb, { minLength: 1, maxLength: 10 }),
          (note, contents) => {
            let currentNote = note;
            let versions: TestNoteVersion[] = [];
            
            for (const content of contents) {
              const result = createVersionOnSave(currentNote, content, versions);
              currentNote = result.note;
              versions = result.versions;
            }
            
            return versions.length === contents.length;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('version has correct noteId reference', () => {
      fc.assert(
        fc.property(noteArb, contentArb, (note, content) => {
          const { versions } = createVersionOnSave(note, content, []);
          
          return versions.every(v => v.noteId === note.id);
        }),
        { numRuns: 100 }
      );
    });

    it('version has timestamp', () => {
      fc.assert(
        fc.property(noteArb, contentArb, (note, content) => {
          const before = Date.now();
          const { versions } = createVersionOnSave(note, content, []);
          const after = Date.now();
          
          return versions.every(v => v.createdAt >= before && v.createdAt <= after);
        }),
        { numRuns: 100 }
      );
    });

    it('saving increments syncVersion by 1', () => {
      fc.assert(
        fc.property(noteArb, contentArb, (note, content) => {
          const originalVersion = note.syncVersion;
          const { note: updatedNote } = createVersionOnSave(note, content, []);
          
          return updatedNote.syncVersion === originalVersion + 1;
        }),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: secure-notebook, Property 37: Version Retention Limit**
   * For any note with more than 50 versions, only the last 50 versions should be retained.
   * **Validates: Requirements 15.2, 15.5**
   */
  describe('Property 37: Version Retention Limit', () => {
    const VERSION_LIMIT = 50;

    const versionArb = fc.record({
      id: fc.uuid(),
      noteId: fc.uuid(),
      content: fc.string({ minLength: 0, maxLength: 1000 }),
      createdAt: fc.integer({ min: 1000000000000, max: 2000000000000 }),
    });

    it('versions are limited to 50', () => {
      fc.assert(
        fc.property(
          fc.array(versionArb, { minLength: 0, maxLength: 100 }),
          (versions) => {
            const limited = enforceVersionLimit(versions, VERSION_LIMIT);
            return limited.length <= VERSION_LIMIT;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('most recent versions are kept', () => {
      fc.assert(
        fc.property(
          fc.array(versionArb, { minLength: 51, maxLength: 100 }),
          (versions) => {
            const limited = enforceVersionLimit(versions, VERSION_LIMIT);
            
            // Sort original by createdAt descending
            const sortedOriginal = [...versions].sort((a, b) => b.createdAt - a.createdAt);
            const expectedIds = new Set(sortedOriginal.slice(0, VERSION_LIMIT).map(v => v.id));
            
            // All limited versions should be in the expected set
            return limited.every(v => expectedIds.has(v.id));
          }
        ),
        { numRuns: 100 }
      );
    });

    it('versions under limit are not affected', () => {
      fc.assert(
        fc.property(
          fc.array(versionArb, { minLength: 0, maxLength: 49 }),
          (versions) => {
            const limited = enforceVersionLimit(versions, VERSION_LIMIT);
            
            // All original versions should be present
            const originalIds = new Set(versions.map(v => v.id));
            const limitedIds = new Set(limited.map(v => v.id));
            
            return originalIds.size === limitedIds.size &&
              [...originalIds].every(id => limitedIds.has(id));
          }
        ),
        { numRuns: 100 }
      );
    });

    it('exactly 50 versions when over limit', () => {
      fc.assert(
        fc.property(
          fc.array(versionArb, { minLength: 51, maxLength: 100 }),
          (versions) => {
            const limited = enforceVersionLimit(versions, VERSION_LIMIT);
            return limited.length === VERSION_LIMIT;
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
