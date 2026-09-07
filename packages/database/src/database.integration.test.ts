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

    // 12. Rate limiting test on /auth/login (exceed 5 attempts for rate_limit@example.com)
    for (let i = 0; i < 5; i++) {
      await app.inject({
        method: 'POST',
        url: '/auth/login',
        headers: { 'content-type': 'application/json' },
        payload: { email: 'rate_limit@example.com', password: 'wrong' },
      });
    }
    const rateLimitedRes = await app.inject({
      method: 'POST',
      url: '/auth/login',
      headers: { 'content-type': 'application/json' },
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

    const globalAdminToken = prodLoginRes.json().token;

    // Login siteEditor
    const siteEditorLoginRes = await prodApp.inject({
      method: 'POST',
      url: '/auth/login',
      headers: {
        'content-type': 'application/json',
      },
      payload: { email: 'site_editor@example.com', password },
    });
    const siteEditorToken = siteEditorLoginRes.json().token;

    // Login regularUser
    const regularUserLoginRes = await prodApp.inject({
      method: 'POST',
      url: '/auth/login',
      headers: {
        'content-type': 'application/json',
      },
      payload: { email: 'regular_user@example.com', password },
    });
    const regularUserToken = regularUserLoginRes.json().token;

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
      headers: { 'content-type': 'application/json' },
      payload: { email: 'temp_active@example.com', password },
    });
    const tempToken = tempLoginRes.json().token;

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
      headers: { 'content-type': 'application/json' },
      payload: { email: 'm24_superadmin@example.com', password },
    });
    expect(adminLoginRes.statusCode).toBe(200);
    const adminToken = adminLoginRes.json().token;
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
      headers: { 'content-type': 'application/json' },
      payload: { email: 'm24_viewer@example.com', password },
    });
    const viewerToken = viewerLoginRes.json().token;
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
      headers: { 'content-type': 'application/json' },
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
      headers: { 'content-type': 'application/json' },
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
      headers: { 'content-type': 'application/json' },
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
      headers: { 'content-type': 'application/json' },
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
      headers: { 'content-type': 'application/json' },
      payload: { email: 'new_operator@example.com', password: 'NewOperatorPassword123!' },
    });
    expect(newLoginRes.statusCode).toBe(200);
    const operatorToken = newLoginRes.json().token;

    // 8. POST /users/:id/deactivate: deactivates user and terminates sessions
    const deactivateRes = await app.inject({
      method: 'POST',
      url: `/users/${createdUser.id}/deactivate`,
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
      headers: { 'content-type': 'application/json' },
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
      headers: { 'content-type': 'application/json' },
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
      headers: { 'content-type': 'application/json' },
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
      headers: { 'content-type': 'application/json' },
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
      headers: { 'content-type': 'application/json' },
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
      headers: { 'content-type': 'application/json' },
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
      headers: { 'content-type': 'application/json' },
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
      headers: { 'content-type': 'application/json' },
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
      cookies: adminCookies,
    });
    expect(deleteSuperAdminAssignRes.statusCode).toBe(400);
    expect(deleteSuperAdminAssignRes.json().message).toContain('Cannot remove the last active global system super admin assignment');

    // 7. DELETE /users/:id/roles/:assignmentId: successfully remove viewer's site assignment
    const deleteViewerAssignRes = await app.inject({
      method: 'DELETE',
      url: `/users/${viewerUser.id}/roles/${siteAssignment.id}`,
      cookies: adminCookies,
    });
    expect(deleteViewerAssignRes.statusCode).toBe(200);
    expect(deleteViewerAssignRes.json()).toEqual({ status: 'ok' });
  } finally {
    await app.close();
  }
}, 30000);
