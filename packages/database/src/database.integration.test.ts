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
import { hashPassword, generateSessionToken, hashSessionToken } from '@platform/auth';
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
    where: (r, { eq }) => eq(r.key, 'system_super_admin'),
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
