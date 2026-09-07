import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { fileURLToPath } from 'node:url';
import * as schema from './schema.js';

export {
  sites,
  users,
  sessions,
  roles,
  permissions,
  rolePermissions,
  userRoleAssignments,
  contentTypes,
  contentEntries,
  contentEntryRevisions,
} from './schema.js';

export function createDatabase(connectionString: string) {
  const pool = new pg.Pool({
    connectionString,
    max: 5,
    connectionTimeoutMillis: 2000,
    idleTimeoutMillis: 10000,
    statement_timeout: 3000,
    query_timeout: 4000,
  });
  // Idle disconnects must not crash the process; callers report readiness and structured request errors.
  pool.on('error', () => {});
  return { pool, db: drizzle(pool, { schema }) };
}

export async function migrateDatabase(database: ReturnType<typeof createDatabase>) {
  await migrate(database.db, {
    migrationsFolder: fileURLToPath(new URL('../drizzle', import.meta.url)),
  });
}

/**
 * Standard system permissions catalog.
 */
export const SYSTEM_PERMISSIONS = [
  { key: 'users.read', name: 'View Users', module: 'users', description: 'View user list and details' },
  { key: 'users.create', name: 'Create Users', module: 'users', description: 'Create new users' },
  { key: 'users.update', name: 'Update Users', module: 'users', description: 'Update user profiles' },
  { key: 'users.deactivate', name: 'Deactivate Users', module: 'users', description: 'Deactivate or lock user accounts' },
  { key: 'roles.read', name: 'View Roles', module: 'roles', description: 'View roles and permission matrices' },
  { key: 'roles.manage', name: 'Manage Roles', module: 'roles', description: 'Create, update, and configure roles' },
  { key: 'roles.assign', name: 'Assign Roles', module: 'roles', description: 'Assign roles to users with scopes' },
  { key: 'sites.read', name: 'View Sites', module: 'sites', description: 'View sites configuration' },
  { key: 'sites.manage', name: 'Manage Sites', module: 'sites', description: 'Create and configure websites' },
  { key: 'settings.manage', name: 'Manage Settings', module: 'settings', description: 'Manage platform and site settings' },
  { key: 'content_types.read', name: 'View Content Types', module: 'content_types', description: 'View content type definitions' },
  { key: 'content_types.manage', name: 'Manage Content Types', module: 'content_types', description: 'Create and configure content types and fields' },
  { key: 'content.read', name: 'Read Content', module: 'content', description: 'Read articles and content entries' },
  { key: 'content.create', name: 'Create Content', module: 'content', description: 'Create content entries' },
  { key: 'content.update', name: 'Update Content', module: 'content', description: 'Update existing content entries' },
  { key: 'content.publish', name: 'Publish Content', module: 'content', description: 'Publish content to public websites' },
  { key: 'content.delete', name: 'Delete Content', module: 'content', description: 'Delete content entries' },
] as const;

/**
 * Seeds idempotent platform development site, system permissions, and system roles.
 * No hardcoded plain-text passwords or default credentials are committed.
 */
export async function seedDatabase(database: ReturnType<typeof createDatabase>) {
  // 1. Seed development site
  await database.db
    .insert(schema.sites)
    .values({ key: 'development', name: 'Development site' })
    .onConflictDoNothing({ target: schema.sites.key });

  // 2. Seed standard system permissions
  for (const perm of SYSTEM_PERMISSIONS) {
    await database.db
      .insert(schema.permissions)
      .values(perm)
      .onConflictDoNothing({ target: schema.permissions.key });
  }

  // 3. Seed system_super_admin role
  await database.db
    .insert(schema.roles)
    .values({
      key: 'system_super_admin',
      name: 'System Super Administrator',
      description: 'Full administrative access across all platform sites and resources',
      isSystem: true,
    })
    .onConflictDoNothing({ target: schema.roles.key });

  // 4. Attach all system permissions to system_super_admin role
  const superAdminRole = await database.db.query.roles.findFirst({
    where: (r, { eq }) => eq(r.key, 'system_super_admin'),
  });

  if (superAdminRole) {
    const allPerms = await database.db.query.permissions.findMany();
    for (const p of allPerms) {
      await database.db
        .insert(schema.rolePermissions)
        .values({
          roleId: superAdminRole.id,
          permissionId: p.id,
        })
        .onConflictDoNothing();
    }
  }
}
