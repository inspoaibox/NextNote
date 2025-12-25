/**
 * Note Password Protection Module
 * Implements dual encryption for password-protected notes
 */

import type { EncryptedData, WrappedKey } from '../types';
import { deriveKeyFromPassword, generateSalt, deriveKEK } from '../crypto/key-derivation';
import { encrypt, decrypt, generateDEK } from '../crypto/encryption';
import { wrapDEK, unwrapDEK } from '../crypto/key-wrapping';

/**
 * Password protection state
 */
export interface PasswordProtectionState {
  /** Whether the note/folder has password protection */
  hasPassword: boolean;
  /** Salt for password derivation (encrypted) */
  encryptedSalt: string | null;
  /** Number of failed attempts */
  failedAttempts: number;
  /** Lockout end time (null if not locked) */
  lockoutUntil: number | null;
}

/**
 * Password lockout configuration
 */
export const PASSWORD_LOCKOUT_CONFIG = {
  maxAttempts: 5,
  lockoutDurationMs: 5 * 60 * 1000, // 5 minutes
};

/**
 * Create password protection for a note
 * Returns the encrypted content with dual encryption
 */
export async function setNotePassword(
  content: string,
  masterKey: CryptoKey,
  notePassword: string
): Promise<{
  encryptedContent: EncryptedData;
  encryptedDEK: WrappedKey;
  encryptedSalt: string;
}> {
  // Generate salt for password derivation
  const salt = generateSalt();
  
  // Derive key from note password and then derive KEK for wrapping
  const passwordDerivedKey = await deriveKeyFromPassword(notePassword, salt);
  const passwordKEK = await deriveKEK(passwordDerivedKey, 'note-password-kek');
  
  // Generate new DEK for the note
  const dek = await generateDEK();
  
  // Encrypt content with DEK
  const encryptedContent = await encrypt(content, dek);
  
  // Wrap DEK with password-derived KEK
  const innerWrappedDEK = await wrapDEK(dek, passwordKEK);
  
  // Encrypt the salt with master key for storage
  const saltBase64 = btoa(String.fromCharCode(...salt));
  const encryptedSaltData = await encrypt(saltBase64, masterKey);
  
  return {
    encryptedContent,
    encryptedDEK: innerWrappedDEK, // Password-wrapped DEK
    encryptedSalt: JSON.stringify(encryptedSaltData),
  };
}

/**
 * Decrypt a password-protected note
 */
export async function decryptPasswordProtectedNote(
  encryptedContent: EncryptedData,
  encryptedDEK: WrappedKey,
  encryptedSalt: string,
  masterKey: CryptoKey,
  notePassword: string
): Promise<string> {
  // Decrypt the salt
  const encryptedSaltData = JSON.parse(encryptedSalt) as EncryptedData;
  const saltBase64 = await decrypt(encryptedSaltData, masterKey);
  const salt = new Uint8Array(atob(saltBase64).split('').map(c => c.charCodeAt(0)));
  
  // Derive key from password and then derive KEK for unwrapping
  const passwordDerivedKey = await deriveKeyFromPassword(notePassword, salt);
  const passwordKEK = await deriveKEK(passwordDerivedKey, 'note-password-kek');
  
  // Unwrap DEK with password KEK
  const dek = await unwrapDEK(encryptedDEK, passwordKEK);
  
  // Decrypt content
  return decrypt(encryptedContent, dek);
}

/**
 * Remove password protection from a note
 * Re-encrypts with only the master KEK
 */
export async function removeNotePassword(
  encryptedContent: EncryptedData,
  encryptedDEK: WrappedKey,
  encryptedSalt: string,
  masterKey: CryptoKey,
  masterKEK: CryptoKey,
  notePassword: string
): Promise<{
  encryptedContent: EncryptedData;
  encryptedDEK: WrappedKey;
}> {
  // First decrypt the content
  const content = await decryptPasswordProtectedNote(
    encryptedContent,
    encryptedDEK,
    encryptedSalt,
    masterKey,
    notePassword
  );
  
  // Generate new DEK
  const newDEK = await generateDEK();
  
  // Re-encrypt with only master KEK
  const newEncryptedContent = await encrypt(content, newDEK);
  const newEncryptedDEK = await wrapDEK(newDEK, masterKEK);
  
  return {
    encryptedContent: newEncryptedContent,
    encryptedDEK: newEncryptedDEK,
  };
}

/**
 * Check if password attempt is allowed (not locked out)
 */
export function isPasswordAttemptAllowed(state: PasswordProtectionState): boolean {
  if (!state.lockoutUntil) return true;
  return Date.now() >= state.lockoutUntil;
}

/**
 * Record a failed password attempt
 */
export function recordFailedAttempt(
  state: PasswordProtectionState
): PasswordProtectionState {
  const newAttempts = state.failedAttempts + 1;
  
  if (newAttempts >= PASSWORD_LOCKOUT_CONFIG.maxAttempts) {
    return {
      ...state,
      failedAttempts: newAttempts,
      lockoutUntil: Date.now() + PASSWORD_LOCKOUT_CONFIG.lockoutDurationMs,
    };
  }
  
  return {
    ...state,
    failedAttempts: newAttempts,
  };
}

/**
 * Reset failed attempts after successful password entry
 */
export function resetFailedAttempts(
  state: PasswordProtectionState
): PasswordProtectionState {
  return {
    ...state,
    failedAttempts: 0,
    lockoutUntil: null,
  };
}

/**
 * Check lockout status
 */
export function getLockoutStatus(state: PasswordProtectionState): {
  isLocked: boolean;
  remainingMs: number;
  attemptsRemaining: number;
} {
  const now = Date.now();
  
  if (state.lockoutUntil && now < state.lockoutUntil) {
    return {
      isLocked: true,
      remainingMs: state.lockoutUntil - now,
      attemptsRemaining: 0,
    };
  }
  
  return {
    isLocked: false,
    remainingMs: 0,
    attemptsRemaining: PASSWORD_LOCKOUT_CONFIG.maxAttempts - state.failedAttempts,
  };
}

/**
 * Recovery data for password-protected note
 */
export interface NotePasswordRecoveryData {
  /** Encrypted content */
  encryptedContent: EncryptedData;
  /** DEK wrapped with recovery key */
  recoveryWrappedDEK: WrappedKey;
  /** Original encrypted salt */
  encryptedSalt: string;
}

/**
 * Create recovery data when setting note password
 * This allows recovery using account recovery key
 */
export async function createNotePasswordRecoveryData(
  content: string,
  recoveryKey: CryptoKey,
  notePassword: string
): Promise<{
  encryptedContent: EncryptedData;
  encryptedDEK: WrappedKey;
  encryptedSalt: string;
  recoveryWrappedDEK: WrappedKey;
}> {
  // Generate salt for password derivation
  const salt = generateSalt();
  
  // Derive key from note password and then derive KEK for wrapping
  const passwordDerivedKey = await deriveKeyFromPassword(notePassword, salt);
  const passwordKEK = await deriveKEK(passwordDerivedKey, 'note-password-kek');
  
  // Generate new DEK for the note
  const dek = await generateDEK();
  
  // Encrypt content with DEK
  const encryptedContent = await encrypt(content, dek);
  
  // Wrap DEK with password-derived KEK (for normal access)
  const encryptedDEK = await wrapDEK(dek, passwordKEK);
  
  // Also wrap DEK with recovery key (for recovery)
  const recoveryWrappedDEK = await wrapDEK(dek, recoveryKey);
  
  // Store salt as base64 (in real app, would be encrypted with master key)
  const saltBase64 = btoa(String.fromCharCode(...salt));
  
  return {
    encryptedContent,
    encryptedDEK,
    encryptedSalt: saltBase64,
    recoveryWrappedDEK,
  };
}

/**
 * Recover password-protected note using account recovery key
 * Property 44: Note Password Recovery
 */
export async function recoverNoteWithRecoveryKey(
  encryptedContent: EncryptedData,
  recoveryWrappedDEK: WrappedKey,
  recoveryKey: CryptoKey
): Promise<string> {
  // Unwrap DEK with recovery key
  const dek = await unwrapDEK(recoveryWrappedDEK, recoveryKey);
  
  // Decrypt content
  return decrypt(encryptedContent, dek);
}

/**
 * Reset note password using recovery key
 * Allows setting a new password without knowing the old one
 */
export async function resetNotePasswordWithRecovery(
  encryptedContent: EncryptedData,
  recoveryWrappedDEK: WrappedKey,
  recoveryKey: CryptoKey,
  newPassword: string
): Promise<{
  encryptedContent: EncryptedData;
  encryptedDEK: WrappedKey;
  encryptedSalt: string;
  recoveryWrappedDEK: WrappedKey;
}> {
  // First recover the content
  const content = await recoverNoteWithRecoveryKey(
    encryptedContent,
    recoveryWrappedDEK,
    recoveryKey
  );
  
  // Re-encrypt with new password
  return createNotePasswordRecoveryData(content, recoveryKey, newPassword);
}

/**
 * Remove note password using recovery key
 * Re-encrypts with only master KEK
 */
export async function removeNotePasswordWithRecovery(
  encryptedContent: EncryptedData,
  recoveryWrappedDEK: WrappedKey,
  recoveryKey: CryptoKey,
  masterKEK: CryptoKey
): Promise<{
  encryptedContent: EncryptedData;
  encryptedDEK: WrappedKey;
}> {
  // First recover the content
  const content = await recoverNoteWithRecoveryKey(
    encryptedContent,
    recoveryWrappedDEK,
    recoveryKey
  );
  
  // Generate new DEK
  const newDEK = await generateDEK();
  
  // Re-encrypt with only master KEK
  const newEncryptedContent = await encrypt(content, newDEK);
  const newEncryptedDEK = await wrapDEK(newDEK, masterKEK);
  
  return {
    encryptedContent: newEncryptedContent,
    encryptedDEK: newEncryptedDEK,
  };
}
