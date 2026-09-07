import { afterAll, expect, it } from 'vitest';
import { createDatabase, migrateDatabase, seedDatabase, sites } from './index.js';
import { buildApp } from '../../../apps/api/src/app.js';
// Opt-in against a dedicated disposable DB. Never reset or drop an existing database.
const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error('TEST_DATABASE_URL is required and must point to a dedicated empty PostgreSQL 16 database.');
const database = createDatabase(url);
afterAll(async () => { await database.pool.end(); });
it('migrates a clean PostgreSQL 16 DB, repeats safely, persists idempotent UUIDv7 seed and enforces uniqueness', async () => {
  const version = await database.pool.query('SHOW server_version_num');
  expect(Number(version.rows[0].server_version_num)).toBeGreaterThanOrEqual(160000);
  expect(Number(version.rows[0].server_version_num)).toBeLessThan(170000);
  const before = await database.pool.query("SELECT to_regclass('public.sites') AS table_name");
  expect(before.rows[0].table_name, 'Use a fresh test database; test never deletes existing data').toBeNull();
  await migrateDatabase(database);
  await migrateDatabase(database);
  await seedDatabase(database);
  await seedDatabase(database);
  const rows = await database.db.select().from(sites);
  expect(rows).toHaveLength(1);
  expect(rows[0]?.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  const reconnect = createDatabase(url);
  try { expect(await reconnect.db.select().from(sites)).toEqual(rows); }
  finally { await reconnect.pool.end(); }
  await expect(database.db.insert(sites).values({ key: 'development', name: 'Duplicate' })).rejects.toThrow();
  const app = buildApp(async () => { await database.pool.query('SELECT id FROM sites LIMIT 0'); });
  try { expect((await app.inject('/health/ready')).statusCode).toBe(200); }
  finally { await app.close(); }
}, 30000);

