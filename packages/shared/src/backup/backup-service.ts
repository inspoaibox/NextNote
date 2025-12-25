/**
 * Backup Service Module
 * Handles backup creation, verification, and restoration
 */

import type { BackupInfo, BackupMetadata, BackupBundle } from '../types';
import { computeSHA256 } from '../sync/integrity';

/**
 * Backup package structure
 */
export interface BackupPackage {
  version: number;
  metadata: BackupMetadata;
  data: string; // Base64 encoded encrypted data
  checksum: string;
  createdAt: number;
}

/**
 * Create backup metadata
 */
export function createBackupMetadata(
  userId: string,
  noteIds: string[],
  folderIds: string[],
  imageIds: string[]
): BackupMetadata {
  return {
    userId,
    noteIds,
    folderIds,
    imageIds,
    createdAt: Date.now(),
    version: '1.0',
    checksum: '', // Will be computed later
  };
}

/**
 * Create a backup package from encrypted data
 */
export async function createBackupPackage(
  encryptedData: ArrayBuffer,
  metadata: BackupMetadata
): Promise<BackupPackage> {
  const dataBase64 = arrayBufferToBase64(encryptedData);
  const checksum = await computeSHA256(dataBase64);
  
  return {
    version: 1,
    metadata,
    data: dataBase64,
    checksum,
    createdAt: Date.now(),
  };
}

/**
 * Verify backup package integrity
 */
export async function verifyBackupIntegrity(
  backup: BackupPackage
): Promise<{ valid: boolean; error?: string }> {
  try {
    // Verify checksum
    const computedChecksum = await computeSHA256(backup.data);
    
    if (computedChecksum !== backup.checksum) {
      return { valid: false, error: 'Checksum mismatch - backup may be corrupted' };
    }
    
    // Verify metadata completeness
    if (!backup.metadata) {
      return { valid: false, error: 'Missing metadata' };
    }
    
    if (!Array.isArray(backup.metadata.noteIds) ||
        !Array.isArray(backup.metadata.folderIds)) {
      return { valid: false, error: 'Invalid metadata format' };
    }
    
    return { valid: true };
  } catch (error) {
    return { 
      valid: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

/**
 * Extract data from backup package
 */
export function extractBackupData(backup: BackupPackage): ArrayBuffer {
  return base64ToArrayBuffer(backup.data);
}

/**
 * Serialize backup package for storage
 */
export function serializeBackup(backup: BackupPackage): ArrayBuffer {
  const json = JSON.stringify(backup);
  const encoder = new TextEncoder();
  return encoder.encode(json).buffer;
}

/**
 * Deserialize backup package from storage
 */
export function deserializeBackup(data: ArrayBuffer): BackupPackage | null {
  try {
    const decoder = new TextDecoder();
    const json = decoder.decode(data);
    return JSON.parse(json) as BackupPackage;
  } catch {
    return null;
  }
}

/**
 * Create backup info from package
 */
export function createBackupInfo(
  id: string,
  backup: BackupPackage,
  type: 'webdav' | 'cloud' = 'cloud'
): BackupInfo {
  return {
    id,
    timestamp: backup.createdAt,
    size: backup.data.length,
    checksum: backup.checksum,
    noteCount: backup.metadata.noteIds.length,
    folderCount: backup.metadata.folderIds.length,
    type,
  };
}

/**
 * Version retention - keep only the most recent N backups
 */
export function enforceVersionRetention(
  backups: BackupInfo[],
  maxVersions: number
): { keep: BackupInfo[]; remove: BackupInfo[] } {
  if (backups.length <= maxVersions) {
    return { keep: backups, remove: [] };
  }
  
  // Sort by timestamp descending (most recent first)
  const sorted = [...backups].sort((a, b) => b.timestamp - a.timestamp);
  
  return {
    keep: sorted.slice(0, maxVersions),
    remove: sorted.slice(maxVersions),
  };
}

// Utility functions
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}
