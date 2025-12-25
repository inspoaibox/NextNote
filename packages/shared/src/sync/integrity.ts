/**
 * Data Integrity Module
 * HMAC-SHA256 based integrity verification for sync data
 */

/**
 * Compute HMAC-SHA256 for data integrity verification
 */
export async function computeHMAC(
  data: string | ArrayBuffer,
  key: CryptoKey
): Promise<string> {
  const encoder = new TextEncoder();
  const dataBuffer = typeof data === 'string' ? encoder.encode(data) : data;
  
  const signature = await crypto.subtle.sign('HMAC', key, dataBuffer);
  
  return arrayBufferToBase64(signature);
}

/**
 * Verify HMAC-SHA256 signature
 */
export async function verifyHMAC(
  data: string | ArrayBuffer,
  signature: string,
  key: CryptoKey
): Promise<boolean> {
  const encoder = new TextEncoder();
  const dataBuffer = typeof data === 'string' ? encoder.encode(data) : data;
  const signatureBuffer = base64ToArrayBuffer(signature);
  
  return crypto.subtle.verify('HMAC', key, signatureBuffer, dataBuffer);
}

/**
 * Generate an HMAC key for integrity verification
 */
export async function generateHMACKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    {
      name: 'HMAC',
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify']
  );
}

/**
 * Export HMAC key to raw bytes
 */
export async function exportHMACKey(key: CryptoKey): Promise<ArrayBuffer> {
  return crypto.subtle.exportKey('raw', key);
}

/**
 * Import HMAC key from raw bytes
 */
export async function importHMACKey(keyData: ArrayBuffer): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    keyData,
    {
      name: 'HMAC',
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify']
  );
}

/**
 * Compute SHA-256 hash of data
 */
export async function computeSHA256(data: string | ArrayBuffer): Promise<string> {
  const encoder = new TextEncoder();
  const dataBuffer = typeof data === 'string' ? encoder.encode(data) : data;
  
  const hash = await crypto.subtle.digest('SHA-256', dataBuffer);
  
  return arrayBufferToBase64(hash);
}

/**
 * Verify SHA-256 hash
 */
export async function verifySHA256(
  data: string | ArrayBuffer,
  expectedHash: string
): Promise<boolean> {
  const computedHash = await computeSHA256(data);
  return computedHash === expectedHash;
}

/**
 * Create integrity envelope for sync data
 */
export interface IntegrityEnvelope {
  data: string;
  hmac: string;
  timestamp: number;
}

/**
 * Wrap data with integrity envelope
 */
export async function createIntegrityEnvelope(
  data: string,
  key: CryptoKey
): Promise<IntegrityEnvelope> {
  const timestamp = Date.now();
  const dataWithTimestamp = JSON.stringify({ data, timestamp });
  const hmac = await computeHMAC(dataWithTimestamp, key);
  
  return {
    data,
    hmac,
    timestamp,
  };
}

/**
 * Verify and unwrap integrity envelope
 */
export async function verifyIntegrityEnvelope(
  envelope: IntegrityEnvelope,
  key: CryptoKey
): Promise<{ valid: boolean; data: string | null }> {
  const dataWithTimestamp = JSON.stringify({
    data: envelope.data,
    timestamp: envelope.timestamp,
  });
  
  const valid = await verifyHMAC(dataWithTimestamp, envelope.hmac, key);
  
  return {
    valid,
    data: valid ? envelope.data : null,
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
