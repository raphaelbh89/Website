import { databaseEnvironment, loadEnvironment } from '@platform/config';
import { hashPassword, normalizeEmail } from '@platform/auth';
import {
  createDatabase,
  migrateDatabase,
  seedDatabase,
  users,
  userRoleAssignments,
} from './index.js';

loadEnvironment();
const env = databaseEnvironment.safeParse(process.env);
if (!env.success) {
  console.error('DATABASE_URL must be a valid PostgreSQL URL.');
  process.exitCode = 1;
} else {
  const database = createDatabase(env.data.DATABASE_URL);
  try {
    const command = process.argv[2];
    if (command === 'migrate') {
      await migrateDatabase(database);
      console.info('Database migration completed.');
    } else if (command === 'seed') {
      await seedDatabase(database);
      console.info('Database seed completed.');
    } else if (command === 'bootstrap-admin') {
      // Secure bootstrap admin creation: accepts credentials via environment variables
      const rawEmail = process.env.ADMIN_EMAIL;
      const rawPassword = process.env.ADMIN_PASSWORD;
      const name = process.env.ADMIN_NAME || 'Platform Administrator';

      if (!rawEmail || !rawPassword) {
        throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD environment variables are required to bootstrap admin.');
      }

      if (rawPassword.length < 8) {
        throw new Error('ADMIN_PASSWORD must be at least 8 characters long.');
      }

      const email = normalizeEmail(rawEmail);
      const passwordHash = await hashPassword(rawPassword);

      // Ensure seed has run so system_super_admin role exists
      await seedDatabase(database);

      const superAdminRole = await database.db.query.roles.findFirst({
        where: (r, { eq }) => eq(r.key, 'system_super_admin'),
      });

      if (!superAdminRole) {
        throw new Error('system_super_admin role not found. Ensure migrations and seed have executed.');
      }

      // Upsert user
      let [adminUser] = await database.db
        .insert(users)
        .values({
          email,
          passwordHash,
          name,
          isActive: true,
        })
        .onConflictDoUpdate({
          target: users.email,
          set: {
            passwordHash,
            name,
            isActive: true,
            updatedAt: new Date(),
          },
        })
        .returning();

      if (!adminUser) {
        adminUser = (await database.db.query.users.findFirst({
          where: (u, { eq }) => eq(u.email, email),
        }))!;
      }

      // Assign system_super_admin role with GLOBAL scope
      const existingAssignment = await database.db.query.userRoleAssignments.findFirst({
        where: (ura, { eq, and }) =>
          and(
            eq(ura.userId, adminUser.id),
            eq(ura.roleId, superAdminRole.id),
            eq(ura.scopeKind, 'global')
          ),
      });

      if (!existingAssignment) {
        await database.db.insert(userRoleAssignments).values({
          userId: adminUser.id,
          roleId: superAdminRole.id,
          scopeKind: 'global',
          scopeId: null,
        });
      }

      console.info(`Admin bootstrap completed successfully for: ${email}`);
    } else {
      throw new Error('Unknown database command');
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error(`Database operation failed: ${msg}`);
    process.exitCode = 1;
  } finally {
    await database.pool.end();
  }
}
