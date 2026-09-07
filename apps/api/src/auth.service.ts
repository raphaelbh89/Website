import type { createDatabase } from '@platform/database';
import { sessions, userRoleAssignments, rolePermissions, permissions } from '@platform/database';
import {
  verifyPassword,
  normalizeEmail,
  generateSessionToken,
  hashSessionToken,
  type EffectiveGrant,
} from '@platform/auth';
import { eq } from 'drizzle-orm';

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  isActive: boolean;
  createdAt: string;
}

export interface AuthenticatedUserSession {
  user: UserProfile;
  session: {
    id: string;
    expiresAt: string;
  };
  grants: EffectiveGrant[];
}

export class AuthService {
  constructor(private database: ReturnType<typeof createDatabase>) {}

  /**
   * Authenticates a user with email and password.
   * On success: creates a session, hashes the token with SHA-256 for DB storage, and returns user profile + raw token.
   */
  async login(
    rawEmail: string,
    password: string,
    metadata?: { ipAddress?: string; userAgent?: string }
  ): Promise<{ user: UserProfile; rawToken: string; expiresAt: Date } | null> {
    const email = normalizeEmail(rawEmail);

    const user = await this.database.db.query.users.findFirst({
      where: (u, { eq: eqOp }) => eqOp(u.email, email),
    });

    // Timing-safe prevention of user enumeration:
    // If user not found, perform a dummy verify to prevent timing differences.
    if (!user) {
      await verifyPassword(
        password,
        '$argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHRzb21lc2FsdA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
      );
      return null;
    }

    if (!user.isActive) {
      // Inactive user denied with generic error according to ADR-0005 generic error policy
      return null;
    }

    const isPasswordValid = await verifyPassword(password, user.passwordHash);
    if (!isPasswordValid) {
      return null;
    }

    // Generate high-entropy 256-bit token
    const rawToken = generateSessionToken();
    const tokenHash = hashSessionToken(rawToken);

    // Absolute timeout: 7 days
    const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000);

    // Persist session (only token_hash is stored)
    await this.database.db.insert(sessions).values({
      userId: user.id,
      tokenHash,
      expiresAt,
      ipAddress: metadata?.ipAddress ?? null,
      userAgent: metadata?.userAgent ?? null,
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        isActive: user.isActive,
        createdAt: user.createdAt.toISOString(),
      },
      rawToken,
      expiresAt,
    };
  }

  /**
   * Resolves a session by raw session token.
   * Enforces: active expiration check, active user check, and rolling last_active_at update.
   */
  async resolveSession(rawToken: string): Promise<AuthenticatedUserSession | null> {
    const tokenHash = hashSessionToken(rawToken);
    const now = new Date();

    const sessionRecord = await this.database.db.query.sessions.findFirst({
      where: (s, { eq: eqOp, and: andOp, gt: gtOp }) =>
        andOp(eqOp(s.tokenHash, tokenHash), gtOp(s.expiresAt, now)),
    });

    if (!sessionRecord) {
      return null;
    }

    const userRecord = await this.database.db.query.users.findFirst({
      where: (u, { eq: eqOp }) => eqOp(u.id, sessionRecord.userId),
    });

    if (!userRecord || !userRecord.isActive) {
      return null;
    }

    // Rolling idle timeout update (every 15 mins of activity)
    const fifteenMinutesAgo = new Date(now.getTime() - 15 * 60 * 1000);
    if (sessionRecord.lastActiveAt < fifteenMinutesAgo) {
      await this.database.db
        .update(sessions)
        .set({ lastActiveAt: now })
        .where(eq(sessions.id, sessionRecord.id));
    }

    // Load effective grants for the user
    const assignments = await this.database.db
      .select({
        roleId: userRoleAssignments.roleId,
        scopeKind: userRoleAssignments.scopeKind,
        scopeId: userRoleAssignments.scopeId,
        permissionKey: permissions.key,
      })
      .from(userRoleAssignments)
      .innerJoin(rolePermissions, eq(userRoleAssignments.roleId, rolePermissions.roleId))
      .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
      .where(eq(userRoleAssignments.userId, userRecord.id));

    const grants: EffectiveGrant[] = assignments.map((a) => ({
      permission: a.permissionKey,
      scopeKind: a.scopeKind as 'global' | 'site' | 'campus' | 'resource',
      scopeId: a.scopeId,
    }));

    return {
      user: {
        id: userRecord.id,
        email: userRecord.email,
        name: userRecord.name,
        isActive: userRecord.isActive,
        createdAt: userRecord.createdAt.toISOString(),
      },
      session: {
        id: sessionRecord.id,
        expiresAt: sessionRecord.expiresAt.toISOString(),
      },
      grants,
    };
  }

  /**
   * Revokes/deletes a session by raw token.
   */
  async logout(rawToken: string): Promise<boolean> {
    const tokenHash = hashSessionToken(rawToken);
    const result = await this.database.db.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
    return result.rowCount ? result.rowCount > 0 : true;
  }
}
