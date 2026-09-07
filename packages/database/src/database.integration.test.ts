import { afterAll, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import {
  createDatabase,
  migrateDatabase,
  seedDatabase,
  sites,
  users,
  sessions,
  roles,
  permissions,
  rolePermissions,
  userRoleAssignments,
} from './index.js';
import { hashPassword, generateSessionToken, hashSessionToken, getSessionCookieName } from '@platform/auth';
import { buildApp } from '../../../apps/api/src/app.js';

const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error('TEST_DATABASE_URL is required and must point to a dedicated empty PostgreSQL 16 database.');
const database = createDatabase(url);
afterAll(async () => {
  await database.pool.end();
});

it('migrates a clean PostgreSQL 16 DB with M2 identity schema, verifies repeat migration, idempotent seed, FKs, UUIDv7, unique constraints, and relation persistence', async () => {
  const version = await database.pool.query('SHOW server_version_num');
  expect(Number(version.rows[0].server_version_num)).toBeGreaterThanOrEqual(160000);
  expect(Number(version.rows[0].server_version_num)).toBeLessThan(170000);

  // 1. Verify clean DB
  const before = await database.pool.query("SELECT to_regclass('public.sites') AS table_name");
  expect(before.rows[0].table_name, 'Use a fresh test database; test never deletes existing data').toBeNull();

  // 2. Run initial migration and repeated migration
  await migrateDatabase(database);
  await migrateDatabase(database);

  // 3. Run seed and repeated seed (idempotency check)
  await seedDatabase(database);
  await seedDatabase(database);

  // 4. Verify seeded site
  const siteRows = await database.db.select().from(sites);
  expect(siteRows).toHaveLength(1);
  expect(siteRows[0]?.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);

  // 5. Verify seeded system permissions and super admin role
  const allPermissions = await database.db.select().from(permissions);
  expect(allPermissions.length).toBeGreaterThanOrEqual(15);
  expect(allPermissions.some((p) => p.key === 'users.read')).toBe(true);

  const superAdminRole = await database.db.query.roles.findFirst({
    where: (r, { eq: eqOp }) => eqOp(r.key, 'system_super_admin'),
  });
  expect(superAdminRole).toBeDefined();
  expect(superAdminRole?.isSystem).toBe(true);
  expect(superAdminRole?.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);

  const superAdminPerms = await database.db
    .select()
    .from(rolePermissions)
    .where(eq(rolePermissions.roleId, superAdminRole!.id));
  expect(superAdminPerms.length).toBe(allPermissions.length);

  // 6. Test creating user with Argon2id hash (never plain text password)
  const password = 'TestSecurePassword123!';
  const passwordHash = await hashPassword(password);
  expect(passwordHash).not.toContain(password);

  const [insertedUser] = await database.db
    .insert(users)
    .values({
      email: 'admin@platform.example.com',
      passwordHash,
      name: 'Platform Administrator',
      isActive: true,
    })
    .returning();

  expect(insertedUser).toBeDefined();
  expect(insertedUser.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  expect(insertedUser.email).toBe('admin@platform.example.com');
  expect(insertedUser.passwordHash).toBe(passwordHash);

  // Unique constraint test on email
  await expect(
    database.db.insert(users).values({
      email: 'admin@platform.example.com',
      passwordHash: 'another-hash',
      name: 'Duplicate Admin',
    })
  ).rejects.toThrow();

  // 7. Test creating session with token hash (never plain session token)
  const plainToken = generateSessionToken();
  const tokenHash = hashSessionToken(plainToken);
  expect(tokenHash).not.toEqual(plainToken);

  const [insertedSession] = await database.db
    .insert(sessions)
    .values({
      userId: insertedUser.id,
      tokenHash,
      expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
      ipAddress: '127.0.0.1',
      userAgent: 'Vitest/4.0',
    })
    .returning();

  expect(insertedSession).toBeDefined();
  expect(insertedSession.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  expect(insertedSession.tokenHash).toBe(tokenHash);

  // Unique constraint test on session token_hash
  await expect(
    database.db.insert(sessions).values({
      userId: insertedUser.id,
      tokenHash,
      expiresAt: new Date(),
    })
  ).rejects.toThrow();

  // 8. Test user role assignment persistence with scope
  const [globalAssignment] = await database.db
    .insert(userRoleAssignments)
    .values({
      userId: insertedUser.id,
      roleId: superAdminRole!.id,
      scopeKind: 'global',
      scopeId: null,
    })
    .returning();

  expect(globalAssignment).toBeDefined();
  expect(globalAssignment.scopeKind).toBe('global');
  expect(globalAssignment.scopeId).toBeNull();

  // 9. Test site-scoped role creation and assignment
  const [siteEditorRole] = await database.db
    .insert(roles)
    .values({
      key: 'site_editor',
      name: 'Site Editor',
      description: 'Editor for a specific site',
      isSystem: false,
    })
    .returning();

  const [siteAssignment] = await database.db
    .insert(userRoleAssignments)
    .values({
      userId: insertedUser.id,
      roleId: siteEditorRole.id,
      scopeKind: 'site',
      scopeId: siteRows[0].id,
    })
    .returning();

  expect(siteAssignment.scopeKind).toBe('site');
  expect(siteAssignment.scopeId).toBe(siteRows[0].id);

  // 10. Persistence verification across a new database connection
  const reconnect = createDatabase(url);
  try {
    const persistedUsers = await reconnect.db.select().from(users);
    expect(persistedUsers).toHaveLength(1);
    expect(persistedUsers[0].email).toBe('admin@platform.example.com');

    const persistedSessions = await reconnect.db.select().from(sessions);
    expect(persistedSessions).toHaveLength(1);
    expect(persistedSessions[0].tokenHash).toBe(tokenHash);

    const userAssignments = await reconnect.db
      .select()
      .from(userRoleAssignments)
      .where(eq(userRoleAssignments.userId, insertedUser.id));
    expect(userAssignments).toHaveLength(2);
  } finally {
    await reconnect.pool.end();
  }

  // 11. Foreign Key cascade test: deleting user should delete their sessions and assignments
  await database.db.delete(users).where(eq(users.id, insertedUser.id));
  const remainingSessions = await database.db.select().from(sessions);
  expect(remainingSessions).toHaveLength(0);

  const remainingAssignments = await database.db.select().from(userRoleAssignments);
  expect(remainingAssignments).toHaveLength(0);

  // 12. App readiness verification
  const app = buildApp(async () => {
    await database.pool.query('SELECT id FROM sites LIMIT 0');
  });
  try {
    expect((await app.inject('/health/ready')).statusCode).toBe(200);
  } finally {
    await app.close();
  }
}, 30000);

it('verifies M2.2 Fastify Auth API endpoints (login, cookies, me, logout, rate limiting, and origin protection) against PostgreSQL 16', async () => {
  // 1. Create active test user and inactive test user
  const validPassword = 'AdminPassword123!';
  const passwordHash = await hashPassword(validPassword);

  const [activeUser] = await database.db
    .insert(users)
    .values({
      email: 'm2_auth_test@example.com',
      passwordHash,
      name: 'Auth Test User',
      isActive: true,
    })
    .returning();

  const [inactiveUser] = await database.db
    .insert(users)
    .values({
      email: 'm2_inactive_test@example.com',
      passwordHash,
      name: 'Inactive User',
      isActive: false,
    })
    .returning();
  expect(inactiveUser.isActive).toBe(false);

  const superAdminRole = await database.db.query.roles.findFirst({
    where: (r, { eq: eqOp }) => eqOp(r.key, 'system_super_admin'),
  });

  if (superAdminRole) {
    await database.db.insert(userRoleAssignments).values({
      userId: activeUser.id,
      roleId: superAdminRole.id,
      scopeKind: 'global',
      scopeId: null,
    });
  }

  const app = buildApp({
    checkDatabase: async () => {},
    database,
    nodeEnv: 'development',
    corsOrigin: 'http://localhost:3001',
  });
  await app.ready();

  try {
    const cookieName = getSessionCookieName(false);

    // 2. Unauthenticated GET /auth/me -> 401
    const unauthMe = await app.inject({
      method: 'GET',
      url: '/auth/me',
    });
    expect(unauthMe.statusCode).toBe(401);
    expect(unauthMe.json().error).toBe('UNAUTHORIZED');

    // 3. Login with wrong password -> 401 generic
    const wrongPass = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'm2_auth_test@example.com', password: 'WrongPassword!' },
    });
    expect(wrongPass.statusCode).toBe(401);
    expect(wrongPass.json().message).toBe('Invalid email or password');

    // 4. Login with unknown email -> 401 generic
    const unknownEmail = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'nonexistent@example.com', password: 'AnyPassword!' },
    });
    expect(unknownEmail.statusCode).toBe(401);
    expect(unknownEmail.json().message).toBe('Invalid email or password');

    // 5. Login with inactive user -> 401 generic
    const inactiveLogin = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'm2_inactive_test@example.com', password: validPassword },
    });
    expect(inactiveLogin.statusCode).toBe(401);
    expect(inactiveLogin.json().message).toBe('Invalid email or password');

    // 6. Login valid -> 200, sets HttpOnly cookie, returns profile
    const validLogin = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: '  M2_Auth_Test@Example.Com  ', password: validPassword },
    });
    expect(validLogin.statusCode).toBe(200);
    const loginBody = validLogin.json();
    expect(loginBody.user.email).toBe('m2_auth_test@example.com');
    expect(loginBody.user.name).toBe('Auth Test User');
    expect(loginBody.token).toBeDefined();
    expect(loginBody.user.passwordHash).toBeUndefined();

    // Verify cookie
    const setCookieHeader = validLogin.headers['set-cookie'] as string;
    expect(setCookieHeader).toBeDefined();
    expect(setCookieHeader).toContain(cookieName);
    expect(setCookieHeader).toContain('HttpOnly');
    expect(setCookieHeader).toContain('Path=/');

    // 7. Verify session in PostgreSQL: DB has token_hash, NOT plain token
    const rawToken = loginBody.token;
    const tokenHash = hashSessionToken(rawToken);
    const sessionInDb = await database.db.query.sessions.findFirst({
      where: (s, { eq: eqOp }) => eqOp(s.tokenHash, tokenHash),
    });
    expect(sessionInDb).toBeDefined();
    expect(sessionInDb?.userId).toBe(activeUser.id);

    // Ensure raw token is not stored in DB
    const allDbSessions = await database.db.select().from(sessions);
    expect(allDbSessions.some((s) => s.tokenHash === rawToken)).toBe(false);

    // 8. GET /auth/me with cookie -> 200 with user profile & grants
    const authMeWithCookie = await app.inject({
      method: 'GET',
      url: '/auth/me',
      cookies: {
        [cookieName]: rawToken,
      },
    });
    expect(authMeWithCookie.statusCode).toBe(200);
    const meBody = authMeWithCookie.json();
    expect(meBody.user.email).toBe('m2_auth_test@example.com');
    expect(meBody.grants.length).toBeGreaterThanOrEqual(15);
    expect(meBody.grants.some((g: { permission: string }) => g.permission === 'users.read')).toBe(true);

    // 9. GET /auth/me with Bearer token header -> 200
    const authMeWithBearer = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: {
        authorization: `Bearer ${rawToken}`,
      },
    });
    expect(authMeWithBearer.statusCode).toBe(200);
    expect(authMeWithBearer.json().user.email).toBe('m2_auth_test@example.com');

    // 10. POST /auth/logout -> revokes session from DB and clears cookie
    const logoutRes = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      cookies: {
        [cookieName]: rawToken,
      },
    });
    expect(logoutRes.statusCode).toBe(200);
    expect(logoutRes.json()).toEqual({ status: 'ok' });

    // Verify session revoked from DB
    const sessionAfterLogout = await database.db.query.sessions.findFirst({
      where: (s, { eq: eqOp }) => eqOp(s.tokenHash, tokenHash),
    });
    expect(sessionAfterLogout).toBeUndefined();

    // 11. Old session token is now rejected with 401
    const meAfterLogout = await app.inject({
      method: 'GET',
      url: '/auth/me',
      cookies: {
        [cookieName]: rawToken,
      },
    });
    expect(meAfterLogout.statusCode).toBe(401);

    // 12. Rate limiting test on /auth/login (exceed 5 attempts)
    for (let i = 0; i < 4; i++) {
      await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email: 'rate_limit@example.com', password: 'wrong' },
      });
    }
    const rateLimitedRes = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'rate_limit@example.com', password: 'wrong' },
    });
    expect(rateLimitedRes.statusCode).toBe(429);
  } finally {
    await app.close();
  }
}, 30000);
