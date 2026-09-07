import { hash, verify, Version, Algorithm } from '@node-rs/argon2';
import { createHash, randomBytes } from 'node:crypto';

export const SESSION_COOKIE_NAME = 'platform_session';
export const SESSION_COOKIE_NAME_PROD = '__Host-platform_session';

export function getSessionCookieName(isProduction: boolean): string {
  return isProduction ? SESSION_COOKIE_NAME_PROD : SESSION_COOKIE_NAME;
}

export type Scope =
  | { kind: 'global' }
  | { kind: 'site'; siteId: string }
  | { kind: 'campus'; siteId: string; campusId: string }
  | { kind: 'resource'; resourceType: string; resourceId: string };

export type EffectiveGrant = {
  permission: string;
  scopeKind: 'global' | 'site' | 'campus' | 'resource';
  scopeId: string | null;
};

// Legacy alias for backward compatibility with M1 tests
export type Grant = { permission: string; scope: { kind: 'global' } | { kind: 'site'; siteId: string } };

/**
 * Evaluates whether a list of effective grants contains permission for the given target scope.
 * Follows allow-list, deny-by-default, and hierarchical inheritance:
 * - GLOBAL grant satisfies any site/campus scope.
 * - Wildcard '*' permission matches any permission.
 */
export function hasPermission(
  grants: readonly (EffectiveGrant | Grant)[],
  permission: string,
  targetScope?: string | Scope
): boolean {
  let normalizedScope: Scope;
  if (typeof targetScope === 'string') {
    normalizedScope = { kind: 'site', siteId: targetScope };
  } else if (!targetScope) {
    normalizedScope = { kind: 'global' };
  } else {
    normalizedScope = targetScope;
  }

  return grants.some((g) => {
    const grantPerm = g.permission;
    const permMatch = grantPerm === '*' || grantPerm === permission;
    if (!permMatch) return false;

    // Check scope format
    let gKind: string;
    let gScopeId: string | null;
    if ('scope' in g && typeof g.scope === 'object') {
      gKind = g.scope.kind;
      gScopeId = g.scope.kind === 'site' ? g.scope.siteId : null;
    } else if ('scopeKind' in g) {
      gKind = g.scopeKind;
      gScopeId = g.scopeId;
    } else {
      return false;
    }

    // 1. Global grant satisfies all scopes
    if (gKind === 'global') return true;

    // 2. Site scope matching
    if (normalizedScope.kind === 'site' && gKind === 'site' && gScopeId === normalizedScope.siteId) {
      return true;
    }

    // 3. Campus scope matching (site or exact campus)
    if (normalizedScope.kind === 'campus') {
      if (gKind === 'site' && gScopeId === normalizedScope.siteId) return true;
      if (gKind === 'campus' && gScopeId === normalizedScope.campusId) return true;
    }

    // 4. Resource scope matching
    if (normalizedScope.kind === 'resource' && gKind === 'resource' && gScopeId === normalizedScope.resourceId) {
      return true;
    }

    return false;
  });
}

/**
 * Hashes a plaintext password using Argon2id with RFC 9106 recommended parameters.
 */
export async function hashPassword(password: string): Promise<string> {
  return hash(password, {
    memoryCost: 65536,
    timeCost: 3,
    outputLen: 32,
    parallelism: 4,
    algorithm: Algorithm.Argon2id,
    version: Version.V0x13,
  });
}

/**
 * Verifies a plaintext password against an Argon2id hash using constant-time comparison.
 */
export async function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

/**
 * Normalizes email address to lowercase and trimmed.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Generates a high-entropy random session token (32 bytes = 256 bits).
 */
export function generateSessionToken(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Computes SHA-256 hash of a session token for storage and lookup in the database.
 */
export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
