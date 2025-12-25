/**
 * WebDAV Client Module
 * Handles WebDAV backup operations
 */

import type { EncryptedData, WebDAVConfig, BackupInfo } from '../types';

/**
 * WebDAV credentials (plaintext)
 */
export interface WebDAVCredentials {
  url: string;
  username: string;
  password: string;
}

/**
 * Encrypted WebDAV credentials
 */
export interface EncryptedWebDAVCredentials {
  url: string;
  username: string;
  encryptedPassword: string;
  iv: string;
  tag: string;
}

/**
 * WebDAV connection result
 */
export interface WebDAVConnectionResult {
  success: boolean;
  error?: string;
}

/**
 * Simple XOR-based encryption for credentials (device key)
 * In production, use proper AES-GCM encryption
 */
function xorEncrypt(text: string, key: string): { encrypted: string; iv: string } {
  // Generate random IV
  const iv = Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  
  // Combine key with IV for encryption
  const fullKey = key + iv;
  const result: number[] = [];
  
  for (let i = 0; i < text.length; i++) {
    const charCode = text.charCodeAt(i);
    const keyChar = fullKey.charCodeAt(i % fullKey.length);
    result.push(charCode ^ keyChar);
  }
  
  return {
    encrypted: btoa(String.fromCharCode(...result)),
    iv,
  };
}

/**
 * Simple XOR-based decryption for credentials
 */
function xorDecrypt(encrypted: string, key: string, iv: string): string {
  const fullKey = key + iv;
  const bytes = atob(encrypted).split('').map(c => c.charCodeAt(0));
  const result: string[] = [];
  
  for (let i = 0; i < bytes.length; i++) {
    const keyChar = fullKey.charCodeAt(i % fullKey.length);
    result.push(String.fromCharCode(bytes[i] ^ keyChar));
  }
  
  return result.join('');
}

/**
 * Encrypt WebDAV credentials with device key
 * Property 13: WebDAV Credentials Security
 */
export function encryptCredentials(
  credentials: WebDAVCredentials,
  deviceKey: string
): EncryptedWebDAVCredentials {
  const { encrypted, iv } = xorEncrypt(credentials.password, deviceKey);
  
  // Generate authentication tag (HMAC-like) including device key
  const tagData = `${deviceKey}:${credentials.url}:${credentials.username}:${encrypted}:${iv}`;
  let tag = 0;
  for (let i = 0; i < tagData.length; i++) {
    tag = ((tag << 5) - tag + tagData.charCodeAt(i)) | 0;
  }
  
  return {
    url: credentials.url,
    username: credentials.username,
    encryptedPassword: encrypted,
    iv,
    tag: Math.abs(tag).toString(16).padStart(8, '0'),
  };
}

/**
 * Decrypt WebDAV credentials with device key
 */
export function decryptCredentials(
  encrypted: EncryptedWebDAVCredentials,
  deviceKey: string
): WebDAVCredentials {
  // Verify tag (includes device key for authentication)
  const tagData = `${deviceKey}:${encrypted.url}:${encrypted.username}:${encrypted.encryptedPassword}:${encrypted.iv}`;
  let expectedTag = 0;
  for (let i = 0; i < tagData.length; i++) {
    expectedTag = ((expectedTag << 5) - expectedTag + tagData.charCodeAt(i)) | 0;
  }
  const expectedTagStr = Math.abs(expectedTag).toString(16).padStart(8, '0');
  
  if (encrypted.tag !== expectedTagStr) {
    throw new Error('Invalid credentials: authentication failed');
  }
  
  const password = xorDecrypt(encrypted.encryptedPassword, deviceKey, encrypted.iv);
  
  return {
    url: encrypted.url,
    username: encrypted.username,
    password,
  };
}

/**
 * Check if credentials are encrypted
 */
export function isCredentialsEncrypted(
  credentials: EncryptedWebDAVCredentials | WebDAVCredentials
): credentials is EncryptedWebDAVCredentials {
  return 'encryptedPassword' in credentials && 'iv' in credentials && 'tag' in credentials;
}

/**
 * WebDAV client interface
 */
export interface IWebDAVClient {
  connect(config: WebDAVConfig): Promise<WebDAVConnectionResult>;
  disconnect(): void;
  upload(path: string, data: ArrayBuffer): Promise<boolean>;
  download(path: string): Promise<ArrayBuffer | null>;
  list(path: string): Promise<string[]>;
  delete(path: string): Promise<boolean>;
  exists(path: string): Promise<boolean>;
}

/**
 * Create WebDAV client
 * Note: This is a simplified implementation. In production, use a proper WebDAV library.
 */
export function createWebDAVClient(): IWebDAVClient {
  let config: WebDAVConfig | null = null;
  let connected = false;

  const getAuthHeader = (): string => {
    if (!config) throw new Error('Not connected');
    // In real implementation, password would be decrypted here
    const credentials = btoa(`${config.username}:${config.encryptedPassword}`);
    return `Basic ${credentials}`;
  };

  const buildUrl = (path: string): string => {
    if (!config) throw new Error('Not connected');
    const baseUrl = config.url.endsWith('/') ? config.url.slice(0, -1) : config.url;
    const basePath = config.path.startsWith('/') ? config.path : `/${config.path}`;
    const fullPath = path.startsWith('/') ? path : `/${path}`;
    return `${baseUrl}${basePath}${fullPath}`;
  };

  return {
    async connect(cfg: WebDAVConfig): Promise<WebDAVConnectionResult> {
      try {
        config = cfg;
        
        // Test connection with OPTIONS request
        const response = await fetch(buildUrl('/'), {
          method: 'OPTIONS',
          headers: {
            'Authorization': getAuthHeader(),
          },
        });

        if (response.ok) {
          connected = true;
          return { success: true };
        }

        return { 
          success: false, 
          error: `Connection failed: ${response.status} ${response.statusText}` 
        };
      } catch (error) {
        return { 
          success: false, 
          error: error instanceof Error ? error.message : 'Unknown error' 
        };
      }
    },

    disconnect(): void {
      config = null;
      connected = false;
    },

    async upload(path: string, data: ArrayBuffer): Promise<boolean> {
      if (!connected) throw new Error('Not connected');

      try {
        const response = await fetch(buildUrl(path), {
          method: 'PUT',
          headers: {
            'Authorization': getAuthHeader(),
            'Content-Type': 'application/octet-stream',
          },
          body: data,
        });

        return response.ok || response.status === 201;
      } catch {
        return false;
      }
    },

    async download(path: string): Promise<ArrayBuffer | null> {
      if (!connected) throw new Error('Not connected');

      try {
        const response = await fetch(buildUrl(path), {
          method: 'GET',
          headers: {
            'Authorization': getAuthHeader(),
          },
        });

        if (!response.ok) return null;
        return response.arrayBuffer();
      } catch {
        return null;
      }
    },

    async list(path: string): Promise<string[]> {
      if (!connected) throw new Error('Not connected');

      try {
        const response = await fetch(buildUrl(path), {
          method: 'PROPFIND',
          headers: {
            'Authorization': getAuthHeader(),
            'Depth': '1',
            'Content-Type': 'application/xml',
          },
          body: `<?xml version="1.0"?>
            <d:propfind xmlns:d="DAV:">
              <d:prop><d:displayname/></d:prop>
            </d:propfind>`,
        });

        if (!response.ok) return [];
        
        // Parse XML response (simplified)
        const text = await response.text();
        const matches = text.match(/<d:displayname>([^<]+)<\/d:displayname>/g) || [];
        return matches.map(m => m.replace(/<\/?d:displayname>/g, ''));
      } catch {
        return [];
      }
    },

    async delete(path: string): Promise<boolean> {
      if (!connected) throw new Error('Not connected');

      try {
        const response = await fetch(buildUrl(path), {
          method: 'DELETE',
          headers: {
            'Authorization': getAuthHeader(),
          },
        });

        return response.ok || response.status === 204;
      } catch {
        return false;
      }
    },

    async exists(path: string): Promise<boolean> {
      if (!connected) throw new Error('Not connected');

      try {
        const response = await fetch(buildUrl(path), {
          method: 'HEAD',
          headers: {
            'Authorization': getAuthHeader(),
          },
        });

        return response.ok;
      } catch {
        return false;
      }
    },
  };
}
