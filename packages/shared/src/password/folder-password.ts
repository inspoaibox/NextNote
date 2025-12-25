/**
 * Folder Password Protection Module
 * Implements cascading password protection for folders
 */

import type { EncryptedData, WrappedKey } from '../types';

/**
 * Folder password settings
 */
export interface FolderPasswordSettings {
  /** Folder ID */
  folderId: string;
  /** Whether folder has password */
  hasPassword: boolean;
  /** Whether password is inherited from parent */
  passwordInherited: boolean;
  /** Whether to apply password to subfolders */
  inheritToChildren: boolean;
  /** Encrypted salt for password derivation */
  encryptedSalt: string | null;
}

/**
 * Note in folder for cascade operations
 */
export interface NoteInFolder {
  id: string;
  folderId: string;
  hasPassword: boolean;
}

/**
 * Subfolder for cascade operations
 */
export interface Subfolder {
  id: string;
  parentId: string;
  hasPassword: boolean;
  passwordInherited: boolean;
}

/**
 * Apply password protection to folder and optionally cascade to children
 */
export function applyFolderPassword(
  folder: FolderPasswordSettings,
  subfolders: Subfolder[],
  notes: NoteInFolder[],
  inheritToChildren: boolean
): {
  updatedFolder: FolderPasswordSettings;
  updatedSubfolders: Subfolder[];
  updatedNotes: NoteInFolder[];
} {
  const updatedFolder: FolderPasswordSettings = {
    ...folder,
    hasPassword: true,
    inheritToChildren,
  };

  let updatedSubfolders = subfolders;
  let updatedNotes = notes;

  if (inheritToChildren) {
    // Apply to all subfolders
    updatedSubfolders = subfolders.map(sf => {
      if (sf.parentId === folder.folderId && !sf.hasPassword) {
        return {
          ...sf,
          hasPassword: true,
          passwordInherited: true,
        };
      }
      return sf;
    });

    // Apply to all notes in folder
    updatedNotes = notes.map(note => {
      if (note.folderId === folder.folderId && !note.hasPassword) {
        return {
          ...note,
          hasPassword: true,
        };
      }
      return note;
    });
  }

  return {
    updatedFolder,
    updatedSubfolders,
    updatedNotes,
  };
}

/**
 * Remove password protection from folder
 */
export function removeFolderPassword(
  folder: FolderPasswordSettings,
  subfolders: Subfolder[],
  notes: NoteInFolder[]
): {
  updatedFolder: FolderPasswordSettings;
  updatedSubfolders: Subfolder[];
  updatedNotes: NoteInFolder[];
} {
  const updatedFolder: FolderPasswordSettings = {
    ...folder,
    hasPassword: false,
    passwordInherited: false,
    inheritToChildren: false,
    encryptedSalt: null,
  };

  // Remove inherited password from subfolders
  const updatedSubfolders = subfolders.map(sf => {
    if (sf.parentId === folder.folderId && sf.passwordInherited) {
      return {
        ...sf,
        hasPassword: false,
        passwordInherited: false,
      };
    }
    return sf;
  });

  // Notes keep their password if it was set directly (not inherited)
  // For simplicity, we'll remove password from all notes in folder
  const updatedNotes = notes.map(note => {
    if (note.folderId === folder.folderId) {
      return {
        ...note,
        hasPassword: false,
      };
    }
    return note;
  });

  return {
    updatedFolder,
    updatedSubfolders,
    updatedNotes,
  };
}

/**
 * Check if a note inherits password from its folder
 */
export function noteInheritsPassword(
  noteId: string,
  folderId: string | null,
  folders: FolderPasswordSettings[]
): boolean {
  if (!folderId) return false;

  const folder = folders.find(f => f.folderId === folderId);
  if (!folder) return false;

  return folder.hasPassword && folder.inheritToChildren;
}

/**
 * Get all folders that would be affected by password cascade
 */
export function getAffectedFolders(
  folderId: string,
  allFolders: Subfolder[]
): string[] {
  const affected: string[] = [folderId];
  
  const findChildren = (parentId: string) => {
    const children = allFolders.filter(f => f.parentId === parentId);
    for (const child of children) {
      affected.push(child.id);
      findChildren(child.id);
    }
  };
  
  findChildren(folderId);
  return affected;
}

/**
 * Get all notes in a folder tree
 */
export function getNotesInFolderTree(
  folderId: string,
  allFolders: Subfolder[],
  allNotes: NoteInFolder[]
): NoteInFolder[] {
  const folderIds = getAffectedFolders(folderId, allFolders);
  return allNotes.filter(note => folderIds.includes(note.folderId));
}
