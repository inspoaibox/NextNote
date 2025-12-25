/**
 * Share Service Module
 * Handles note sharing functionality
 */

import type { EncryptedData, WrappedKey } from '../types';

/**
 * Share permission levels
 */
export type SharePermission = 'view' | 'edit';

/**
 * Share record
 */
export interface ShareRecord {
  id: string;
  noteId: string;
  ownerId: string;
  recipientId: string | null;
  recipientEmail: string;
  encryptedShareKey: string;
  permission: SharePermission;
  createdAt: number;
  expiresAt: number | null;
  isRevoked: boolean;
}

/**
 * Note visibility
 */
export type NoteVisibility = 'private' | 'shared';

/**
 * Default visibility for new notes
 */
export const DEFAULT_NOTE_VISIBILITY: NoteVisibility = 'private';

/**
 * Generate a unique share key
 */
export function generateShareKey(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Create a share record
 */
export function createShareRecord(
  noteId: string,
  ownerId: string,
  recipientEmail: string,
  encryptedShareKey: string,
  permission: SharePermission,
  expiresAt: number | null = null
): ShareRecord {
  return {
    id: generateShareKey().slice(0, 16),
    noteId,
    ownerId,
    recipientId: null,
    recipientEmail,
    encryptedShareKey,
    permission,
    createdAt: Date.now(),
    expiresAt,
    isRevoked: false,
  };
}

/**
 * Check if share is valid (not expired, not revoked)
 */
export function isShareValid(share: ShareRecord): boolean {
  if (share.isRevoked) return false;
  if (share.expiresAt && Date.now() > share.expiresAt) return false;
  return true;
}

/**
 * Check if user has permission for action
 */
export function hasPermission(
  share: ShareRecord,
  action: 'view' | 'edit'
): boolean {
  if (!isShareValid(share)) return false;
  
  if (action === 'view') {
    return share.permission === 'view' || share.permission === 'edit';
  }
  
  return share.permission === 'edit';
}

/**
 * Revoke a share
 */
export function revokeShare(share: ShareRecord): ShareRecord {
  return {
    ...share,
    isRevoked: true,
  };
}

/**
 * Check if note is shared
 */
export function isNoteShared(shares: ShareRecord[], noteId: string): boolean {
  return shares.some(s => s.noteId === noteId && isShareValid(s));
}

/**
 * Get active shares for a note
 */
export function getActiveShares(shares: ShareRecord[], noteId: string): ShareRecord[] {
  return shares.filter(s => s.noteId === noteId && isShareValid(s));
}

/**
 * Get shares by recipient
 */
export function getSharesByRecipient(
  shares: ShareRecord[],
  recipientEmail: string
): ShareRecord[] {
  return shares.filter(s => s.recipientEmail === recipientEmail && isShareValid(s));
}
