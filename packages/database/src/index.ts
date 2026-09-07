import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { fileURLToPath } from 'node:url';
import * as schema from './schema.js';
export { sites } from './schema.js';
export function createDatabase(connectionString: string) {
  const pool = new pg.Pool({ connectionString, max: 5, connectionTimeoutMillis: 2000, idleTimeoutMillis: 10000, statement_timeout: 3000, query_timeout: 4000 });
  // Idle disconnects must not crash the process; callers report readiness and structured request errors.
  pool.on('error', () => {});
  return { pool, db: drizzle(pool, { schema }) };
}
export async function migrateDatabase(database: ReturnType<typeof createDatabase>) {
  await migrate(database.db, { migrationsFolder: fileURLToPath(new URL('../drizzle', import.meta.url)) });
}
export async function seedDatabase(database: ReturnType<typeof createDatabase>) {
  await database.db.insert(schema.sites).values({ key: 'development', name: 'Development site' }).onConflictDoNothing({ target: schema.sites.key });
}

