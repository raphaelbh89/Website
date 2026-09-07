import { describe, expect, it } from 'vitest';
import {
  hasPermission,
  hashPassword,
  verifyPassword,
  normalizeEmail,
  generateSessionToken,
  hashSessionToken,
  type EffectiveGrant,
  type Grant,
} from './index.js';

describe('Scoped Permissions Evaluation', () => {
  it('denies by default and enforces site/global boundaries', () => {
    const grants: Grant[] = [{ permission: 'content.read', scope: { kind: 'site', siteId: 'a' } }];
    expect(hasPermission([], 'content.read', 'a')).toBe(false);
    expect(hasPermission(grants, 'content.read', 'a')).toBe(true);
    expect(hasPermission(grants, 'content.write', 'a')).toBe(false);
    expect(hasPermission(grants, 'content.read', 'b')).toBe(false);
    expect(hasPermission(grants, 'content.read')).toBe(false);
    expect(hasPermission([{ permission: 'content.read', scope: { kind: 'global' } }], 'content.read', 'b')).toBe(true);
  });

  it('supports EffectiveGrant objects and hierarchical scope matching', () => {
    const effectiveGrants: EffectiveGrant[] = [
      { permission: 'users.read', scopeKind: 'global', scopeId: null },
      { permission: 'content.publish', scopeKind: 'site', scopeId: 'site-alpha' },
    ];

    // Global grant matches any target scope
    expect(hasPermission(effectiveGrants, 'users.read', { kind: 'global' })).toBe(true);
    expect(hasPermission(effectiveGrants, 'users.read', { kind: 'site', siteId: 'site-beta' })).toBe(true);
    expect(hasPermission(effectiveGrants, 'users.read', { kind: 'campus', siteId: 'site-beta', campusId: 'campus-1' })).toBe(true);

    // Scoped site grant only matches its own site or campus within that site
    expect(hasPermission(effectiveGrants, 'content.publish', { kind: 'site', siteId: 'site-alpha' })).toBe(true);
    expect(hasPermission(effectiveGrants, 'content.publish', { kind: 'site', siteId: 'site-beta' })).toBe(false);
    expect(hasPermission(effectiveGrants, 'content.publish', { kind: 'campus', siteId: 'site-alpha', campusId: 'c1' })).toBe(true);
    expect(hasPermission(effectiveGrants, 'content.publish', { kind: 'campus', siteId: 'site-beta', campusId: 'c1' })).toBe(false);

    // Wildcard permission grant
    const superGrants: EffectiveGrant[] = [
      { permission: '*', scopeKind: 'global', scopeId: null },
    ];
    expect(hasPermission(superGrants, 'any.permission.key', { kind: 'site', siteId: 'any-site' })).toBe(true);
  });
});

describe('Argon2id Password Hashing & Verification', () => {
  it('hashes passwords with Argon2id and verifies correctly', async () => {
    const password = 'SuperSecurePassword123!';
    const passwordHash = await hashPassword(password);

    expect(passwordHash).toMatch(/^\$argon2id\$v=\d+\$m=\d+,t=\d+,p=\d+\$.+/);
    expect(passwordHash).not.toContain(password);

    const isValid = await verifyPassword(password, passwordHash);
    expect(isValid).toBe(true);

    const isInvalid = await verifyPassword('WrongPassword', passwordHash);
    expect(isInvalid).toBe(false);
  });
});

describe('Email Normalization and Token Utilities', () => {
  it('normalizes email addresses to lowercase and trimmed', () => {
    expect(normalizeEmail('  Admin@Example.COM  ')).toBe('admin@example.com');
  });

  it('generates high-entropy session tokens and distinct SHA-256 hashes', () => {
    const token1 = generateSessionToken();
    const token2 = generateSessionToken();

    expect(token1).toHaveLength(64); // 32 bytes hex
    expect(token2).toHaveLength(64);
    expect(token1).not.toEqual(token2);

    const hash1 = hashSessionToken(token1);
    const hash2 = hashSessionToken(token2);

    expect(hash1).toHaveLength(64);
    expect(hash1).not.toEqual(token1); // Never store plain token
    expect(hash1).not.toEqual(hash2);
    expect(hashSessionToken(token1)).toBe(hash1); // Deterministic
  });
});
