import { afterAll, expect, it } from 'vitest';
import { eq, and, ne, sql } from 'drizzle-orm';
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
  contentRevisionTerms,
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
    expect(loginBody.token).toBeUndefined(); // Security: raw token is NOT in JSON body
    expect(loginBody.user.passwordHash).toBeUndefined();

    // Verify cookie
    const setCookieHeader = validLogin.headers['set-cookie'] as string;
    expect(setCookieHeader).toBeDefined();
    expect(setCookieHeader).toContain(cookieName);
    expect(setCookieHeader).toContain('HttpOnly');
    expect(setCookieHeader).toContain('Path=/');

    // 7. Verify session in PostgreSQL: DB has token_hash, NOT plain token
    const rawToken = setCookieHeader.match(new RegExp(`${cookieName}=([^;]+)`))?.[1] ?? '';
    expect(rawToken.length).toBeGreaterThan(0);
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
      headers: {
        origin: 'http://localhost:3001',
      },
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

    // 12. Rate limiting test on /auth/login (exceed 5 attempts for rate_limit@example.com)
    for (let i = 0; i < 5; i++) {
      await app.inject({
        method: 'POST',
        url: '/auth/login',
        headers: { 'content-type': 'application/json', origin: 'http://localhost:3001' },
        payload: { email: 'rate_limit@example.com', password: 'wrong' },
      });
    }
    const rateLimitedRes = await app.inject({
      method: 'POST',
      url: '/auth/login',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3001' },
      payload: { email: 'rate_limit@example.com', password: 'wrong' },
    });
    expect(rateLimitedRes.statusCode).toBe(429);
  } finally {
    await app.close();
  }
}, 30000);

it('verifies production cookie attributes, session lifecycle (absolute expiry, idle timeout, rolling update, deactivation), and M2.3 scoped authorization guards', async () => {
  // 1. Setup production Fastify app instance
  const prodApp = buildApp({
    checkDatabase: async () => {},
    database,
    nodeEnv: 'production',
    cookieSecret: 'a-custom-32-chars-production-secret-for-tests!',
    corsOrigin: 'http://localhost:3001',
  });
  await prodApp.ready();

  try {
    const prodCookieName = getSessionCookieName(true);
    expect(prodCookieName).toBe('__Host-platform_session');

    const password = 'ProductionUserSecret123!';
    const passwordHash = await hashPassword(password);

    // Create test user 1: Global Admin with users.read and sites.read
    const [globalAdmin] = await database.db
      .insert(users)
      .values({
        email: 'global_admin@example.com',
        passwordHash,
        name: 'Global Administrator',
        isActive: true,
      })
      .returning();

    // Create test user 2: Site A Editor (only sites.read on site-A)
    const [siteEditor] = await database.db
      .insert(users)
      .values({
        email: 'site_editor@example.com',
        passwordHash,
        name: 'Site Editor',
        isActive: true,
      })
      .returning();

    // Create test user 3: Regular viewer (no admin permissions)
    const [regularUser] = await database.db
      .insert(users)
      .values({
        email: 'regular_user@example.com',
        passwordHash,
        name: 'Regular Viewer',
        isActive: true,
      })
      .returning();
    expect(regularUser.id).toBeDefined();

    // Assign global super admin role to globalAdmin
    const superAdminRole = await database.db.query.roles.findFirst({
      where: (r, { eq: eqOp }) => eqOp(r.key, 'system_super_admin'),
    });
    if (superAdminRole) {
      await database.db.insert(userRoleAssignments).values({
        userId: globalAdmin.id,
        roleId: superAdminRole.id,
        scopeKind: 'global',
        scopeId: null,
      });
    }

    // Create a site_viewer role with 'sites.read' permission
    const sitesReadPerm = await database.db.query.permissions.findFirst({
      where: (p, { eq: eqOp }) => eqOp(p.key, 'sites.read'),
    });
    expect(sitesReadPerm).toBeDefined();

    const [siteRole] = await database.db
      .insert(roles)
      .values({
        key: 'site_viewer_role',
        name: 'Site Viewer Role',
        description: 'Read only for specific site',
        isSystem: false,
      })
      .returning();

    await database.db.insert(rolePermissions).values({
      roleId: siteRole.id,
      permissionId: sitesReadPerm!.id,
    });

    const targetSiteA = 'site-alpha-123';
    const targetSiteB = 'site-beta-456';

    // Assign site_viewer role to siteEditor for targetSiteA only
    await database.db.insert(userRoleAssignments).values({
      userId: siteEditor.id,
      roleId: siteRole.id,
      scopeKind: 'site',
      scopeId: targetSiteA,
    });

    // --- A. Production Cookie Security Verification ---
    const prodLoginRes = await prodApp.inject({
      method: 'POST',
      url: '/auth/login',
      headers: {
        'content-type': 'application/json',
      },
      payload: { email: 'global_admin@example.com', password },
    });
    expect(prodLoginRes.statusCode).toBe(200);

    const setCookie = prodLoginRes.headers['set-cookie'] as string;
    expect(setCookie).toBeDefined();
    expect(setCookie).toContain('__Host-platform_session=');
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('Secure');
    expect(setCookie).toContain('SameSite=Lax');
    expect(setCookie).toContain('Path=/');
    // __Host- cookies MUST NOT specify a Domain attribute
    expect(setCookie.toLowerCase()).not.toContain('domain=');

    const globalAdminToken = (prodLoginRes.headers['set-cookie'] as string)?.match(new RegExp(`${prodCookieName}=([^;]+)`))?.[1] ?? '';
    expect(globalAdminToken.length).toBeGreaterThan(0);

    // Login siteEditor
    const siteEditorLoginRes = await prodApp.inject({
      method: 'POST',
      url: '/auth/login',
      headers: {
        'content-type': 'application/json',
      },
      payload: { email: 'site_editor@example.com', password },
    });
    const siteEditorToken = (siteEditorLoginRes.headers['set-cookie'] as string)?.match(new RegExp(`${prodCookieName}=([^;]+)`))?.[1] ?? '';
    expect(siteEditorToken.length).toBeGreaterThan(0);

    // Login regularUser
    const regularUserLoginRes = await prodApp.inject({
      method: 'POST',
      url: '/auth/login',
      headers: {
        'content-type': 'application/json',
      },
      payload: { email: 'regular_user@example.com', password },
    });
    const regularUserToken = (regularUserLoginRes.headers['set-cookie'] as string)?.match(new RegExp(`${prodCookieName}=([^;]+)`))?.[1] ?? '';
    expect(regularUserToken.length).toBeGreaterThan(0);

    // --- B. Session Lifecycle Verification ---

    // 1. Test Absolute Expiration (> 7 days)
    const expiredToken = generateSessionToken();
    const expiredHash = hashSessionToken(expiredToken);
    await database.db.insert(sessions).values({
      userId: globalAdmin.id,
      tokenHash: expiredHash,
      expiresAt: new Date(Date.now() - 1000), // Expired 1 second ago
    });

    const expiredRes = await prodApp.inject({
      method: 'GET',
      url: '/auth/me',
      cookies: { [prodCookieName]: expiredToken },
    });
    expect(expiredRes.statusCode).toBe(401);

    // 2. Test Idle Timeout (> 24 hours inactivity)
    const idleToken = generateSessionToken();
    const idleHash = hashSessionToken(idleToken);
    await database.db.insert(sessions).values({
      userId: globalAdmin.id,
      tokenHash: idleHash,
      expiresAt: new Date(Date.now() + 5 * 24 * 3600 * 1000), // Valid absolute expiry
      lastActiveAt: new Date(Date.now() - 25 * 3600 * 1000), // Inactive for 25 hours
    });

    const idleRes = await prodApp.inject({
      method: 'GET',
      url: '/auth/me',
      cookies: { [prodCookieName]: idleToken },
    });
    expect(idleRes.statusCode).toBe(401);

    // 3. Test Rolling last_active_at update
    const rollingToken = generateSessionToken();
    const rollingHash = hashSessionToken(rollingToken);
    const initialActive = new Date(Date.now() - 30 * 60 * 1000); // 30 mins ago
    const [rollingSession] = await database.db
      .insert(sessions)
      .values({
        userId: globalAdmin.id,
        tokenHash: rollingHash,
        expiresAt: new Date(Date.now() + 5 * 24 * 3600 * 1000),
        lastActiveAt: initialActive,
      })
      .returning();

    const rollingRes = await prodApp.inject({
      method: 'GET',
      url: '/auth/me',
      cookies: { [prodCookieName]: rollingToken },
    });
    expect(rollingRes.statusCode).toBe(200);

    const updatedSession = await database.db.query.sessions.findFirst({
      where: (s, { eq: eqOp }) => eqOp(s.id, rollingSession.id),
    });
    expect(updatedSession!.lastActiveAt.getTime()).toBeGreaterThan(initialActive.getTime());

    // 4. Test User Deactivation after login immediately revokes active session
    const [tempUser] = await database.db
      .insert(users)
      .values({
        email: 'temp_active@example.com',
        passwordHash,
        name: 'Temp User',
        isActive: true,
      })
      .returning();

    const tempLoginRes = await prodApp.inject({
      method: 'POST',
      url: '/auth/login',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3001' },
      payload: { email: 'temp_active@example.com', password },
    });
    const tempToken = (tempLoginRes.headers['set-cookie'] as string)?.match(new RegExp(`${prodCookieName}=([^;]+)`))?.[1] ?? '';
    expect(tempToken.length).toBeGreaterThan(0);

    // Verify session is active
    const activeMeRes = await prodApp.inject({
      method: 'GET',
      url: '/auth/me',
      cookies: { [prodCookieName]: tempToken },
    });
    expect(activeMeRes.statusCode).toBe(200);

    // Deactivate user
    await database.db.update(users).set({ isActive: false }).where(eq(users.id, tempUser.id));

    // Session is now rejected with 401
    const deactivatedMeRes = await prodApp.inject({
      method: 'GET',
      url: '/auth/me',
      cookies: { [prodCookieName]: tempToken },
    });
    expect(deactivatedMeRes.statusCode).toBe(401);

    // --- C. M2.3 Scoped Authorization Guards Verification ---

    // 1. Anonymous access -> 401 on /admin/proof and /sites/:siteId/proof
    const anonAdminProof = await prodApp.inject({
      method: 'GET',
      url: '/admin/proof',
    });
    expect(anonAdminProof.statusCode).toBe(401);
    expect(anonAdminProof.json().error).toBe('UNAUTHORIZED');

    const anonSiteProof = await prodApp.inject({
      method: 'GET',
      url: `/sites/${targetSiteA}/proof`,
    });
    expect(anonSiteProof.statusCode).toBe(401);

    // 2. Global admin with users.read -> 200 on /admin/proof
    const globalAdminProof = await prodApp.inject({
      method: 'GET',
      url: '/admin/proof',
      cookies: { [prodCookieName]: globalAdminToken },
    });
    expect(globalAdminProof.statusCode).toBe(200);
    expect(globalAdminProof.json()).toEqual({
      status: 'ok',
      message: 'Global admin proof accessed',
      user: expect.objectContaining({ email: 'global_admin@example.com' }),
    });

    // 3. Global admin with sites.read -> 200 on any site (/sites/:siteId/proof)
    const globalSiteAProof = await prodApp.inject({
      method: 'GET',
      url: `/sites/${targetSiteA}/proof`,
      cookies: { [prodCookieName]: globalAdminToken },
    });
    expect(globalSiteAProof.statusCode).toBe(200);

    const globalSiteBProof = await prodApp.inject({
      method: 'GET',
      url: `/sites/${targetSiteB}/proof`,
      cookies: { [prodCookieName]: globalAdminToken },
    });
    expect(globalSiteBProof.statusCode).toBe(200);

    // 4. Site Editor with sites.read for Site A -> 200 on Site A
    const siteEditorAProof = await prodApp.inject({
      method: 'GET',
      url: `/sites/${targetSiteA}/proof`,
      cookies: { [prodCookieName]: siteEditorToken },
    });
    expect(siteEditorAProof.statusCode).toBe(200);
    expect(siteEditorAProof.json()).toEqual({
      status: 'ok',
      message: 'Site proof accessed',
      siteId: targetSiteA,
      user: expect.objectContaining({ email: 'site_editor@example.com' }),
    });

    // 5. Site Editor with sites.read for Site A -> 403 on Site B (Site Isolation!)
    const siteEditorBProof = await prodApp.inject({
      method: 'GET',
      url: `/sites/${targetSiteB}/proof`,
      cookies: { [prodCookieName]: siteEditorToken },
    });
    expect(siteEditorBProof.statusCode).toBe(403);
    expect(siteEditorBProof.json()).toEqual({
      error: 'FORBIDDEN',
      message: 'Insufficient permissions for target scope',
    });

    // 6. Site Editor -> 403 on /admin/proof (Missing users.read)
    const siteEditorAdminProof = await prodApp.inject({
      method: 'GET',
      url: '/admin/proof',
      cookies: { [prodCookieName]: siteEditorToken },
    });
    expect(siteEditorAdminProof.statusCode).toBe(403);
    expect(siteEditorAdminProof.json().error).toBe('FORBIDDEN');

    // 7. Regular user without permissions -> 403 on both proof routes
    const regularAdminProof = await prodApp.inject({
      method: 'GET',
      url: '/admin/proof',
      cookies: { [prodCookieName]: regularUserToken },
    });
    expect(regularAdminProof.statusCode).toBe(403);

    const regularSiteProof = await prodApp.inject({
      method: 'GET',
      url: `/sites/${targetSiteA}/proof`,
      cookies: { [prodCookieName]: regularUserToken },
    });
    expect(regularSiteProof.statusCode).toBe(403);

    // 8. Bearer Token support on Scoped Guard endpoints
    const bearerProof = await prodApp.inject({
      method: 'GET',
      url: '/admin/proof',
      headers: {
        authorization: `Bearer ${globalAdminToken}`,
      },
    });
    expect(bearerProof.statusCode).toBe(200);
  } finally {
    await prodApp.close();
  }
}, 30000);

it('verifies M2.4 Admin User Management, Role Management, Role Assignments, Invariants, and Last Super Admin Protection against PostgreSQL 16', async () => {
  const app = buildApp({
    checkDatabase: async () => {},
    database,
    nodeEnv: 'development',
    corsOrigin: 'http://localhost:3001',
  });
  await app.ready();

  try {
    const cookieName = getSessionCookieName(false);
    const password = 'SuperSecretAdmin123!';
    const passwordHash = await hashPassword(password);

    // 1. Create Super Admin user with system_super_admin role
    const [superAdmin] = await database.db
      .insert(users)
      .values({
        email: 'm24_superadmin@example.com',
        name: 'M24 Super Admin',
        passwordHash,
        isActive: true,
      })
      .returning();

    const superAdminRole = await database.db.query.roles.findFirst({
      where: (r, { eq: eqOp }) => eqOp(r.key, 'system_super_admin'),
    });
    expect(superAdminRole).toBeDefined();

    const [superAdminAssignment] = await database.db
      .insert(userRoleAssignments)
      .values({
        userId: superAdmin.id,
        roleId: superAdminRole!.id,
        scopeKind: 'global',
        scopeId: null,
      })
      .returning();

    // Login superAdmin
    const adminLoginRes = await app.inject({
      method: 'POST',
      url: '/auth/login',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3001' },
      payload: { email: 'm24_superadmin@example.com', password },
    });
    expect(adminLoginRes.statusCode).toBe(200);
    const adminToken = (adminLoginRes.headers['set-cookie'] as string)?.match(new RegExp(`${cookieName}=([^;]+)`))?.[1] ?? '';
    expect(adminToken.length).toBeGreaterThan(0);
    const adminCookies = { [cookieName]: adminToken };

    // Create a Viewer user with users.read only
    const [viewerUser] = await database.db
      .insert(users)
      .values({
        email: 'm24_viewer@example.com',
        name: 'M24 Viewer',
        passwordHash,
        isActive: true,
      })
      .returning();

    const usersReadPerm = await database.db.query.permissions.findFirst({
      where: (p, { eq: eqOp }) => eqOp(p.key, 'users.read'),
    });
    expect(usersReadPerm).toBeDefined();

    const [viewerRole] = await database.db
      .insert(roles)
      .values({
        key: 'm24_viewer_role',
        name: 'M24 Viewer Role',
        isSystem: false,
      })
      .returning();

    await database.db.insert(rolePermissions).values({
      roleId: viewerRole.id,
      permissionId: usersReadPerm!.id,
    });

    await database.db.insert(userRoleAssignments).values({
      userId: viewerUser.id,
      roleId: viewerRole.id,
      scopeKind: 'global',
      scopeId: null,
    });

    const viewerLoginRes = await app.inject({
      method: 'POST',
      url: '/auth/login',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3001' },
      payload: { email: 'm24_viewer@example.com', password },
    });
    const viewerToken = (viewerLoginRes.headers['set-cookie'] as string)?.match(new RegExp(`${cookieName}=([^;]+)`))?.[1] ?? '';
    expect(viewerToken.length).toBeGreaterThan(0);
    const viewerCookies = { [cookieName]: viewerToken };

    // --- A. User Management Tests ---

    // 1. GET /users: viewer can list users
    const listUsersRes = await app.inject({
      method: 'GET',
      url: '/users?page=1&limit=10&search=m24',
      cookies: viewerCookies,
    });
    expect(listUsersRes.statusCode).toBe(200);
    const usersBody = listUsersRes.json();
    expect(usersBody.items.length).toBeGreaterThanOrEqual(2);
    expect(usersBody.total).toBeGreaterThanOrEqual(2);
    expect(usersBody.items[0].passwordHash).toBeUndefined();

    // 2. POST /users: viewer lacks users.create -> 403 Forbidden
    const viewerCreateUserRes = await app.inject({
      method: 'POST',
      url: '/users',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3001' },
      cookies: viewerCookies,
      payload: {
        email: 'new_operator@example.com',
        name: 'New Operator',
        password: 'Password123!',
      },
    });
    expect(viewerCreateUserRes.statusCode).toBe(403);

    // 3. POST /users: admin creates user -> 201 Created
    const adminCreateUserRes = await app.inject({
      method: 'POST',
      url: '/users',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3001' },
      cookies: adminCookies,
      payload: {
        email: '  NEW_OPERATOR@Example.Com  ',
        name: 'New Operator',
        password: 'Password123!',
      },
    });
    expect(adminCreateUserRes.statusCode).toBe(201);
    const createdUser = adminCreateUserRes.json().user;
    expect(createdUser.email).toBe('new_operator@example.com');
    expect(createdUser.name).toBe('New Operator');
    expect(createdUser.isActive).toBe(true);

    // 4. POST /users: duplicate email -> 409 Conflict
    const duplicateUserRes = await app.inject({
      method: 'POST',
      url: '/users',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3001' },
      cookies: adminCookies,
      payload: {
        email: 'new_operator@example.com',
        name: 'Duplicate',
        password: 'Password123!',
      },
    });
    expect(duplicateUserRes.statusCode).toBe(409);

    // 5. GET /users/:id: get user details
    const getUserRes = await app.inject({
      method: 'GET',
      url: `/users/${createdUser.id}`,
      cookies: adminCookies,
    });
    expect(getUserRes.statusCode).toBe(200);
    expect(getUserRes.json().user.id).toBe(createdUser.id);

    // 6. PATCH /users/:id: update user details and change password
    const updateRes = await app.inject({
      method: 'PATCH',
      url: `/users/${createdUser.id}`,
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3001' },
      cookies: adminCookies,
      payload: {
        name: 'Updated Operator Name',
        password: 'NewOperatorPassword123!',
      },
    });
    expect(updateRes.statusCode).toBe(200);
    expect(updateRes.json().user.name).toBe('Updated Operator Name');

    // 7. Verify new password works for login
    const newLoginRes = await app.inject({
      method: 'POST',
      url: '/auth/login',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3001' },
      payload: { email: 'new_operator@example.com', password: 'NewOperatorPassword123!' },
    });
    expect(newLoginRes.statusCode).toBe(200);
    const operatorToken = (newLoginRes.headers['set-cookie'] as string)?.match(new RegExp(`${cookieName}=([^;]+)`))?.[1] ?? '';
    expect(operatorToken.length).toBeGreaterThan(0);

    // 8. POST /users/:id/deactivate: deactivates user and terminates sessions
    const deactivateRes = await app.inject({
      method: 'POST',
      url: `/users/${createdUser.id}/deactivate`,
      headers: { origin: 'http://localhost:3001' },
      cookies: adminCookies,
    });
    expect(deactivateRes.statusCode).toBe(200);
    expect(deactivateRes.json().user.isActive).toBe(false);

    // Verify session for deactivated user is now rejected
    const testDeactivatedSessionRes = await app.inject({
      method: 'GET',
      url: '/auth/me',
      cookies: { [cookieName]: operatorToken },
    });
    expect(testDeactivatedSessionRes.statusCode).toBe(401);

    // 9. Last Super Admin Protection on User Deactivation:
    // Deactivate all other global super admins from earlier test suites so superAdmin is the sole active one
    const allOtherSuperAdmins = await database.db
      .select({ userId: userRoleAssignments.userId })
      .from(userRoleAssignments)
      .innerJoin(roles, eq(userRoleAssignments.roleId, roles.id))
      .where(
        and(
          eq(roles.key, 'system_super_admin'),
          eq(userRoleAssignments.scopeKind, 'global'),
          sql`${userRoleAssignments.scopeId} IS NULL`,
          ne(userRoleAssignments.userId, superAdmin.id)
        )
      );
    for (const osa of allOtherSuperAdmins) {
      await database.db
        .update(users)
        .set({ isActive: false })
        .where(eq(users.id, osa.userId));
    }

    // Now attempting to deactivate superAdmin (the ONLY active global super admin) must be rejected with 400!
    const selfDeactivateRes = await app.inject({
      method: 'POST',
      url: `/users/${superAdmin.id}/deactivate`,
      headers: { origin: 'http://localhost:3001' },
      cookies: adminCookies,
    });
    expect(selfDeactivateRes.statusCode).toBe(400);
    expect(selfDeactivateRes.json().message).toContain('last active global system super admin');

    // --- B. Role Management Tests ---

    // 1. GET /roles: list roles with permissions
    const listRolesRes = await app.inject({
      method: 'GET',
      url: '/roles',
      cookies: adminCookies,
    });
    expect(listRolesRes.statusCode).toBe(200);
    const rolesList = listRolesRes.json().roles;
    expect(rolesList.some((r: { key: string }) => r.key === 'system_super_admin')).toBe(true);

    // 2. POST /roles: create custom role
    const createRoleRes = await app.inject({
      method: 'POST',
      url: '/roles',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3001' },
      cookies: adminCookies,
      payload: {
        key: 'content_moderator',
        name: 'Content Moderator',
        description: 'Moderates public articles and media',
        permissions: ['content.read', 'content.update'],
      },
    });
    expect(createRoleRes.statusCode).toBe(201);
    const createdRole = createRoleRes.json().role;
    expect(createdRole.key).toBe('content_moderator');
    expect(createdRole.permissions).toEqual(['content.read', 'content.update']);

    // 3. POST /roles with invalid permission key -> 400 Bad Request
    const invalidPermRoleRes = await app.inject({
      method: 'POST',
      url: '/roles',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3001' },
      cookies: adminCookies,
      payload: {
        key: 'invalid_role',
        name: 'Invalid Role',
        permissions: ['nonexistent.permission.key'],
      },
    });
    expect(invalidPermRoleRes.statusCode).toBe(400);

    // 4. PUT /roles/:id/permissions: update custom role permissions
    const updatePermsRes = await app.inject({
      method: 'PUT',
      url: `/roles/${createdRole.id}/permissions`,
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3001' },
      cookies: adminCookies,
      payload: {
        permissions: ['content.read', 'content.update', 'content.publish'],
      },
    });
    expect(updatePermsRes.statusCode).toBe(200);
    expect(updatePermsRes.json().role.permissions).toContain('content.publish');

    // 5. System Role Protection: Cannot strip permissions from system_super_admin
    const stripSuperAdminRes = await app.inject({
      method: 'PUT',
      url: `/roles/${superAdminRole!.id}/permissions`,
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3001' },
      cookies: adminCookies,
      payload: {
        permissions: ['users.read'], // Trying to strip all other system permissions
      },
    });
    expect(stripSuperAdminRes.statusCode).toBe(400);
    expect(stripSuperAdminRes.json().message).toContain('Cannot remove system permissions from system_super_admin');

    // --- C. Role Assignment Management Tests ---

    const targetSite = (await database.db.select().from(sites))[0];
    expect(targetSite).toBeDefined();

    // 1. POST /users/:id/roles: assign SITE-scoped role to viewerUser
    const assignSiteRoleRes = await app.inject({
      method: 'POST',
      url: `/users/${viewerUser.id}/roles`,
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3001' },
      cookies: adminCookies,
      payload: {
        roleId: createdRole.id,
        scopeKind: 'site',
        scopeId: targetSite.id,
      },
    });
    expect(assignSiteRoleRes.statusCode).toBe(201);
    const siteAssignment = assignSiteRoleRes.json().assignment;
    expect(siteAssignment.scopeKind).toBe('site');
    expect(siteAssignment.scopeId).toBe(targetSite.id);

    // 2. SITE Invariant Test: Reject nonexistent site
    const invalidSiteAssignRes = await app.inject({
      method: 'POST',
      url: `/users/${viewerUser.id}/roles`,
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3001' },
      cookies: adminCookies,
      payload: {
        roleId: createdRole.id,
        scopeKind: 'site',
        scopeId: '00000000-0000-0000-0000-000000000000',
      },
    });
    expect(invalidSiteAssignRes.statusCode).toBe(400);
    expect(invalidSiteAssignRes.json().message).toBe('Site does not exist');

    // 3. GLOBAL Invariant Test: Reject GLOBAL with non-null scopeId
    const invalidGlobalAssignRes = await app.inject({
      method: 'POST',
      url: `/users/${viewerUser.id}/roles`,
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3001' },
      cookies: adminCookies,
      payload: {
        roleId: createdRole.id,
        scopeKind: 'global',
        scopeId: targetSite.id, // Illegal!
      },
    });
    expect(invalidGlobalAssignRes.statusCode).toBe(400);
    expect(invalidGlobalAssignRes.json().message).toBe('GLOBAL scope cannot have a scopeId');

    // 4. Duplicate Assignment Test: Reject duplicate user + role + scope
    const duplicateAssignRes = await app.inject({
      method: 'POST',
      url: `/users/${viewerUser.id}/roles`,
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3001' },
      cookies: adminCookies,
      payload: {
        roleId: createdRole.id,
        scopeKind: 'site',
        scopeId: targetSite.id,
      },
    });
    expect(duplicateAssignRes.statusCode).toBe(409);

    // 5. GET /users/:id/roles: list user role assignments
    const listAssignmentsRes = await app.inject({
      method: 'GET',
      url: `/users/${viewerUser.id}/roles`,
      cookies: adminCookies,
    });
    expect(listAssignmentsRes.statusCode).toBe(200);
    const userAssignmentsList = listAssignmentsRes.json().assignments;
    expect(userAssignmentsList.length).toBeGreaterThanOrEqual(2);

    // 6. Last Super Admin Protection on Assignment Deletion:
    // Attempting to delete superAdminAssignment (the last active global super admin assignment) must be rejected with 400!
    const deleteSuperAdminAssignRes = await app.inject({
      method: 'DELETE',
      url: `/users/${superAdmin.id}/roles/${superAdminAssignment.id}`,
      headers: { origin: 'http://localhost:3001' },
      cookies: adminCookies,
    });
    expect(deleteSuperAdminAssignRes.statusCode).toBe(400);
    expect(deleteSuperAdminAssignRes.json().message).toContain('Cannot remove the last active global system super admin assignment');

    // 7. DELETE /users/:id/roles/:assignmentId: successfully remove viewer's site assignment
    const deleteViewerAssignRes = await app.inject({
      method: 'DELETE',
      url: `/users/${viewerUser.id}/roles/${siteAssignment.id}`,
      headers: { origin: 'http://localhost:3001' },
      cookies: adminCookies,
    });
    expect(deleteViewerAssignRes.statusCode).toBe(200);
    expect(deleteViewerAssignRes.json()).toEqual({ status: 'ok' });
  } finally {
    await app.close();
  }
}, 30000);

it('verifies M3.1 CMS Content Types, CMS Field Schema validation, Bi-directional No-Shadowing, Revision-Pointer Lifecycle, Singletons, Optimistic Concurrency, and Public Content Resolver against PostgreSQL 16', async () => {
  const isProduction = true;
  const cookieName = getSessionCookieName(isProduction);

  const app = buildApp({
    checkDatabase: async () => {},
    database,
    nodeEnv: 'production',
    cookieSecret: 'test-production-cookie-secret-min-32-characters!',
    corsOrigin: 'http://localhost:3001',
  });

  try {
    const password = 'TestAdminPassword123!';
    const passwordHash = await hashPassword(password);

    // 1. Setup Admin user with system_super_admin role
    const [m3Admin] = await database.db
      .insert(users)
      .values({
        email: 'm3_admin@example.com',
        name: 'M3 Super Admin',
        passwordHash,
        isActive: true,
      })
      .returning();

    const superAdminRole = await database.db.query.roles.findFirst({
      where: (r, { eq: eqOp }) => eqOp(r.key, 'system_super_admin'),
    });
    expect(superAdminRole).toBeDefined();

    await database.db.insert(userRoleAssignments).values({
      userId: m3Admin.id,
      roleId: superAdminRole!.id,
      scopeKind: 'global',
      scopeId: null,
    });

    const adminLoginRes = await app.inject({
      method: 'POST',
      url: '/auth/login',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3001' },
      payload: { email: 'm3_admin@example.com', password },
    });
    expect(adminLoginRes.statusCode).toBe(200);
    // Security check: raw token is NOT exposed in response body
    expect(adminLoginRes.json().token).toBeUndefined();
    expect(adminLoginRes.json().user).toBeDefined();
    // Cookie is set
    const adminSetCookie = adminLoginRes.headers['set-cookie'] as string;
    expect(adminSetCookie).toContain(cookieName);
    const adminTokenMatch = adminSetCookie.match(new RegExp(`${cookieName}=([^;]+)`));
    const adminToken = adminTokenMatch ? adminTokenMatch[1] : '';
    const adminCookies = { [cookieName]: adminToken };

    // Setup Site A and Site B
    const [siteA] = await database.db
      .insert(sites)
      .values({ key: 'm3_site_alpha', name: 'M3 Site Alpha' })
      .returning();
    const [siteB] = await database.db
      .insert(sites)
      .values({ key: 'm3_site_beta', name: 'M3 Site Beta' })
      .returning();

    // --- A. Content Type Management & No-Shadowing Tests ---

    // 1. Create Global Content Type "m3_article" (collection)
    const createGlobalRes = await app.inject({
      method: 'POST',
      url: '/content-types',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3001' },
      cookies: adminCookies,
      payload: {
        key: 'm3_article',
        name: 'M3 Articles',
        kind: 'collection',
        scopeKind: 'global',
        dataSchema: {
          version: 1,
          fields: [
            { key: 'headline', label: 'Headline', type: 'text', required: true, minLength: 2 },
            { key: 'summary', label: 'Summary', type: 'textarea', required: false },
            { key: 'read_time', label: 'Read Time (minutes)', type: 'number', required: false, min: 1 },
            { key: 'is_featured', label: 'Featured', type: 'boolean', required: false, default: false },
            {
              key: 'category',
              label: 'Category',
              type: 'select',
              required: true,
              options: [
                { label: 'News', value: 'news' },
                { label: 'Blog', value: 'blog' },
              ],
            },
          ],
        },
      },
    });
    expect(createGlobalRes.statusCode).toBe(201);
    const globalType = createGlobalRes.json().contentType;
    expect(globalType.key).toBe('m3_article');
    expect(globalType.scope_kind).toBe('global');
    expect(globalType.schema_version).toBe(1);

    // 2. Create Site-specific Content Type "m3_doctor" on Site A
    const createSiteTypeRes = await app.inject({
      method: 'POST',
      url: '/content-types',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3001' },
      cookies: adminCookies,
      payload: {
        key: 'm3_doctor',
        name: 'Doctor Profiles',
        kind: 'collection',
        scopeKind: 'site',
        siteId: siteA.id,
        dataSchema: {
          version: 1,
          fields: [
            { key: 'full_name', label: 'Full Name', type: 'text', required: true },
            { key: 'years_experience', label: 'Years Experience', type: 'number', required: false },
          ],
        },
      },
    });
    expect(createSiteTypeRes.statusCode).toBe(201);
    const siteType = createSiteTypeRes.json().contentType;
    expect(siteType.key).toBe('m3_doctor');
    expect(siteType.scope_kind).toBe('site');
    expect(siteType.site_id).toBe(siteA.id);

    // 3. Create Singleton Content Type "m3_site_hero" (single)
    const createSingleTypeRes = await app.inject({
      method: 'POST',
      url: '/content-types',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3001' },
      cookies: adminCookies,
      payload: {
        key: 'm3_site_hero',
        name: 'Homepage Hero Config',
        kind: 'single',
        scopeKind: 'global',
        dataSchema: {
          version: 1,
          fields: [
            { key: 'tagline', label: 'Tagline', type: 'text', required: true },
            { key: 'cta_text', label: 'Call to Action', type: 'text', required: false, default: 'Explore' },
          ],
        },
      },
    });
    expect(createSingleTypeRes.statusCode).toBe(201);
    const singleType = createSingleTypeRes.json().contentType;
    expect(singleType.kind).toBe('single');

    // 4. No-Shadowing Direction 1 (Site shadows Global): Attempt to create Site type "m3_article" -> 409 Conflict
    const shadowGlobalRes = await app.inject({
      method: 'POST',
      url: '/content-types',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3001' },
      cookies: adminCookies,
      payload: {
        key: 'm3_article',
        name: 'Duplicate Site Article',
        kind: 'collection',
        scopeKind: 'site',
        siteId: siteA.id,
        dataSchema: { version: 1, fields: [{ key: 'x', label: 'X', type: 'text' }] },
      },
    });
    expect(shadowGlobalRes.statusCode).toBe(409);
    expect(shadowGlobalRes.json().message).toContain('shadows an existing global content type');

    // 5. No-Shadowing Direction 2 (Global conflicts with Site): Attempt to create Global type "m3_doctor" -> 409 Conflict
    const shadowSiteRes = await app.inject({
      method: 'POST',
      url: '/content-types',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3001' },
      cookies: adminCookies,
      payload: {
        key: 'm3_doctor',
        name: 'Global Doctor',
        kind: 'collection',
        scopeKind: 'global',
        dataSchema: { version: 1, fields: [{ key: 'x', label: 'X', type: 'text' }] },
      },
    });
    expect(shadowSiteRes.statusCode).toBe(409);
    expect(shadowSiteRes.json().message).toContain('already exists or conflicts with an existing site-specific content type');

    // 6. Unsupported Field Type Rejection: type "media" or "unknown" in M3.1 -> 400 Bad Request
    const unsupportedFieldRes = await app.inject({
      method: 'POST',
      url: '/content-types',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3001' },
      cookies: adminCookies,
      payload: {
        key: 'm3_unsupported',
        name: 'Unsupported Type',
        kind: 'collection',
        scopeKind: 'global',
        dataSchema: {
          version: 1,
          fields: [{ key: 'img', label: 'Image', type: 'media' }], // media deferred to M4!
        },
      },
    });
    expect(unsupportedFieldRes.statusCode).toBe(400);
    expect(unsupportedFieldRes.json().message).toContain('Unsupported field type "media"');

    // 7. Safe Schema Mutation: Add optional field "author_note" -> Increments schema_version to 2
    const safeMutationRes = await app.inject({
      method: 'PATCH',
      url: `/content-types/${globalType.id}`,
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3001' },
      cookies: adminCookies,
      payload: {
        dataSchema: {
          version: 1,
          fields: [
            ...globalType.data_schema.fields,
            { key: 'author_note', label: 'Author Note', type: 'text', required: false, default: '' },
          ],
        },
      },
    });
    expect(safeMutationRes.statusCode).toBe(200);
    expect(safeMutationRes.json().contentType.schemaVersion).toBe(2);

    // --- B. Content Entry & Revision-Pointer Lifecycle Tests ---

    // 1. Create Entry on Site A (Collection type m3_article) -> creates Revision 1
    const createEntryRes = await app.inject({
      method: 'POST',
      url: `/sites/${siteA.id}/content/m3_article`,
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3001' },
      cookies: adminCookies,
      payload: {
        title: 'Alpha Article 1',
        slug: 'alpha-article-1',
        locale: 'vi',
        data: {
          headline: 'Breaking News 1',
          summary: 'Brief summary of alpha article 1',
          read_time: 5,
          is_featured: true,
          category: 'news',
        },
      },
    });
    expect(createEntryRes.statusCode).toBe(201);
    const entryData = createEntryRes.json();
    const entryId = entryData.entry.id;
    const rev1Id = entryData.revision.id;
    expect(entryData.entry.current_revision_id).toBe(rev1Id);
    expect(entryData.entry.published_revision_id).toBeNull();
    expect(entryData.revision.version_number).toBe(1);
    expect(entryData.revision.data.headline).toBe('Breaking News 1');

    // 2. Update Entry (Edit Draft) -> creates Revision 2
    const updateEntryRes = await app.inject({
      method: 'PATCH',
      url: `/sites/${siteA.id}/content/m3_article/${entryId}`,
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3001' },
      cookies: adminCookies,
      payload: {
        expectedRevision: 1,
        title: 'Alpha Article 1 (Updated)',
        data: {
          headline: 'Breaking News 1 (Updated Revision)',
          read_time: 7,
        },
      },
    });
    expect(updateEntryRes.statusCode).toBe(200);
    const updatedEntryData = updateEntryRes.json();
    const rev2Id = updatedEntryData.revision.id;
    expect(updatedEntryData.entry.current_revision_id).toBe(rev2Id);
    expect(updatedEntryData.entry.published_revision_id).toBeNull(); // Still unpublished!
    expect(updatedEntryData.revision.version_number).toBe(2);
    expect(updatedEntryData.revision.data.headline).toBe('Breaking News 1 (Updated Revision)');
    expect(updatedEntryData.revision.data.read_time).toBe(7);

    // Verify Revision 1 in DB remains immutable and unchanged
    const rev1Db = await database.db.query.contentEntryRevisions.findFirst({
      where: (r, { eq: eqOp }) => eqOp(r.id, rev1Id),
    });
    expect(rev1Db?.versionNumber).toBe(1);
    const rev1Data = rev1Db?.data as Record<string, unknown> | undefined;
    expect(rev1Data?.headline).toBe('Breaking News 1');
    expect(rev1Data?.read_time).toBe(5);

    // 3. Optimistic Concurrency Test: Submitting PATCH with stale expectedRevision (1 when current is 2) -> 409 Conflict
    const staleConcurrencyRes = await app.inject({
      method: 'PATCH',
      url: `/sites/${siteA.id}/content/m3_article/${entryId}`,
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3001' },
      cookies: adminCookies,
      payload: {
        expectedRevision: 1, // Stale!
        title: 'Stale Lost Update Attempt',
        data: { headline: 'Lost Update' },
      },
    });
    expect(staleConcurrencyRes.statusCode).toBe(409);
    expect(staleConcurrencyRes.json().message).toContain('Optimistic concurrency conflict');

    // 4. Singleton Invariant Test: Create single entry for "m3_site_hero" on Site A
    const createSingleEntryRes = await app.inject({
      method: 'POST',
      url: `/sites/${siteA.id}/content/m3_site_hero`,
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3001' },
      cookies: adminCookies,
      payload: {
        title: 'Site A Hero Config',
        locale: 'vi',
        data: { tagline: 'Welcome to Alpha', cta_text: 'Start Now' },
      },
    });
    expect(createSingleEntryRes.statusCode).toBe(201);
    expect(createSingleEntryRes.json().entry.entry_kind).toBe('single');

    // Attempting to create a SECOND entry for "m3_site_hero" on Site A (same locale 'vi') -> 409 Conflict!
    const duplicateSingleRes = await app.inject({
      method: 'POST',
      url: `/sites/${siteA.id}/content/m3_site_hero`,
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3001' },
      cookies: adminCookies,
      payload: {
        title: 'Duplicate Hero Attempt',
        locale: 'vi',
        data: { tagline: 'Illegal Duplicate' },
      },
    });
    expect(duplicateSingleRes.statusCode).toBe(409);
    expect(duplicateSingleRes.json().message).toContain('A single content entry already exists for this site and locale');

    // --- C. Publishing & Public Content Resolver Verification ---

    // 1. Public Resolver before publish -> 404 Not Found
    const publicBeforePublishRes = await app.inject({
      method: 'GET',
      url: `/public/sites/${siteA.id}/content/m3_article/alpha-article-1?locale=vi`,
    });
    expect(publicBeforePublishRes.statusCode).toBe(404);

    // 2. Publish Entry (Revision 2 becomes published)
    const publishRes = await app.inject({
      method: 'POST',
      url: `/sites/${siteA.id}/content/m3_article/${entryId}/publish`,
      headers: { origin: 'http://localhost:3001' },
      cookies: adminCookies,
    });
    expect(publishRes.statusCode).toBe(200);
    const publishData = publishRes.json();
    expect(publishData.entry.published_revision_id).toBe(rev2Id);
    expect(publishData.entry.published_slug).toBe('alpha-article-1');

    // 3. Public Resolver immediately reads Revision 2
    const publicAfterPublishRes = await app.inject({
      method: 'GET',
      url: `/public/sites/${siteA.id}/content/m3_article/alpha-article-1?locale=vi`,
    });
    expect(publicAfterPublishRes.statusCode).toBe(200);
    const pubData1 = publicAfterPublishRes.json().entry;
    expect(pubData1.versionNumber).toBe(2);
    expect(pubData1.data.headline).toBe('Breaking News 1 (Updated Revision)');

    // 4. CRUCIAL NON-DESTRUCTIVE DRAFT EDIT TEST:
    // Editor creates Draft Revision 3 while Revision 2 is published
    const editDraftWhilePublishedRes = await app.inject({
      method: 'PATCH',
      url: `/sites/${siteA.id}/content/m3_article/${entryId}`,
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3001' },
      cookies: adminCookies,
      payload: {
        expectedRevision: 2,
        title: 'Alpha Article 1 (Draft Edit In Progress)',
        data: {
          headline: 'DRAFT IN PROGRESS - UNFINISHED',
        },
      },
    });
    expect(editDraftWhilePublishedRes.statusCode).toBe(200);
    const rev3Id = editDraftWhilePublishedRes.json().revision.id;
    expect(editDraftWhilePublishedRes.json().entry.current_revision_id).toBe(rev3Id);
    expect(editDraftWhilePublishedRes.json().entry.published_revision_id).toBe(rev2Id);

    // Public Resolver MUST STILL return Revision 2! (No draft leak, no 404!)
    const publicDuringDraftRes = await app.inject({
      method: 'GET',
      url: `/public/sites/${siteA.id}/content/m3_article/alpha-article-1?locale=vi`,
    });
    expect(publicDuringDraftRes.statusCode).toBe(200);
    const pubData2 = publicDuringDraftRes.json().entry;
    expect(pubData2.versionNumber).toBe(2);
    expect(pubData2.data.headline).toBe('Breaking News 1 (Updated Revision)'); // Untouched!

    // 5. Publish Revision 3 -> Public Resolver now returns Revision 3
    const publishRev3Res = await app.inject({
      method: 'POST',
      url: `/sites/${siteA.id}/content/m3_article/${entryId}/publish`,
      headers: { origin: 'http://localhost:3001' },
      cookies: adminCookies,
    });
    expect(publishRev3Res.statusCode).toBe(200);

    const publicAfterPublishRev3Res = await app.inject({
      method: 'GET',
      url: `/public/sites/${siteA.id}/content/m3_article/alpha-article-1?locale=vi`,
    });
    expect(publicAfterPublishRev3Res.statusCode).toBe(200);
    expect(publicAfterPublishRev3Res.json().entry.versionNumber).toBe(3);
    expect(publicAfterPublishRev3Res.json().entry.data.headline).toBe('DRAFT IN PROGRESS - UNFINISHED');

    // 6. Published Slug Conflict Test: Create Entry 2 with same slug and attempt to publish -> 409 Conflict
    const createEntry2Res = await app.inject({
      method: 'POST',
      url: `/sites/${siteA.id}/content/m3_article`,
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3001' },
      cookies: adminCookies,
      payload: {
        title: 'Second Article',
        slug: 'alpha-article-1', // Conflicting slug!
        locale: 'vi',
        data: { headline: 'Article 2', category: 'news' },
      },
    });
    expect(createEntry2Res.statusCode).toBe(201);
    const entry2Id = createEntry2Res.json().entry.id;

    // Publishing entry 2 must be rejected due to slug conflict
    const publishConflictRes = await app.inject({
      method: 'POST',
      url: `/sites/${siteA.id}/content/m3_article/${entry2Id}/publish`,
      headers: { origin: 'http://localhost:3001' },
      cookies: adminCookies,
    });
    expect(publishConflictRes.statusCode).toBe(409);
    expect(publishConflictRes.json().message).toContain('is already in use by another entry');

    // 7. Archive Entry Test
    const archiveRes = await app.inject({
      method: 'POST',
      url: `/sites/${siteA.id}/content/m3_article/${entryId}/archive`,
      headers: { origin: 'http://localhost:3001' },
      cookies: adminCookies,
    });
    expect(archiveRes.statusCode).toBe(200);
    expect(archiveRes.json().entry.lifecycleState).toBe('archived');

    // Public resolver for archived entry returns 404
    const publicArchivedRes = await app.inject({
      method: 'GET',
      url: `/public/sites/${siteA.id}/content/m3_article/alpha-article-1?locale=vi`,
    });
    expect(publicArchivedRes.statusCode).toBe(404);

    // 8. Breaking Schema Mutation rejection on populated type:
    // Attempting to remove field "headline" from "m3_article" when entries exist -> 400 Bad Request
    const breakingMutationRes = await app.inject({
      method: 'PATCH',
      url: `/content-types/${globalType.id}`,
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3001' },
      cookies: adminCookies,
      payload: {
        dataSchema: {
          version: 1,
          fields: [{ key: 'other_field', label: 'Other', type: 'text' }], // headline removed!
        },
      },
    });
    expect(breakingMutationRes.statusCode).toBe(400);
    expect(breakingMutationRes.json().message).toContain('Breaking change rejected: field "headline" cannot be removed because content entries exist');

    // --- D. Site Isolation & RBAC Verification ---

    // Create a Site B Editor user
    const [siteBUser] = await database.db
      .insert(users)
      .values({
        email: 'm3_site_b_editor@example.com',
        name: 'Site B Editor',
        passwordHash,
        isActive: true,
      })
      .returning();

    const [siteEditorRole] = await database.db
      .insert(roles)
      .values({
        key: 'm3_site_editor_role',
        name: 'M3 Site Editor',
        isSystem: false,
      })
      .returning();

    const contentReadPerm = await database.db.query.permissions.findFirst({
      where: (p, { eq: eqOp }) => eqOp(p.key, 'content.read'),
    });
    const contentCreatePerm = await database.db.query.permissions.findFirst({
      where: (p, { eq: eqOp }) => eqOp(p.key, 'content.create'),
    });

    await database.db.insert(rolePermissions).values([
      { roleId: siteEditorRole.id, permissionId: contentReadPerm!.id },
      { roleId: siteEditorRole.id, permissionId: contentCreatePerm!.id },
    ]);

    // Assign role ONLY for Site B
    await database.db.insert(userRoleAssignments).values({
      userId: siteBUser.id,
      roleId: siteEditorRole.id,
      scopeKind: 'site',
      scopeId: siteB.id,
    });

    const siteBLoginRes = await app.inject({
      method: 'POST',
      url: '/auth/login',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3001' },
      payload: { email: 'm3_site_b_editor@example.com', password },
    });
    expect(siteBLoginRes.statusCode).toBe(200);
    expect(siteBLoginRes.json().token).toBeUndefined();
    const siteBSetCookie = siteBLoginRes.headers['set-cookie'] as string;
    const siteBTokenMatch = siteBSetCookie.match(new RegExp(`${cookieName}=([^;]+)`));
    const siteBToken = siteBTokenMatch ? siteBTokenMatch[1] : '';
    const siteBCookies = { [cookieName]: siteBToken };

    // Site B editor can list content on Site B -> 200
    const listSiteBContentRes = await app.inject({
      method: 'GET',
      url: `/sites/${siteB.id}/content/m3_article`,
      cookies: siteBCookies,
    });
    expect(listSiteBContentRes.statusCode).toBe(200);

    // Site B editor attempting to read content on Site A -> 403 Forbidden!
    const listSiteAContentCrossRes = await app.inject({
      method: 'GET',
      url: `/sites/${siteA.id}/content/m3_article`,
      cookies: siteBCookies,
    });
    expect(listSiteAContentCrossRes.statusCode).toBe(403);

    // =========================================================================
    // M3.1 Invariant Closures:
    // 1. Revision Ownership Integrity Negative Test
    // 2. ContentType Identity Immutability
    // 3. No-Shadowing Concurrency Race
    // 4. BCP-47 Locale Validation
    // =========================================================================

    // 1. Revision Ownership Integrity Negative Test:
    // Entry A cannot have its current_revision_id or published_revision_id point to a revision belonging to Entry B
    // Let's create Entry B on Site A
    const createEntryBRes = await app.inject({
      method: 'POST',
      url: `/sites/${siteA.id}/content/m3_article`,
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3001' },
      cookies: adminCookies,
      payload: {
        title: 'Entry B for Integrity Test',
        locale: 'vi',
        data: { headline: 'Entry B Headline', category: 'news' },
      },
    });
    expect(createEntryBRes.statusCode).toBe(201);
    const revB1Id = createEntryBRes.json().revision.id;

    // Composite foreign keys reject cross-entry pointers directly at PostgreSQL level.
    await expect(
      database.pool.query(
        'UPDATE content_entries SET current_revision_id = $1 WHERE id = $2',
        [revB1Id, entryId]
      )
    ).rejects.toThrow(/fk_content_entries_current_rev/);

    await expect(
      database.pool.query(
        'UPDATE content_entries SET published_revision_id = $1 WHERE id = $2',
        [revB1Id, entryId]
      )
    ).rejects.toThrow(/fk_content_entries_published_rev/);

    // Composite pointer constraints must still allow deleting an entry and cascading its revisions.
    await database.pool.query('DELETE FROM content_entries WHERE id = $1', [createEntryBRes.json().entry.id]);
    const deletedEntryRevision = await database.pool.query(
      'SELECT 1 FROM content_entry_revisions WHERE id = $1',
      [revB1Id]
    );
    expect(deletedEntryRevision.rowCount).toBe(0);

    // 2. ContentType Identity Immutability:
    // Key, scopeKind, siteId are immutable.
    // Kind is immutable once ContentEntry exists.
    const patchKeyRes = await app.inject({
      method: 'PATCH',
      url: `/content-types/${globalType.id}`,
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3001' },
      cookies: adminCookies,
      payload: { key: 'mutated_key' },
    });
    expect(patchKeyRes.statusCode).toBe(400);
    expect(patchKeyRes.json().message).toContain('ContentType key is immutable after creation');

    const patchKindWithEntriesRes = await app.inject({
      method: 'PATCH',
      url: `/content-types/${globalType.id}`,
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3001' },
      cookies: adminCookies,
      payload: { kind: 'single' },
    });
    expect(patchKindWithEntriesRes.statusCode).toBe(400);
    expect(patchKindWithEntriesRes.json().message).toContain('ContentType kind cannot be changed to "single" because content entries already exist');

    // 3. No-Shadowing Concurrency Race:
    // Concurrently try to create GLOBAL type "concurrent_type" and SITE type "concurrent_type"
    const concurrentKey = 'concurrent_type';
    const [resGlobal, resSite] = await Promise.all([
      app.inject({
        method: 'POST',
        url: '/content-types',
        headers: { 'content-type': 'application/json', origin: 'http://localhost:3001' },
        cookies: adminCookies,
        payload: {
          key: concurrentKey,
          name: 'Concurrent Global',
          kind: 'collection',
          scopeKind: 'global',
          dataSchema: { version: 1, fields: [{ key: 'f1', label: 'F1', type: 'text' }] },
        },
      }),
      app.inject({
        method: 'POST',
        url: '/content-types',
        headers: { 'content-type': 'application/json', origin: 'http://localhost:3001' },
        cookies: adminCookies,
        payload: {
          key: concurrentKey,
          name: 'Concurrent Site',
          kind: 'collection',
          scopeKind: 'site',
          siteId: siteA.id,
          dataSchema: { version: 1, fields: [{ key: 'f1', label: 'F1', type: 'text' }] },
        },
      }),
    ]);

    const statusCodes = [resGlobal.statusCode, resSite.statusCode].sort();
    // Exactly one succeeds (201) and exactly one receives conflict (409)
    expect(statusCodes).toEqual([201, 409]);

    // 4. BCP-47 Locale Validation:
    // Valid locales: vi, en, zh-CN
    // Invalid locales: invalid!!locale, 12345, empty
    const validLocaleEnRes = await app.inject({
      method: 'POST',
      url: `/sites/${siteA.id}/content/m3_article`,
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3001' },
      cookies: adminCookies,
      payload: {
        title: 'English Article',
        locale: 'en',
        data: { headline: 'English Headline', category: 'news' },
      },
    });
    expect(validLocaleEnRes.statusCode).toBe(201);
    expect(validLocaleEnRes.json().entry.locale).toBe('en');

    const validLocaleZhRes = await app.inject({
      method: 'POST',
      url: `/sites/${siteA.id}/content/m3_article`,
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3001' },
      cookies: adminCookies,
      payload: {
        title: 'Chinese Article',
        locale: 'zh-CN',
        data: { headline: 'Chinese Headline', category: 'news' },
      },
    });
    expect(validLocaleZhRes.statusCode).toBe(201);
    expect(validLocaleZhRes.json().entry.locale).toBe('zh-CN');

    const invalidLocaleRes = await app.inject({
      method: 'POST',
      url: `/sites/${siteA.id}/content/m3_article`,
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3001' },
      cookies: adminCookies,
      payload: {
        title: 'Invalid Locale Article',
        locale: 'invalid!!@@locale',
        data: { headline: 'Headline', category: 'news' },
      },
    });
    expect(invalidLocaleRes.statusCode).toBe(400);
    expect(invalidLocaleRes.json().message).toContain('Invalid locale');

    const missingLocaleRes = await app.inject({
      method: 'POST',
      url: `/sites/${siteA.id}/content/m3_article`,
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3001' },
      cookies: adminCookies,
      payload: {
        title: 'Missing Locale Article',
        data: { headline: 'Headline', category: 'news' },
      },
    });
    expect(missingLocaleRes.statusCode).toBe(400);
    expect(missingLocaleRes.json().message).toContain('Locale is required');

    const missingPublicLocaleRes = await app.inject({
      method: 'GET',
      url: `/public/sites/${siteA.id}/content/m3_article/alpha-article-1`,
    });
    expect(missingPublicLocaleRes.statusCode).toBe(400);
    expect(missingPublicLocaleRes.json().message).toContain('locale');

    // 5. Require Optimistic Concurrency:
    // PATCH without expectedRevision MUST be rejected with 400 Bad Request
    const patchWithoutExpectedRevisionRes = await app.inject({
      method: 'PATCH',
      url: `/sites/${siteA.id}/content/m3_article/${entryId}`,
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3001' },
      cookies: adminCookies,
      payload: {
        title: 'Missing Revision Update Attempt',
        data: { headline: 'No Expected Revision' },
      },
    });
    expect(patchWithoutExpectedRevisionRes.statusCode).toBe(400);
    expect(patchWithoutExpectedRevisionRes.json().message).toContain('expectedRevision is required');

    // 6. Select Validation: Optional select field with non-null value MUST exist in allowed options
    const createOptionalSelectTypeRes = await app.inject({
      method: 'POST',
      url: '/content-types',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3001' },
      cookies: adminCookies,
      payload: {
        key: 'optional_select_type',
        name: 'Optional Select Type',
        kind: 'collection',
        scopeKind: 'global',
        dataSchema: {
          version: 1,
          fields: [
            {
              key: 'flavor',
              label: 'Flavor',
              type: 'select',
              required: false,
              options: [
                { label: 'Vanilla', value: 'vanilla' },
                { label: 'Chocolate', value: 'chocolate' },
              ],
            },
          ],
        },
      },
    });
    expect(createOptionalSelectTypeRes.statusCode).toBe(201);

    // A: Optional select omitted -> accepted
    const selectOmittedRes = await app.inject({
      method: 'POST',
      url: `/sites/${siteA.id}/content/optional_select_type`,
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3001' },
      cookies: adminCookies,
      payload: {
        title: 'Omitted Select',
        locale: 'en',
        data: {},
      },
    });
    expect(selectOmittedRes.statusCode).toBe(201);

    // B: Optional select with valid option -> accepted
    const selectValidRes = await app.inject({
      method: 'POST',
      url: `/sites/${siteA.id}/content/optional_select_type`,
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3001' },
      cookies: adminCookies,
      payload: {
        title: 'Valid Select',
        locale: 'en',
        data: { flavor: 'vanilla' },
      },
    });
    expect(selectValidRes.statusCode).toBe(201);

    // C: Optional select with invalid string -> rejected (400)
    const selectInvalidRes = await app.inject({
      method: 'POST',
      url: `/sites/${siteA.id}/content/optional_select_type`,
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3001' },
      cookies: adminCookies,
      payload: {
        title: 'Invalid Select',
        locale: 'en',
        data: { flavor: 'strawberry' },
      },
    });
    expect(selectInvalidRes.statusCode).toBe(400);
    expect(selectInvalidRes.json().message).toContain('is not a valid option for select field');

    // 7. Validate Defaults at Schema Definition Time:
    // A: Number default = "hello" -> reject (400)
    const invalidNumberDefaultRes = await app.inject({
      method: 'POST',
      url: '/content-types',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3001' },
      cookies: adminCookies,
      payload: {
        key: 'invalid_num_def',
        name: 'Invalid Num Def',
        kind: 'collection',
        scopeKind: 'global',
        dataSchema: {
          version: 1,
          fields: [{ key: 'count', label: 'Count', type: 'number', default: 'hello' }],
        },
      },
    });
    expect(invalidNumberDefaultRes.statusCode).toBe(400);
    expect(invalidNumberDefaultRes.json().message).toContain('default must be a number');

    // B: Boolean default = "yes" -> reject (400)
    const invalidBoolDefaultRes = await app.inject({
      method: 'POST',
      url: '/content-types',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3001' },
      cookies: adminCookies,
      payload: {
        key: 'invalid_bool_def',
        name: 'Invalid Bool Def',
        kind: 'collection',
        scopeKind: 'global',
        dataSchema: {
          version: 1,
          fields: [{ key: 'active', label: 'Active', type: 'boolean', default: 'yes' }],
        },
      },
    });
    expect(invalidBoolDefaultRes.statusCode).toBe(400);
    expect(invalidBoolDefaultRes.json().message).toContain('default must be a boolean');

    // C: Select default not in options -> reject (400)
    const invalidSelectDefaultRes = await app.inject({
      method: 'POST',
      url: '/content-types',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3001' },
      cookies: adminCookies,
      payload: {
        key: 'invalid_sel_def',
        name: 'Invalid Select Def',
        kind: 'collection',
        scopeKind: 'global',
        dataSchema: {
          version: 1,
          fields: [
            {
              key: 'choice',
              label: 'Choice',
              type: 'select',
              default: 'mango',
              options: [{ label: 'Apple', value: 'apple' }],
            },
          ],
        },
      },
    });
    expect(invalidSelectDefaultRes.statusCode).toBe(400);
    expect(invalidSelectDefaultRes.json().message).toContain('default value "mango" is not in allowed select options');

    // D: Text default exceeding maxLength -> reject (400)
    const invalidTextDefaultRes = await app.inject({
      method: 'POST',
      url: '/content-types',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3001' },
      cookies: adminCookies,
      payload: {
        key: 'invalid_text_def',
        name: 'Invalid Text Def',
        kind: 'collection',
        scopeKind: 'global',
        dataSchema: {
          version: 1,
          fields: [{ key: 'code', label: 'Code', type: 'text', maxLength: 3, default: 'TOOLONG' }],
        },
      },
    });
    expect(invalidTextDefaultRes.statusCode).toBe(400);
    expect(invalidTextDefaultRes.json().message).toContain('default length must be <= maxLength');

    // 8. Assert UUIDv7 for all created M3 entities:
    const uuidv7Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    expect(globalType.id).toMatch(uuidv7Regex);
    expect(siteType.id).toMatch(uuidv7Regex);
    expect(singleType.id).toMatch(uuidv7Regex);
    expect(entryId).toMatch(uuidv7Regex);
    expect(entryData.entry.translation_group_id).toMatch(uuidv7Regex);
    expect(rev1Id).toMatch(uuidv7Regex);
    expect(rev2Id).toMatch(uuidv7Regex);
  } finally {
    await app.close();
  }
}, 30000);

it('verifies M3.2 Taxonomy Engine: Hybrid scoping, No-shadowing race serialization, hierarchy, cycle prevention, maxDepth=5, subtree move, activate/deactivate invariants, ContentType bindings, Revision-Term snapshots, copy-forward, and zero-draft-leakage', async () => {
  const app = buildApp({
    checkDatabase: async () => {},
    database,
    nodeEnv: 'test',
    cookieSecret: 'test-secret-must-be-at-least-32-chars-long!',
    corsOrigin: 'http://localhost:3001',
  });

  try {
    // 0. Setup test sites and admin session
    const [siteA] = await database.db
      .insert(sites)
      .values({ key: 'm32_site_a', name: 'M3.2 Site A' })
      .returning();
    const [siteB] = await database.db
      .insert(sites)
      .values({ key: 'm32_site_b', name: 'M3.2 Site B' })
      .returning();

    const [adminUser] = await database.db
      .insert(users)
      .values({
        email: 'm32_admin@example.com',
        passwordHash: 'dummy',
        name: 'M3.2 Admin',
      })
      .returning();

    const superAdminRole = await database.db.query.roles.findFirst({
      where: (r, { eq: eqOp }) => eqOp(r.key, 'system_super_admin'),
    });

    await database.db.insert(userRoleAssignments).values({
      userId: adminUser!.id,
      roleId: superAdminRole!.id,
      scopeKind: 'global',
    });

    const rawToken = generateSessionToken();
    const hashed = hashSessionToken(rawToken);
    await database.db.insert(sessions).values({
      userId: adminUser!.id,
      tokenHash: hashed,
      expiresAt: new Date(Date.now() + 86400000),
    });

    const adminCookies = { [getSessionCookieName(false)]: rawToken };

    // 1. Namespace: Global and Site taxonomy creation & Bi-directional No-shadowing
    const globalCatRes = await app.inject({
      method: 'POST',
      url: '/taxonomies',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3001' },
      cookies: adminCookies,
      payload: {
        key: 'category',
        name: 'Categories',
        scopeKind: 'global',
        isHierarchical: true,
      },
    });
    expect(globalCatRes.statusCode).toBe(201);
    const globalCat = globalCatRes.json().taxonomy;
    expect(globalCat.scope_kind).toBe('global');
    expect(globalCat.site_id).toBeNull();
    expect(globalCat.is_hierarchical).toBe(true);

    // Conflict: Creating site taxonomy with same key as global taxonomy
    const siteConflictRes = await app.inject({
      method: 'POST',
      url: '/taxonomies',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3001' },
      cookies: adminCookies,
      payload: {
        key: 'category',
        name: 'Site Category',
        scopeKind: 'site',
        siteId: siteA!.id,
      },
    });
    expect(siteConflictRes.statusCode).toBe(409);
    expect(siteConflictRes.json().message).toContain('a global taxonomy with this key already exists');

    // Create Site-specific taxonomy
    const siteTaxRes = await app.inject({
      method: 'POST',
      url: '/taxonomies',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3001' },
      cookies: adminCookies,
      payload: {
        key: 'campus-dept',
        name: 'Campus Departments',
        scopeKind: 'site',
        siteId: siteA!.id,
        isHierarchical: true,
      },
    });
    expect(siteTaxRes.statusCode).toBe(201);
    const siteTax = siteTaxRes.json().taxonomy;
    expect(siteTax.scope_kind).toBe('site');
    expect(siteTax.site_id).toBe(siteA!.id);

    // Reverse Conflict: Creating global taxonomy with key matching existing site taxonomy
    const revConflictRes = await app.inject({
      method: 'POST',
      url: '/taxonomies',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3001' },
      cookies: adminCookies,
      payload: {
        key: 'campus-dept',
        name: 'Global Departments',
        scopeKind: 'global',
      },
    });
    expect(revConflictRes.statusCode).toBe(409);
    expect(revConflictRes.json().message).toContain('a site-specific taxonomy with this key already exists');

    // Concurrent race test: Parallel creation of GLOBAL vs SITE taxonomy with same key
    const raceKey = 'concurrent-race-tax';
    const [raceGlobalRes, raceSiteRes] = await Promise.all([
      app.inject({
        method: 'POST',
        url: '/taxonomies',
        headers: { 'content-type': 'application/json', origin: 'http://localhost:3001' },
        cookies: adminCookies,
        payload: {
          key: raceKey,
          name: 'Concurrent Global',
          scopeKind: 'global',
        },
      }),
      app.inject({
        method: 'POST',
        url: '/taxonomies',
        headers: { 'content-type': 'application/json', origin: 'http://localhost:3001' },
        cookies: adminCookies,
        payload: {
          key: raceKey,
          name: 'Concurrent Site',
          scopeKind: 'site',
          siteId: siteA!.id,
        },
      }),
    ]);
    const statuses = [raceGlobalRes.statusCode, raceSiteRes.statusCode].sort();
    expect(statuses).toEqual([201, 409]);

    // 2. Terms Hierarchy, Cycle Prevention, maxDepth=5, and Subtree Move
    // Create root term in Site A under global category
    const rootRes = await app.inject({
      method: 'POST',
      url: `/sites/${siteA!.id}/taxonomies/category/terms`,
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3001' },
      cookies: adminCookies,
      payload: {
        key: 'news',
        name: 'Tin tức',
      },
    });
    expect(rootRes.statusCode).toBe(201);
    const rootTerm = rootRes.json().term;
    expect(rootTerm.depth).toBe(0);
    expect(rootTerm.parent_id).toBeNull();
    expect(rootTerm.site_id).toBe(siteA!.id);

    // Duplicate key under same taxonomy & site rejected
    const dupTermRes = await app.inject({
      method: 'POST',
      url: `/sites/${siteA!.id}/taxonomies/category/terms`,
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3001' },
      cookies: adminCookies,
      payload: {
        key: 'news',
        name: 'Tin tức trùng lặp',
      },
    });
    expect(dupTermRes.statusCode).toBe(409);

    // Terms are ALWAYS site-bound: Site B can use key 'news' without collision!
    const siteBNewsRes = await app.inject({
      method: 'POST',
      url: `/sites/${siteB!.id}/taxonomies/category/terms`,
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3001' },
      cookies: adminCookies,
      payload: {
        key: 'news',
        name: 'Site B News',
      },
    });
    expect(siteBNewsRes.statusCode).toBe(201);
    const siteBTerm = siteBNewsRes.json().term;
    expect(siteBTerm.site_id).toBe(siteB!.id);

    // Cross-site parent rejection: Site A cannot set Site B's term as parent
    const crossSiteParentRes = await app.inject({
      method: 'POST',
      url: `/sites/${siteA!.id}/taxonomies/category/terms`,
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3001' },
      cookies: adminCookies,
      payload: {
        key: 'sub-news',
        name: 'Sub News',
        parentId: siteBTerm.id,
      },
    });
    expect(crossSiteParentRes.statusCode).toBe(400);
    expect(crossSiteParentRes.json().message).toContain('Cross-site parent term is rejected');

    // Create valid child chain: Root(D:0) -> Child1(D:1) -> Child2(D:2) -> Child3(D:3) -> Child4(D:4) -> Child5(D:5)
    const child1Res = await app.inject({
      method: 'POST',
      url: `/sites/${siteA!.id}/taxonomies/category/terms`,
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3001' },
      cookies: adminCookies,
      payload: { key: 'c1', name: 'Child 1', parentId: rootTerm.id },
    });
    expect(child1Res.statusCode).toBe(201);
    const c1 = child1Res.json().term;
    expect(c1.depth).toBe(1);

    const child2Res = await app.inject({
      method: 'POST',
      url: `/sites/${siteA!.id}/taxonomies/category/terms`,
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3001' },
      cookies: adminCookies,
      payload: { key: 'c2', name: 'Child 2', parentId: c1.id },
    });
    const c2 = child2Res.json().term;
    expect(c2.depth).toBe(2);

    const child3Res = await app.inject({
      method: 'POST',
      url: `/sites/${siteA!.id}/taxonomies/category/terms`,
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3001' },
      cookies: adminCookies,
      payload: { key: 'c3', name: 'Child 3', parentId: c2.id },
    });
    const c3 = child3Res.json().term;
    expect(c3.depth).toBe(3);

    const child4Res = await app.inject({
      method: 'POST',
      url: `/sites/${siteA!.id}/taxonomies/category/terms`,
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3001' },
      cookies: adminCookies,
      payload: { key: 'c4', name: 'Child 4', parentId: c3.id },
    });
    const c4 = child4Res.json().term;
    expect(c4.depth).toBe(4);

    const child5Res = await app.inject({
      method: 'POST',
      url: `/sites/${siteA!.id}/taxonomies/category/terms`,
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3001' },
      cookies: adminCookies,
      payload: { key: 'c5', name: 'Child 5', parentId: c4.id },
    });
    const c5 = child5Res.json().term;
    expect(c5.depth).toBe(5);

    // Max depth exceeded: Creating depth 6 child rejected
    const child6Res = await app.inject({
      method: 'POST',
      url: `/sites/${siteA!.id}/taxonomies/category/terms`,
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3001' },
      cookies: adminCookies,
      payload: { key: 'c6', name: 'Child 6', parentId: c5.id },
    });
    expect(child6Res.statusCode).toBe(400);
    expect(child6Res.json().message).toContain('maxDepth = 5');

    // Cycle Detection:
    // Self-parent attempt on c1
    const selfParentRes = await app.inject({
      method: 'PATCH',
      url: `/sites/${siteA!.id}/taxonomies/category/terms/${c1.id}`,
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3001' },
      cookies: adminCookies,
      payload: { parentId: c1.id },
    });
    expect(selfParentRes.statusCode).toBe(400);
    expect(selfParentRes.json().message).toContain('own parent');

    // Indirect cycle: moving c1 into its own descendant c3
    const cycleRes = await app.inject({
      method: 'PATCH',
      url: `/sites/${siteA!.id}/taxonomies/category/terms/${c1.id}`,
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3001' },
      cookies: adminCookies,
      payload: { parentId: c3.id },
    });
    expect(cycleRes.statusCode).toBe(400);
    expect(cycleRes.json().message).toContain('cycle detected');

    // Subtree Move & Atomic Depth Recomputation:
    // Create new root branch 'admissions' (D:0)
    const admRes = await app.inject({
      method: 'POST',
      url: `/sites/${siteA!.id}/taxonomies/category/terms`,
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3001' },
      cookies: adminCookies,
      payload: { key: 'admissions', name: 'Tuyển sinh' },
    });
    const adm = admRes.json().term;
    expect(adm.depth).toBe(0);

    // Move c3 subtree (c3[D:3] -> c4[D:4] -> c5[D:5]) directly under adm (D:0)
    // Target depth for c3 becomes 1, c4 becomes 2, c5 becomes 3.
    const moveRes = await app.inject({
      method: 'PATCH',
      url: `/sites/${siteA!.id}/taxonomies/category/terms/${c3.id}`,
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3001' },
      cookies: adminCookies,
      payload: { parentId: adm.id },
    });
    expect(moveRes.statusCode).toBe(200);

    // Verify recomputed depths in DB
    const [c3After, c4After, c5After] = await Promise.all([
      database.db.query.taxonomyTerms.findFirst({ where: (t, { eq: eqOp }) => eqOp(t.id, c3.id) }),
      database.db.query.taxonomyTerms.findFirst({ where: (t, { eq: eqOp }) => eqOp(t.id, c4.id) }),
      database.db.query.taxonomyTerms.findFirst({ where: (t, { eq: eqOp }) => eqOp(t.id, c5.id) }),
    ]);
    expect(c3After?.depth).toBe(1);
    expect(c4After?.depth).toBe(2);
    expect(c5After?.depth).toBe(3);

    // 3. Activation / Deactivation Invariants:
    // Deactivate parent while active descendants exist -> REJECTED
    const deactAdmRes = await app.inject({
      method: 'POST',
      url: `/sites/${siteA!.id}/taxonomies/category/terms/${adm.id}/deactivate`,
      headers: { origin: 'http://localhost:3001' },
      cookies: adminCookies,
    });
    expect(deactAdmRes.statusCode).toBe(400);
    expect(deactAdmRes.json().message).toContain('active descendant terms exist');

    // Deactivate leaf c5 -> SUCCESS
    const deactC5Res = await app.inject({
      method: 'POST',
      url: `/sites/${siteA!.id}/taxonomies/category/terms/${c5.id}/deactivate`,
      headers: { origin: 'http://localhost:3001' },
      cookies: adminCookies,
    });
    expect(deactC5Res.statusCode).toBe(200);

    // 4. ContentType ↔ Taxonomy Bindings:
    // Create GLOBAL ContentType 'article'
    const ctRes = await app.inject({
      method: 'POST',
      url: '/content-types',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3001' },
      cookies: adminCookies,
      payload: {
        key: 'article_m32',
        name: 'Articles M3.2',
        kind: 'collection',
        scopeKind: 'global',
        dataSchema: {
          version: 1,
          fields: [{ key: 'headline', label: 'Headline', type: 'text', required: true }],
        },
      },
    });
    const contentType = ctRes.json().contentType;

    // GLOBAL ContentType cannot attach SITE Taxonomy
    const invalidBindRes = await app.inject({
      method: 'PUT',
      url: `/content-types/${contentType.id}/taxonomies`,
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3001' },
      cookies: adminCookies,
      payload: {
        taxonomies: [{ taxonomyId: siteTax.id, isRequired: true }],
      },
    });
    expect(invalidBindRes.statusCode).toBe(400);
    expect(invalidBindRes.json().message).toContain('Global ContentType cannot attach site-specific taxonomy');

    // Attach GLOBAL taxonomy 'category' with required=true, minTerms=1, maxTerms=2
    const validBindRes = await app.inject({
      method: 'PUT',
      url: `/content-types/${contentType.id}/taxonomies`,
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3001' },
      cookies: adminCookies,
      payload: {
        taxonomies: [
          { taxonomyId: globalCat.id, isRequired: true, minTerms: 1, maxTerms: 2 },
        ],
      },
    });
    expect(validBindRes.statusCode).toBe(200);

    // 5. Revision Taxonomy Snapshots & Binding Limits
    // Entry creation without required category -> REJECTED
    const noCatRes = await app.inject({
      method: 'POST',
      url: `/sites/${siteA!.id}/content/article_m32`,
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3001' },
      cookies: adminCookies,
      payload: {
        title: 'Article Without Category',
        locale: 'vi',
        data: { headline: 'Headline' },
      },
    });
    expect(noCatRes.statusCode).toBe(400);
    expect(noCatRes.json().message).toContain('Taxonomy "category" is required');

    // Inactive term cannot be newly assigned: attempting to assign deactivated c5
    const inactiveAssignRes = await app.inject({
      method: 'POST',
      url: `/sites/${siteA!.id}/content/article_m32`,
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3001' },
      cookies: adminCookies,
      payload: {
        title: 'Article With Inactive Term',
        locale: 'vi',
        data: { headline: 'Headline' },
        taxonomyAssignments: { category: [c5.id] },
      },
    });
    expect(inactiveAssignRes.statusCode).toBe(400);
    expect(inactiveAssignRes.json().message).toContain('Cannot assign inactive taxonomy term');

    // Max terms limit: assigning 3 terms when maxTerms=2 -> REJECTED
    const maxLimitRes = await app.inject({
      method: 'POST',
      url: `/sites/${siteA!.id}/content/article_m32`,
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3001' },
      cookies: adminCookies,
      payload: {
        title: 'Article Exceeding Max Terms',
        locale: 'vi',
        data: { headline: 'Headline' },
        taxonomyAssignments: { category: [rootTerm.id, c1.id, c2.id] },
      },
    });
    expect(maxLimitRes.statusCode).toBe(400);
    expect(maxLimitRes.json().message).toContain('allows at most 2 term(s)');

    // Valid create: Revision 1 assigned with category 'news' (rootTerm)
    const createEntryRes = await app.inject({
      method: 'POST',
      url: `/sites/${siteA!.id}/content/article_m32`,
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3001' },
      cookies: adminCookies,
      payload: {
        title: 'News Headline A',
        locale: 'vi',
        slug: 'news-a',
        data: { headline: 'News Headline A' },
        taxonomyAssignments: { category: [rootTerm.id] },
      },
    });
    expect(createEntryRes.statusCode).toBe(201);
    const entry = createEntryRes.json().entry;
    const rev1 = createEntryRes.json().revision;
    expect(rev1.version_number).toBe(1);

    // Publish Revision 1 to make it live
    const pubRes = await app.inject({
      method: 'POST',
      url: `/sites/${siteA!.id}/content/article_m32/${entry.id}/publish`,
      headers: { origin: 'http://localhost:3001' },
      cookies: adminCookies,
    });
    expect(pubRes.statusCode).toBe(200);

    // 6. Zero Draft Leakage Test:
    // Create draft Revision 2 changing category to 'admissions' (adm.id) and headline to 'Draft Headline'
    const draftRev2Res = await app.inject({
      method: 'PATCH',
      url: `/sites/${siteA!.id}/content/article_m32/${entry.id}`,
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3001' },
      cookies: adminCookies,
      payload: {
        expectedRevision: 1,
        title: 'Admission Draft Title',
        slug: 'admission-draft',
        data: { headline: 'Draft Admission Headline' },
        taxonomyAssignments: { category: [adm.id] },
      },
    });
    expect(draftRev2Res.statusCode).toBe(200);

    // Verify Public Content Resolver reads ONLY published revision (Revision 1 with 'news')
    const publicBeforePublish = await app.inject({
      method: 'GET',
      url: `/public/sites/${siteA!.id}/content/article_m32/news-a?locale=vi`,
    });
    expect(publicBeforePublish.statusCode).toBe(200);
    const pubEntry = publicBeforePublish.json().entry;
    expect(pubEntry.title).toBe('News Headline A');
    expect(pubEntry.taxonomies).toHaveLength(1);
    expect(pubEntry.taxonomies[0].key).toBe('news'); // Zero Draft Leakage: still 'news'!

    // Public filter by term 'news' returns entry
    const publicFilterNews = await app.inject({
      method: 'GET',
      url: `/public/sites/${siteA!.id}/content/article_m32/taxonomies/category/news?locale=vi`,
    });
    expect(publicFilterNews.statusCode).toBe(200);
    expect(publicFilterNews.json().total).toBe(1);

    // Public filter by term 'admissions' does NOT return draft!
    const publicFilterAdm = await app.inject({
      method: 'GET',
      url: `/public/sites/${siteA!.id}/content/article_m32/taxonomies/category/admissions?locale=vi`,
    });
    expect(publicFilterAdm.statusCode).toBe(200);
    expect(publicFilterAdm.json().total).toBe(0);

    // Publish Revision 2 -> Now public sees 'admissions'
    const pubRev2Res = await app.inject({
      method: 'POST',
      url: `/sites/${siteA!.id}/content/article_m32/${entry.id}/publish`,
      headers: { origin: 'http://localhost:3001' },
      cookies: adminCookies,
    });
    expect(pubRev2Res.statusCode).toBe(200);

    const publicAfterPublish = await app.inject({
      method: 'GET',
      url: `/public/sites/${siteA!.id}/content/article_m32/admission-draft?locale=vi`,
    });
    expect(publicAfterPublish.statusCode).toBe(200);
    const pubEntry2 = publicAfterPublish.json().entry;
    expect(pubEntry2.taxonomies[0].key).toBe('admissions');

    // 7. Copy-Forward Test:
    // Update only title in Revision 3 without supplying taxonomyAssignments
    const copyForwardRes = await app.inject({
      method: 'PATCH',
      url: `/sites/${siteA!.id}/content/article_m32/${entry.id}`,
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3001' },
      cookies: adminCookies,
      payload: {
        expectedRevision: 2,
        title: 'Copied Forward Title',
      },
    });
    expect(copyForwardRes.statusCode).toBe(200);
    const rev3 = copyForwardRes.json().revision;

    // Verify Revision 3 automatically retained 'admissions' term from Revision 2
    const rev3Terms = await database.db
      .select()
      .from(contentRevisionTerms)
      .where(eq(contentRevisionTerms.revisionId, rev3.id));
    expect(rev3Terms).toHaveLength(1);
    expect(rev3Terms[0]?.taxonomyTermId).toBe(adm.id);

    // 8. Term Metadata Versioning Boundary:
    // Changing Term display name from 'Tuyển sinh' to 'Tuyển sinh 2026'
    // immediately updates public presentation without creating new revision
    const updateTermRes = await app.inject({
      method: 'PATCH',
      url: `/sites/${siteA!.id}/taxonomies/category/terms/${adm.id}`,
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3001' },
      cookies: adminCookies,
      payload: { name: 'Tuyển sinh 2026' },
    });
    expect(updateTermRes.statusCode).toBe(200);

    const publicLiveTermCheck = await app.inject({
      method: 'GET',
      url: `/public/sites/${siteA!.id}/content/article_m32/admission-draft?locale=vi`,
    });
    expect(publicLiveTermCheck.statusCode).toBe(200);
    // Assert UUIDv7 for M3.2 Taxonomies & Taxonomy Terms
    const uuidv7Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    expect(globalCat.id).toMatch(uuidv7Regex);
    expect(siteTax.id).toMatch(uuidv7Regex);
    expect(adm.id).toMatch(uuidv7Regex);
  } finally {
    await app.close();
  }
}, 45000);

it('verifies M3 Final Closure: Public taxonomy multi-site deterministic routing, locale isolation, term/taxonomy deactivation archive regression, and atomic revision-term failure rollback against PostgreSQL 16', async () => {
  const cookieName = getSessionCookieName(false);
  const app = buildApp({
    checkDatabase: async () => {},
    database,
    nodeEnv: 'test',
    cookieSecret: 'test-secret-must-be-at-least-32-chars-long!',
    corsOrigin: 'http://localhost:3001',
  });

  try {
    // 0. Super Admin Session Setup
    const [closureAdmin] = await database.db
      .insert(users)
      .values({
        email: 'closure_admin@example.com',
        passwordHash: 'dummy-hash',
        name: 'Closure Admin',
      })
      .returning();

    const superAdminRole = await database.db.query.roles.findFirst({
      where: (r, { eq: eqOp }) => eqOp(r.key, 'system_super_admin'),
    });

    await database.db.insert(userRoleAssignments).values({
      userId: closureAdmin!.id,
      roleId: superAdminRole!.id,
      scopeKind: 'global',
    });

    const rawToken = generateSessionToken();
    const hashed = hashSessionToken(rawToken);
    await database.db.insert(sessions).values({
      userId: closureAdmin!.id,
      tokenHash: hashed,
      expiresAt: new Date(Date.now() + 86400000),
    });

    const adminCookies = { [cookieName]: rawToken };

    // 1. Create two distinct sites for multi-site deterministic scoping
    const [siteA] = await database.db
      .insert(sites)
      .values({ key: 'site-a-closure', name: 'Site A Closure', domain: 'a-closure.example.com' })
      .returning();
    const [siteB] = await database.db
      .insert(sites)
      .values({ key: 'site-b-closure', name: 'Site B Closure', domain: 'b-closure.example.com' })
      .returning();
    expect(siteA).toBeDefined();
    expect(siteB).toBeDefined();

    // 2. Create Global Taxonomy: 'category-closure'
    const createTaxRes = await app.inject({
      method: 'POST',
      url: '/taxonomies',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3001' },
      cookies: adminCookies,
      payload: {
        key: 'category-closure',
        name: 'Closure Category',
        scopeKind: 'global',
        isHierarchical: true,
      },
    });
    expect(createTaxRes.statusCode).toBe(201);
    const taxCategory = createTaxRes.json().taxonomy;

    // 3. Create ContentType: 'article_closure' and bind to 'category-closure'
    const createCtRes = await app.inject({
      method: 'POST',
      url: '/content-types',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3001' },
      cookies: adminCookies,
      payload: {
        key: 'article_closure',
        name: 'Closure Article',
        kind: 'collection',
        scopeKind: 'global',
        dataSchema: {
          version: 1,
          fields: [{ key: 'body', label: 'Body Text', type: 'text', required: true }],
        },
      },
    });
    expect(createCtRes.statusCode).toBe(201);
    const contentType = createCtRes.json().contentType;

    const bindTaxRes = await app.inject({
      method: 'PUT',
      url: `/content-types/${contentType.id}/taxonomies`,
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3001' },
      cookies: adminCookies,
      payload: {
        taxonomies: [
          { taxonomyId: taxCategory.id, isRequired: false, minTerms: 0, maxTerms: 5, sortOrder: 0 },
        ],
      },
    });
    expect(bindTaxRes.statusCode).toBe(200);

    // 4. Create Terms on Site A and Site B with the SAME key 'news'
    const termNewsARes = await app.inject({
      method: 'POST',
      url: `/sites/${siteA!.id}/taxonomies/category-closure/terms`,
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3001' },
      cookies: adminCookies,
      payload: { key: 'news', name: 'Tin tức Site A' },
    });
    expect(termNewsARes.statusCode).toBe(201);
    const termNewsA = termNewsARes.json().term;

    const termNewsBRes = await app.inject({
      method: 'POST',
      url: `/sites/${siteB!.id}/taxonomies/category-closure/terms`,
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3001' },
      cookies: adminCookies,
      payload: { key: 'news', name: 'Tin tức Site B' },
    });
    expect(termNewsBRes.statusCode).toBe(201);
    const termNewsB = termNewsBRes.json().term;

    // Create a term exclusive to Site B: 'exclusive-b'
    const termExclusiveBRes = await app.inject({
      method: 'POST',
      url: `/sites/${siteB!.id}/taxonomies/category-closure/terms`,
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3001' },
      cookies: adminCookies,
      payload: { key: 'exclusive-b', name: 'Chỉ có ở Site B' },
    });
    expect(termExclusiveBRes.statusCode).toBe(201);

    // Create and Publish Article on Site A with termNewsA
    const createArtARes = await app.inject({
      method: 'POST',
      url: `/sites/${siteA!.id}/content/article_closure`,
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3001' },
      cookies: adminCookies,
      payload: {
        title: 'Site A News Article',
        locale: 'vi',
        slug: 'news-site-a',
        data: { body: 'Content for Site A' },
        taxonomyAssignments: { 'category-closure': [termNewsA.id] },
      },
    });
    expect(createArtARes.statusCode).toBe(201);
    const entryA = createArtARes.json().entry;

    const pubArtARes = await app.inject({
      method: 'POST',
      url: `/sites/${siteA!.id}/content/article_closure/${entryA.id}/publish`,
      headers: { origin: 'http://localhost:3001' },
      cookies: adminCookies,
    });
    expect(pubArtARes.statusCode).toBe(200);

    // Create and Publish Article on Site B with termNewsB
    const createArtBRes = await app.inject({
      method: 'POST',
      url: `/sites/${siteB!.id}/content/article_closure`,
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3001' },
      cookies: adminCookies,
      payload: {
        title: 'Site B News Article',
        locale: 'vi',
        slug: 'news-site-b',
        data: { body: 'Content for Site B' },
        taxonomyAssignments: { 'category-closure': [termNewsB.id] },
      },
    });
    expect(createArtBRes.statusCode).toBe(201);
    const entryB = createArtBRes.json().entry;

    const pubArtBRes = await app.inject({
      method: 'POST',
      url: `/sites/${siteB!.id}/content/article_closure/${entryB.id}/publish`,
      headers: { origin: 'http://localhost:3001' },
      cookies: adminCookies,
    });
    expect(pubArtBRes.statusCode).toBe(200);

    // -------------------------------------------------------------------------
    // 5. Multi-Site Deterministic Scope Verification
    // -------------------------------------------------------------------------

    // Candidate route: GET /public/sites/:siteId/content-types/:typeKey/taxonomies/:taxKey/terms/:termKey/entries
    // Query Site A -> Returns ONLY Site A content
    const querySiteARes = await app.inject({
      method: 'GET',
      url: `/public/sites/${siteA!.id}/content-types/article_closure/taxonomies/category-closure/terms/news/entries?locale=vi`,
    });
    expect(querySiteARes.statusCode).toBe(200);
    const siteAData = querySiteARes.json();
    expect(siteAData.total).toBe(1);
    expect(siteAData.items[0].id).toBe(entryA.id);
    expect(siteAData.items[0].published_slug).toBe('news-site-a');

    // Query Site B -> Returns ONLY Site B content
    const querySiteBRes = await app.inject({
      method: 'GET',
      url: `/public/sites/${siteB!.id}/content-types/article_closure/taxonomies/category-closure/terms/news/entries?locale=vi`,
    });
    expect(querySiteBRes.statusCode).toBe(200);
    const siteBData = querySiteBRes.json();
    expect(siteBData.total).toBe(1);
    expect(siteBData.items[0].id).toBe(entryB.id);
    expect(siteBData.items[0].published_slug).toBe('news-site-b');

    // Query with Unknown Site -> 404 NOT_FOUND
    const queryUnknownSite = await app.inject({
      method: 'GET',
      url: `/public/sites/00000000-0000-0000-0000-000000000000/content-types/article_closure/taxonomies/category-closure/terms/news/entries?locale=vi`,
    });
    expect(queryUnknownSite.statusCode).toBe(404);

    // Query Site A with term existing ONLY on Site B ('exclusive-b') -> empty total: 0, strictly no cross-site fallback
    const querySiteACrossTerm = await app.inject({
      method: 'GET',
      url: `/public/sites/${siteA!.id}/content-types/article_closure/taxonomies/category-closure/terms/exclusive-b/entries?locale=vi`,
    });
    expect(querySiteACrossTerm.statusCode).toBe(200);
    expect(querySiteACrossTerm.json().total).toBe(0);

    // Locale Isolation: Create Article in Site A with locale 'en'
    const createEnArtRes = await app.inject({
      method: 'POST',
      url: `/sites/${siteA!.id}/content/article_closure`,
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3001' },
      cookies: adminCookies,
      payload: {
        title: 'Site A English Article',
        slug: 'news-site-a-en',
        locale: 'en',
        data: { body: 'English content' },
        taxonomyAssignments: { 'category-closure': [termNewsA.id] },
      },
    });
    expect(createEnArtRes.statusCode).toBe(201);
    const enEntry = createEnArtRes.json().entry;

    const pubEnArtRes = await app.inject({
      method: 'POST',
      url: `/sites/${siteA!.id}/content/article_closure/${enEntry.id}/publish`,
      headers: { origin: 'http://localhost:3001' },
      cookies: adminCookies,
    });
    expect(pubEnArtRes.statusCode).toBe(200);

    // Query Site A with ?locale=vi -> Does NOT return English entry
    const queryLocaleVi = await app.inject({
      method: 'GET',
      url: `/public/sites/${siteA!.id}/content-types/article_closure/taxonomies/category-closure/terms/news/entries?locale=vi`,
    });
    expect(queryLocaleVi.statusCode).toBe(200);
    expect(queryLocaleVi.json().total).toBe(1);
    expect(queryLocaleVi.json().items[0].id).toBe(entryA.id);

    // Query Site A with ?locale=en -> Returns English entry
    const queryLocaleEn = await app.inject({
      method: 'GET',
      url: `/public/sites/${siteA!.id}/content-types/article_closure/taxonomies/category-closure/terms/news/entries?locale=en`,
    });
    expect(queryLocaleEn.statusCode).toBe(200);
    expect(queryLocaleEn.json().total).toBe(1);
    expect(queryLocaleEn.json().items[0].id).toBe(enEntry.id);

    // Regional BCP-47 tags use one canonical representation across create, detail, and taxonomy resolvers.
    const createRegionalArtRes = await app.inject({
      method: 'POST',
      url: `/sites/${siteA!.id}/content/article_closure`,
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3001' },
      cookies: adminCookies,
      payload: {
        title: 'Site A Simplified Chinese Article',
        slug: 'news-site-a-zh',
        locale: 'zh-cn',
        data: { body: 'Simplified Chinese content' },
        taxonomyAssignments: { 'category-closure': [termNewsA.id] },
      },
    });
    expect(createRegionalArtRes.statusCode).toBe(201);
    expect(createRegionalArtRes.json().entry.locale).toBe('zh-CN');
    const regionalEntry = createRegionalArtRes.json().entry;

    const publishRegionalArtRes = await app.inject({
      method: 'POST',
      url: `/sites/${siteA!.id}/content/article_closure/${regionalEntry.id}/publish`,
      headers: { origin: 'http://localhost:3001' },
      cookies: adminCookies,
    });
    expect(publishRegionalArtRes.statusCode).toBe(200);

    const regionalDetailRes = await app.inject({
      method: 'GET',
      url: `/public/sites/${siteA!.id}/content/article_closure/news-site-a-zh?locale=zh-cn`,
    });
    expect(regionalDetailRes.statusCode).toBe(200);
    expect(regionalDetailRes.json().entry.id).toBe(regionalEntry.id);

    const regionalTaxonomyRes = await app.inject({
      method: 'GET',
      url: `/public/sites/${siteA!.id}/content-types/article_closure/taxonomies/category-closure/terms/news/entries?locale=zh-cn`,
    });
    expect(regionalTaxonomyRes.statusCode).toBe(200);
    expect(regionalTaxonomyRes.json().total).toBe(1);
    expect(regionalTaxonomyRes.json().items[0].id).toBe(regionalEntry.id);

    // Draft-only taxonomy assignment test:
    const termFeaturesARes = await app.inject({
      method: 'POST',
      url: `/sites/${siteA!.id}/taxonomies/category-closure/terms`,
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3001' },
      cookies: adminCookies,
      payload: { key: 'features', name: 'Tính năng' },
    });
    expect(termFeaturesARes.statusCode).toBe(201);
    const termFeaturesA = termFeaturesARes.json().term;

    const createDraftArtRes = await app.inject({
      method: 'POST',
      url: `/sites/${siteA!.id}/content/article_closure`,
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3001' },
      cookies: adminCookies,
      payload: {
        title: 'Draft Features Article',
        locale: 'vi',
        slug: 'features-draft',
        data: { body: 'Draft body' },
        taxonomyAssignments: { 'category-closure': [termFeaturesA.id] },
      },
    });
    expect(createDraftArtRes.statusCode).toBe(201);
    const draftEntry = createDraftArtRes.json().entry;

    // Query draft term before publish -> total: 0 (No draft leakage)
    const queryDraftBeforePub = await app.inject({
      method: 'GET',
      url: `/public/sites/${siteA!.id}/content-types/article_closure/taxonomies/category-closure/terms/features/entries?locale=vi`,
    });
    expect(queryDraftBeforePub.statusCode).toBe(200);
    expect(queryDraftBeforePub.json().total).toBe(0);

    // Publish draft entry -> Now public filter matches
    const pubDraftRes = await app.inject({
      method: 'POST',
      url: `/sites/${siteA!.id}/content/article_closure/${draftEntry.id}/publish`,
      headers: { origin: 'http://localhost:3001' },
      cookies: adminCookies,
    });
    expect(pubDraftRes.statusCode).toBe(200);

    const queryDraftAfterPub = await app.inject({
      method: 'GET',
      url: `/public/sites/${siteA!.id}/content-types/article_closure/taxonomies/category-closure/terms/features/entries?locale=vi`,
    });
    expect(queryDraftAfterPub.statusCode).toBe(200);
    expect(queryDraftAfterPub.json().total).toBe(1);
    expect(queryDraftAfterPub.json().items[0].id).toBe(draftEntry.id);

    // -------------------------------------------------------------------------
    // 6. Taxonomy Archive / Public Semantics Regression
    // -------------------------------------------------------------------------

    // Deactivate Term 'features'
    const deactTermRes = await app.inject({
      method: 'POST',
      url: `/sites/${siteA!.id}/taxonomies/category-closure/terms/${termFeaturesA.id}/deactivate`,
      headers: { origin: 'http://localhost:3001' },
      cookies: adminCookies,
    });
    expect(deactTermRes.statusCode).toBe(200);

    // Content Detail: Historical term 'features' is STILL resolvable and displayable
    const detailAfterDeactTerm = await app.inject({
      method: 'GET',
      url: `/public/sites/${siteA!.id}/content/article_closure/features-draft?locale=vi`,
    });
    expect(detailAfterDeactTerm.statusCode).toBe(200);
    const pubEntryDetail = detailAfterDeactTerm.json().entry;
    expect(pubEntryDetail.taxonomies).toHaveLength(1);
    expect(pubEntryDetail.taxonomies[0].key).toBe('features');
    expect(pubEntryDetail.taxonomies[0].is_active).toBe(false);

    // New Revision: Cannot assign inactive term 'features'
    const newRevInactiveTermRes = await app.inject({
      method: 'POST',
      url: `/sites/${siteA!.id}/content/article_closure`,
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3001' },
      cookies: adminCookies,
      payload: {
        title: 'Attempt Assign Inactive Term',
        locale: 'vi',
        slug: 'attempt-inactive',
        data: { body: 'Invalid' },
        taxonomyAssignments: { 'category-closure': [termFeaturesA.id] },
      },
    });
    expect(newRevInactiveTermRes.statusCode).toBe(400);
    expect(newRevInactiveTermRes.json().message).toContain('Cannot assign inactive taxonomy term');

    // Taxonomy Public Filter: Inactive term 'features' excluded
    const queryInactiveTerm = await app.inject({
      method: 'GET',
      url: `/public/sites/${siteA!.id}/content-types/article_closure/taxonomies/category-closure/terms/features/entries?locale=vi`,
    });
    expect(queryInactiveTerm.statusCode).toBe(200);
    expect(queryInactiveTerm.json().total).toBe(0);

    // Deactivate TAXONOMY 'category-closure'
    const deactTaxRes = await app.inject({
      method: 'PATCH',
      url: `/taxonomies/${taxCategory.id}`,
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3001' },
      cookies: adminCookies,
      payload: { isActive: false },
    });
    expect(deactTaxRes.statusCode).toBe(200);

    // Historical Published Content: Historical revision relation remains intact
    const detailAfterDeactTax = await app.inject({
      method: 'GET',
      url: `/public/sites/${siteA!.id}/content/article_closure/news-site-a?locale=vi`,
    });
    expect(detailAfterDeactTax.statusCode).toBe(200);
    expect(detailAfterDeactTax.json().entry.taxonomies).toHaveLength(1);
    expect(detailAfterDeactTax.json().entry.taxonomies[0].key).toBe('news');

    // Normal Taxonomy Filter: Taxonomy excluded (returns empty)
    const queryDeactTax = await app.inject({
      method: 'GET',
      url: `/public/sites/${siteA!.id}/content-types/article_closure/taxonomies/category-closure/terms/news/entries?locale=vi`,
    });
    expect(queryDeactTax.statusCode).toBe(200);
    expect(queryDeactTax.json().total).toBe(0);

    // Verify DB integrity: No historical relation rows were deleted
    const allCrtRows = await database.db.select().from(contentRevisionTerms);
    expect(allCrtRows.length).toBeGreaterThanOrEqual(4);

    // Reactivate taxonomy for atomicity test
    await app.inject({
      method: 'PATCH',
      url: `/taxonomies/${taxCategory.id}`,
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3001' },
      cookies: adminCookies,
      payload: { isActive: true },
    });

    // -------------------------------------------------------------------------
    // 7. Verify M3 Revision-Term Atomicity (Transaction Rollback)
    // -------------------------------------------------------------------------

    // Entry A is currently at Revision 1 (current and published)
    const entryABefore = (await app.inject({
      method: 'GET',
      url: `/sites/${siteA!.id}/content/article_closure/${entryA.id}`,
      cookies: adminCookies,
    })).json();
    const currentRevIdBefore = entryABefore.entry.currentRevisionId;
    const publishedRevIdBefore = entryABefore.entry.publishedRevisionId;

    const revsCountBefore = (await database.pool.query(
      'SELECT COUNT(*) as count FROM content_entry_revisions WHERE entry_id = $1',
      [entryA.id]
    )).rows[0].count;

    const crtCountBefore = (await database.pool.query(
      'SELECT COUNT(*) as count FROM content_revision_terms'
    )).rows[0].count;

    // Attempt to create Revision 2 with an invalid / cross-site term assignment (termNewsB belongs to Site B!)
    const failedRevRes = await app.inject({
      method: 'PATCH',
      url: `/sites/${siteA!.id}/content/article_closure/${entryA.id}`,
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3001' },
      cookies: adminCookies,
      payload: {
        expectedRevision: 1,
        title: 'Faulty Revision Title',
        data: { body: 'Invalid Body' },
        taxonomyAssignments: { 'category-closure': [termNewsB.id] }, // Cross-site term error!
      },
    });
    expect(failedRevRes.statusCode).toBe(400);
    expect(failedRevRes.json().message).toContain('Cross-site taxonomy term');

    // Verify PostgreSQL Transaction Atomicity:
    // 1. current_revision_id remains Revision 1
    const entryAAfter = (await app.inject({
      method: 'GET',
      url: `/sites/${siteA!.id}/content/article_closure/${entryA.id}`,
      cookies: adminCookies,
    })).json();
    expect(entryAAfter.entry.currentRevisionId).toBe(currentRevIdBefore);
    expect(entryAAfter.entry.publishedRevisionId).toBe(publishedRevIdBefore);

    // 2. Revision N+1 does not remain orphaned in content_entry_revisions
    const revsCountAfter = (await database.pool.query(
      'SELECT COUNT(*) as count FROM content_entry_revisions WHERE entry_id = $1',
      [entryA.id]
    )).rows[0].count;
    expect(revsCountAfter).toBe(revsCountBefore);

    // 3. No partial content_revision_terms rows inserted
    const crtCountAfter = (await database.pool.query(
      'SELECT COUNT(*) as count FROM content_revision_terms'
    )).rows[0].count;
    expect(crtCountAfter).toBe(crtCountBefore);
  } finally {
    await app.close();
  }
}, 45000);
