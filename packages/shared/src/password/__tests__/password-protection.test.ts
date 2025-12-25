/**
 * Password Protection Property Tests
 * Tests for Phase 9: Password Protection
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  PasswordProtectionState,
  PASSWORD_LOCKOUT_CONFIG,
  isPasswordAttemptAllowed,
  recordFailedAttempt,
  resetFailedAttempts,
  getLockoutStatus,
} from '../note-password';
import {
  FolderPasswordSettings,
  Subfolder,
  NoteInFolder,
  applyFolderPassword,
  removeFolderPassword,
  getAffectedFolders,
} from '../folder-password';

describe('Password Protection Property Tests', () => {
  /**
   * **Feature: secure-notebook, Property 40: Folder Password Cascade**
   * For any folder with password protection, all notes within the folder 
   * should have the same password protection applied.
   * **Validates: Requirements 16.2**
   */
  describe('Property 40: Folder Password Cascade', () => {
    const noteArb: fc.Arbitrary<NoteInFolder> = fc.record({
      id: fc.uuid(),
      folderId: fc.uuid(),
      hasPassword: fc.constant(false),
    });

    it('applying folder password cascades to all notes when inheritToChildren is true', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          fc.array(noteArb, { minLength: 1, maxLength: 10 }),
          (folderId, notes) => {
            // Set all notes to be in the folder
            const notesInFolder = notes.map(n => ({ ...n, folderId }));
            
            const folder: FolderPasswordSettings = {
              folderId,
              hasPassword: false,
              passwordInherited: false,
              inheritToChildren: false,
              encryptedSalt: null,
            };
            
            const { updatedNotes } = applyFolderPassword(
              folder,
              [],
              notesInFolder,
              true // inheritToChildren
            );
            
            // All notes in folder should have password
            return updatedNotes
              .filter(n => n.folderId === folderId)
              .every(n => n.hasPassword);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('folder password does not cascade when inheritToChildren is false', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          fc.array(noteArb, { minLength: 1, maxLength: 10 }),
          (folderId, notes) => {
            const notesInFolder = notes.map(n => ({ ...n, folderId, hasPassword: false }));
            
            const folder: FolderPasswordSettings = {
              folderId,
              hasPassword: false,
              passwordInherited: false,
              inheritToChildren: false,
              encryptedSalt: null,
            };
            
            const { updatedNotes } = applyFolderPassword(
              folder,
              [],
              notesInFolder,
              false // inheritToChildren
            );
            
            // Notes should not have password
            return updatedNotes
              .filter(n => n.folderId === folderId)
              .every(n => !n.hasPassword);
          }
        ),
        { numRuns: 100 }
      );
    });
  });


  /**
   * **Feature: secure-notebook, Property 42: Password Lockout**
   * For any password-protected note, after 5 consecutive failed password attempts,
   * access should be locked for 5 minutes.
   * **Validates: Requirements 16.6**
   */
  describe('Property 42: Password Lockout', () => {
    const initialState: PasswordProtectionState = {
      hasPassword: true,
      encryptedSalt: 'encrypted-salt',
      failedAttempts: 0,
      lockoutUntil: null,
    };

    it('lockout occurs after 5 failed attempts', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 5, max: 20 }),
          (numAttempts) => {
            let state = { ...initialState };
            
            for (let i = 0; i < numAttempts; i++) {
              state = recordFailedAttempt(state);
            }
            
            // Should be locked after 5 attempts
            return state.lockoutUntil !== null;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('no lockout before 5 failed attempts', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 4 }),
          (numAttempts) => {
            let state = { ...initialState };
            
            for (let i = 0; i < numAttempts; i++) {
              state = recordFailedAttempt(state);
            }
            
            // Should not be locked before 5 attempts
            return state.lockoutUntil === null;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('lockout duration is 5 minutes', () => {
      let state = { ...initialState };
      
      // Record 5 failed attempts
      for (let i = 0; i < 5; i++) {
        state = recordFailedAttempt(state);
      }
      
      const status = getLockoutStatus(state);
      
      // Lockout should be approximately 5 minutes
      expect(status.isLocked).toBe(true);
      expect(status.remainingMs).toBeLessThanOrEqual(PASSWORD_LOCKOUT_CONFIG.lockoutDurationMs);
      expect(status.remainingMs).toBeGreaterThan(PASSWORD_LOCKOUT_CONFIG.lockoutDurationMs - 1000);
    });

    it('successful password resets failed attempts', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 4 }),
          (numAttempts) => {
            let state = { ...initialState };
            
            // Record some failed attempts
            for (let i = 0; i < numAttempts; i++) {
              state = recordFailedAttempt(state);
            }
            
            // Reset after successful password
            state = resetFailedAttempts(state);
            
            return state.failedAttempts === 0 && state.lockoutUntil === null;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('attempt not allowed during lockout', () => {
      let state = { ...initialState };
      
      // Record 5 failed attempts to trigger lockout
      for (let i = 0; i < 5; i++) {
        state = recordFailedAttempt(state);
      }
      
      // Attempt should not be allowed
      expect(isPasswordAttemptAllowed(state)).toBe(false);
    });

    it('attempt allowed after lockout expires', () => {
      let state: PasswordProtectionState = {
        ...initialState,
        failedAttempts: 5,
        lockoutUntil: Date.now() - 1000, // Expired 1 second ago
      };
      
      // Attempt should be allowed
      expect(isPasswordAttemptAllowed(state)).toBe(true);
    });
  });

  /**
   * **Feature: secure-notebook, Property 43: Folder Password Inheritance Option**
   * For any folder with password set, the user should be able to choose 
   * whether subfolders inherit the password.
   * **Validates: Requirements 16.7**
   */
  describe('Property 43: Folder Password Inheritance Option', () => {
    const subfolderArb: fc.Arbitrary<Subfolder> = fc.record({
      id: fc.uuid(),
      parentId: fc.uuid(),
      hasPassword: fc.constant(false),
      passwordInherited: fc.constant(false),
    });

    it('subfolders inherit password when option is true', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          fc.array(subfolderArb, { minLength: 1, maxLength: 5 }),
          (folderId, subfolders) => {
            // Set all subfolders to have this folder as parent
            const childFolders = subfolders.map(sf => ({ ...sf, parentId: folderId }));
            
            const folder: FolderPasswordSettings = {
              folderId,
              hasPassword: false,
              passwordInherited: false,
              inheritToChildren: false,
              encryptedSalt: null,
            };
            
            const { updatedSubfolders } = applyFolderPassword(
              folder,
              childFolders,
              [],
              true // inheritToChildren
            );
            
            // All child subfolders should have inherited password
            return updatedSubfolders
              .filter(sf => sf.parentId === folderId)
              .every(sf => sf.hasPassword && sf.passwordInherited);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('subfolders do not inherit password when option is false', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          fc.array(subfolderArb, { minLength: 1, maxLength: 5 }),
          (folderId, subfolders) => {
            const childFolders = subfolders.map(sf => ({ 
              ...sf, 
              parentId: folderId,
              hasPassword: false,
              passwordInherited: false,
            }));
            
            const folder: FolderPasswordSettings = {
              folderId,
              hasPassword: false,
              passwordInherited: false,
              inheritToChildren: false,
              encryptedSalt: null,
            };
            
            const { updatedSubfolders } = applyFolderPassword(
              folder,
              childFolders,
              [],
              false // inheritToChildren
            );
            
            // Child subfolders should not have password
            return updatedSubfolders
              .filter(sf => sf.parentId === folderId)
              .every(sf => !sf.hasPassword);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: secure-notebook, Property 41: Password Removal Re-encryption**
   * For any note with password removed, the content should be re-encrypted 
   * using only the Master Key.
   * **Validates: Requirements 16.5**
   */
  describe('Property 41: Password Removal Re-encryption', () => {
    it('removing folder password removes inherited password from subfolders', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          fc.array(fc.uuid(), { minLength: 1, maxLength: 5 }),
          (folderId, subfolderIds) => {
            const subfolders: Subfolder[] = subfolderIds.map(id => ({
              id,
              parentId: folderId,
              hasPassword: true,
              passwordInherited: true,
            }));
            
            const folder: FolderPasswordSettings = {
              folderId,
              hasPassword: true,
              passwordInherited: false,
              inheritToChildren: true,
              encryptedSalt: 'encrypted-salt',
            };
            
            const { updatedSubfolders } = removeFolderPassword(folder, subfolders, []);
            
            // All inherited passwords should be removed
            return updatedSubfolders
              .filter(sf => sf.parentId === folderId)
              .every(sf => !sf.hasPassword && !sf.passwordInherited);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Folder Tree Operations', () => {
    it('getAffectedFolders returns all descendants', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          fc.array(fc.uuid(), { minLength: 1, maxLength: 5 }),
          fc.array(fc.uuid(), { minLength: 0, maxLength: 3 }),
          (rootId, childIds, grandchildIds) => {
            // Create folder hierarchy
            const children: Subfolder[] = childIds.map(id => ({
              id,
              parentId: rootId,
              hasPassword: false,
              passwordInherited: false,
            }));
            
            const grandchildren: Subfolder[] = grandchildIds.map((id, i) => ({
              id,
              parentId: childIds[i % childIds.length],
              hasPassword: false,
              passwordInherited: false,
            }));
            
            const allFolders = [...children, ...grandchildren];
            const affected = getAffectedFolders(rootId, allFolders);
            
            // Should include root and all descendants
            const expectedIds = new Set([rootId, ...childIds, ...grandchildIds]);
            const affectedSet = new Set(affected);
            
            // All expected IDs should be in affected
            for (const id of expectedIds) {
              if (!affectedSet.has(id)) return false;
            }
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
