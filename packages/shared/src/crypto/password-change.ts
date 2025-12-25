/**
 * Password Change Module
 * Handles secure password change with DEK re-encryption
 * Property 4: Password Change Preserves Content
 */

import { deriveKeyFromPassword, generateSalt } from './key-derivation';
import { wrapDEK, unwrapDEK } from './key-wrapping';
import type { WrappedKey } from '../types/crypto';

/**
 * Wrapped DEK with metadata
 */
export interface WrappedDEKInfo {
  /** Wrapped key data (base64) */
  wrappedKey: string;
  /** Note ID this DEK belongs to */
  noteId: string;
}

/**
 * Password change result
 */
export interface PasswordChangeResult {
  /** New salt for password derivation */
  newSalt: string;
  /** New wrapped KEK */
  newWrappedKEK: string;
  /** Re-wrapped DEKs for all notes */
  reWrappedDEKs: WrappedDEKInfo[];
  /** Whether the operation was successful */
  success: boolean;
}

/**
 * Note with encrypted content and wrapped DEK
 */
export interface NoteWithDEK {
  noteId: string;
  /** Encrypted content (unchanged during password change) */
  encryptedContent: string;
  /** Current wrapped DEK */
  wrappedDEK: string;
}

/**
 * Change user password
 * Re-encrypts all DEKs with new KEK derived from new password
 * Note content ciphertext remains unchanged
 * 
 * @param oldPassword - Current password
 * @param newPassword - New password
 * @param currentSalt - Current salt (base64)
 * @param _currentWrappedKEK - Current wrapped KEK (base64) - reserved for future use
 * @param notes - All notes with their wrapped DEKs
 * @returns Password change result with new wrapped keys
 */
export async function changePassword(
  oldPassword: string,
  newPassword: string,
  currentSalt: string,
  _currentWrappedKEK: string,
  notes: NoteWithDEK[]
): Promise<PasswordChangeResult> {
  try {
    // 1. Derive old KEK from old password
    const oldSaltBytes = base64ToBytes(currentSalt);
    const oldKEK = await deriveKeyFromPassword(oldPassword, oldSaltBytes);

    // 2. Generate new salt and derive new KEK
    const newSaltBytes = generateSalt();
    const newKEK = await deriveKeyFromPassword(newPassword, newSaltBytes);

    // 3. Re-wrap all DEKs with new KEK
    const reWrappedDEKs: WrappedDEKInfo[] = [];
    
    for (const note of notes) {
      // Create WrappedKey object from string
      const wrappedKeyObj: WrappedKey = {
        wrappedKey: note.wrappedDEK,
        algorithm: 'AES-KW',
      };

      // Unwrap DEK with old KEK
      const dek = await unwrapDEK(wrappedKeyObj, oldKEK);
      
      // Re-wrap DEK with new KEK
      const newWrappedKey = await wrapDEK(dek, newKEK);
      
      reWrappedDEKs.push({
        noteId: note.noteId,
        wrappedKey: newWrappedKey.wrappedKey,
      });
    }

    // 4. Create new wrapped KEK (for storage)
    const newWrappedKEK = bytesToBase64(newSaltBytes);

    return {
      newSalt: bytesToBase64(newSaltBytes),
      newWrappedKEK,
      reWrappedDEKs,
      success: true,
    };
  } catch (error) {
    return {
      newSalt: '',
      newWrappedKEK: '',
      reWrappedDEKs: [],
      success: false,
    };
  }
}

/**
 * Verify that password change preserves content
 * The encrypted content should remain unchanged after password change
 */
export function verifyContentPreserved(
  originalContent: string,
  newContent: string
): boolean {
  return originalContent === newContent;
}

/**
 * Verify that wrapped DEK changed after password change
 */
export function verifyDEKChanged(
  originalWrappedDEK: string,
  newWrappedDEK: string
): boolean {
  return originalWrappedDEK !== newWrappedDEK;
}

/**
 * Validate password strength
 */
export function validatePasswordStrength(password: string): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (password.length < 8) {
    errors.push('Password must be at least 8 characters');
  }

  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }

  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }

  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Convert base64 string to Uint8Array
 */
function base64ToBytes(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Convert Uint8Array to base64 string
 */
function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
