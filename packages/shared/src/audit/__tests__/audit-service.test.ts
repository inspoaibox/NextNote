/**
 * Audit Service Tests
 * Property 27: Audit Log Creation
 * Property 28: Audit Log Encryption
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  createAuditLogEntry,
  isValidAuditLogEntry,
  isIpAddressEncrypted,
  filterLogsByAction,
  filterLogsByDateRange,
  getRecentLogs,
  getLoginHistory,
  getSecurityEvents,
  countFailedLogins,
  shouldLockAccount,
  generateAuditLogId,
  type AuditLogEntry,
  type AuditAction,
} from '../audit-service';

describe('Audit Service', () => {
  /**
   * **Feature: secure-notebook, Property 27: Audit Log Creation**
   * For any login event, an audit log entry should be created with device info, IP address, and timestamp.
   */
  describe('Property 27: Audit Log Creation', () => {
    it('should create audit log entry with all required fields', () => {
      fc.assert(
        fc.property(
          fc.record({
            userId: fc.string({ minLength: 1, maxLength: 50 }),
            action: fc.constantFrom<AuditAction>(
              'login', 'logout', 'login_failed', 'password_change'
            ),
            deviceId: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
            ipAddress: fc.string({ minLength: 1, maxLength: 50 }),
            userAgent: fc.string({ minLength: 0, maxLength: 200 }),
          }),
          (params) => {
            const encryptedIp = `encrypted_${params.ipAddress}_${Date.now()}`;
            const entry = createAuditLogEntry(params, encryptedIp);

            // Verify all required fields are present
            expect(entry.id).toBeDefined();
            expect(entry.id.startsWith('audit_')).toBe(true);
            expect(entry.userId).toBe(params.userId);
            expect(entry.action).toBe(params.action);
            expect(entry.encryptedIpAddress).toBe(encryptedIp);
            expect(entry.userAgent).toBe(params.userAgent);
            expect(entry.createdAt).toBeGreaterThan(0);
            expect(typeof entry.createdAt).toBe('number');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should create unique IDs for each audit log entry', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 1000; i++) {
        ids.add(generateAuditLogId());
      }
      expect(ids.size).toBe(1000);
    });

    it('should record device ID when provided', () => {
      const entry = createAuditLogEntry(
        {
          userId: 'user123',
          action: 'login',
          deviceId: 'device456',
          ipAddress: '192.168.1.1',
          userAgent: 'Mozilla/5.0',
        },
        'encrypted_ip'
      );
      expect(entry.deviceId).toBe('device456');
    });

    it('should set deviceId to null when not provided', () => {
      const entry = createAuditLogEntry(
        {
          userId: 'user123',
          action: 'login',
          ipAddress: '192.168.1.1',
          userAgent: 'Mozilla/5.0',
        },
        'encrypted_ip'
      );
      expect(entry.deviceId).toBeNull();
    });

    it('should record metadata when provided', () => {
      const metadata = { browser: 'Chrome', os: 'Windows' };
      const entry = createAuditLogEntry(
        {
          userId: 'user123',
          action: 'login',
          ipAddress: '192.168.1.1',
          userAgent: 'Mozilla/5.0',
          metadata,
        },
        'encrypted_ip'
      );
      expect(entry.metadata).toEqual(metadata);
    });
  });

  /**
   * **Feature: secure-notebook, Property 28: Audit Log Encryption**
   * For any stored audit log, sensitive fields (IP address) should be encrypted.
   */
  describe('Property 28: Audit Log Encryption', () => {
    it('should detect plaintext IPv4 addresses as not encrypted', () => {
      const plaintextIps = [
        '192.168.1.1',
        '10.0.0.1',
        '172.16.0.1',
        '255.255.255.255',
        '0.0.0.0',
      ];
      
      for (const ip of plaintextIps) {
        expect(isIpAddressEncrypted(ip)).toBe(false);
      }
    });

    it('should detect plaintext IPv6 addresses as not encrypted', () => {
      const plaintextIps = [
        '::1',
        '2001:db8::1',
        'fe80::1',
      ];
      
      for (const ip of plaintextIps) {
        expect(isIpAddressEncrypted(ip)).toBe(false);
      }
    });

    it('should detect encrypted values as encrypted', () => {
      const encryptedValues = [
        'aGVsbG8gd29ybGQgdGhpcyBpcyBlbmNyeXB0ZWQ=',
        'U29tZSBlbmNyeXB0ZWQgZGF0YSBoZXJl',
        'encrypted_192.168.1.1_base64encoded',
      ];
      
      for (const value of encryptedValues) {
        expect(isIpAddressEncrypted(value)).toBe(true);
      }
    });

    it('should validate audit log entries have encrypted IP addresses', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }),
          fc.string({ minLength: 25, maxLength: 100 }), // Encrypted values are longer
          (userId, encryptedIp) => {
            const entry = createAuditLogEntry(
              {
                userId,
                action: 'login',
                ipAddress: '192.168.1.1', // Original plaintext
                userAgent: 'Test Agent',
              },
              encryptedIp // Should be encrypted before passing
            );

            // The stored IP should be the encrypted version
            expect(entry.encryptedIpAddress).toBe(encryptedIp);
            // And it should be detected as encrypted
            expect(isIpAddressEncrypted(entry.encryptedIpAddress)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Audit Log Validation', () => {
    it('should validate complete audit log entries', () => {
      const validEntry: AuditLogEntry = {
        id: 'audit_123_abc',
        userId: 'user123',
        action: 'login',
        deviceId: 'device456',
        encryptedIpAddress: 'encrypted_ip_data_here_base64',
        userAgent: 'Mozilla/5.0',
        metadata: null,
        createdAt: Date.now(),
      };
      expect(isValidAuditLogEntry(validEntry)).toBe(true);
    });

    it('should reject entries with missing required fields', () => {
      const invalidEntries = [
        { id: '', userId: 'user', action: 'login', encryptedIpAddress: 'enc', userAgent: 'ua', metadata: null, createdAt: 123, deviceId: null },
        { id: 'id', userId: '', action: 'login', encryptedIpAddress: 'enc', userAgent: 'ua', metadata: null, createdAt: 123, deviceId: null },
        { id: 'id', userId: 'user', action: 'login', encryptedIpAddress: '', userAgent: 'ua', metadata: null, createdAt: 123, deviceId: null },
      ];

      for (const entry of invalidEntries) {
        expect(isValidAuditLogEntry(entry as AuditLogEntry)).toBe(false);
      }
    });
  });

  describe('Audit Log Filtering', () => {
    const sampleLogs: AuditLogEntry[] = [
      { id: '1', userId: 'u1', action: 'login', deviceId: null, encryptedIpAddress: 'enc1', userAgent: 'ua', metadata: null, createdAt: 1000 },
      { id: '2', userId: 'u1', action: 'login_failed', deviceId: null, encryptedIpAddress: 'enc2', userAgent: 'ua', metadata: null, createdAt: 2000 },
      { id: '3', userId: 'u1', action: 'logout', deviceId: null, encryptedIpAddress: 'enc3', userAgent: 'ua', metadata: null, createdAt: 3000 },
      { id: '4', userId: 'u1', action: 'password_change', deviceId: null, encryptedIpAddress: 'enc4', userAgent: 'ua', metadata: null, createdAt: 4000 },
      { id: '5', userId: 'u1', action: 'note_created', deviceId: null, encryptedIpAddress: 'enc5', userAgent: 'ua', metadata: null, createdAt: 5000 },
    ];

    it('should filter logs by action', () => {
      const loginLogs = filterLogsByAction(sampleLogs, ['login', 'logout']);
      expect(loginLogs).toHaveLength(2);
      expect(loginLogs.map(l => l.action)).toEqual(['login', 'logout']);
    });

    it('should filter logs by date range', () => {
      const filtered = filterLogsByDateRange(sampleLogs, 2000, 4000);
      expect(filtered).toHaveLength(3);
      expect(filtered.map(l => l.id)).toEqual(['2', '3', '4']);
    });

    it('should get recent logs sorted by timestamp descending', () => {
      const recent = getRecentLogs(sampleLogs, 3);
      expect(recent).toHaveLength(3);
      expect(recent.map(l => l.id)).toEqual(['5', '4', '3']);
    });

    it('should get login history', () => {
      const history = getLoginHistory(sampleLogs);
      expect(history).toHaveLength(3);
      expect(history.map(l => l.action)).toEqual(['login', 'login_failed', 'logout']);
    });

    it('should get security events', () => {
      const events = getSecurityEvents(sampleLogs);
      expect(events).toHaveLength(2);
      expect(events.map(l => l.action)).toEqual(['login_failed', 'password_change']);
    });
  });

  describe('Failed Login Tracking', () => {
    it('should count failed logins within time window', () => {
      const now = Date.now();
      const logs: AuditLogEntry[] = [
        { id: '1', userId: 'u1', action: 'login_failed', deviceId: null, encryptedIpAddress: 'enc', userAgent: 'ua', metadata: null, createdAt: now - 1000 },
        { id: '2', userId: 'u1', action: 'login_failed', deviceId: null, encryptedIpAddress: 'enc', userAgent: 'ua', metadata: null, createdAt: now - 2000 },
        { id: '3', userId: 'u1', action: 'login_failed', deviceId: null, encryptedIpAddress: 'enc', userAgent: 'ua', metadata: null, createdAt: now - 3000 },
        { id: '4', userId: 'u1', action: 'login', deviceId: null, encryptedIpAddress: 'enc', userAgent: 'ua', metadata: null, createdAt: now - 4000 },
      ];

      expect(countFailedLogins(logs, 60000)).toBe(3);
    });

    it('should not count old failed logins', () => {
      const now = Date.now();
      const logs: AuditLogEntry[] = [
        { id: '1', userId: 'u1', action: 'login_failed', deviceId: null, encryptedIpAddress: 'enc', userAgent: 'ua', metadata: null, createdAt: now - 1000000 },
      ];

      expect(countFailedLogins(logs, 60000)).toBe(0);
    });

    it('should determine account lockout correctly', () => {
      const now = Date.now();
      const logs: AuditLogEntry[] = Array.from({ length: 5 }, (_, i) => ({
        id: `${i}`,
        userId: 'u1',
        action: 'login_failed' as AuditAction,
        deviceId: null,
        encryptedIpAddress: 'enc',
        userAgent: 'ua',
        metadata: null,
        createdAt: now - i * 1000,
      }));

      expect(shouldLockAccount(logs, 5, 60000)).toBe(true);
      expect(shouldLockAccount(logs.slice(0, 4), 5, 60000)).toBe(false);
    });
  });
});
