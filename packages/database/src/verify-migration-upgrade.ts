import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createDatabase, migrateDatabase } from './index.js';

const connectionString = process.env.UPGRADE_TEST_DATABASE_URL;
if (!connectionString) {
  throw new Error('UPGRADE_TEST_DATABASE_URL must point to a dedicated empty PostgreSQL 16 database.');
}

const database = createDatabase(connectionString);
const sourceFolder = fileURLToPath(new URL('../drizzle', import.meta.url));
const temporaryFolder = await mkdtemp(join(tmpdir(), 'cms-migrations-through-0004-'));

try {
  const existingTables = await database.pool.query<{ count: string }>(
    "SELECT count(*)::text AS count FROM pg_tables WHERE schemaname = 'public'",
  );
  assert.equal(existingTables.rows[0]?.count, '0', 'Upgrade verification refuses a non-empty database');

  await mkdir(join(temporaryFolder, 'meta'));
  const journal = JSON.parse(await readFile(join(sourceFolder, 'meta', '_journal.json'), 'utf8')) as {
    entries: Array<{ idx: number }>;
  };
  journal.entries = journal.entries.filter((entry) => entry.idx <= 4);
  await writeFile(join(temporaryFolder, 'meta', '_journal.json'), `${JSON.stringify(journal, null, 2)}\n`);

  for (const entry of journal.entries) {
    const prefix = `${String(entry.idx).padStart(4, '0')}_`;
    const migrationFile = (await readdir(sourceFolder)).find(
      (name) => name.startsWith(prefix) && name.endsWith('.sql'),
    );
    assert.ok(migrationFile, `Missing migration file for ${prefix}`);
    await cp(join(sourceFolder, migrationFile), join(temporaryFolder, migrationFile));
  }

  await migrate(database.db, { migrationsFolder: temporaryFolder });
  const preUpgrade = await database.pool.query("SELECT to_regclass('public.content_entry_revisions') AS relation");
  assert.equal(preUpgrade.rows[0]?.relation, 'content_entry_revisions');
  const preConstraint = await database.pool.query(
    "SELECT 1 FROM pg_constraint WHERE conname = 'fk_content_entries_current_rev'",
  );
  assert.equal(preConstraint.rowCount, 0, '0004 baseline unexpectedly contains the 0005 pointer constraint');

  await migrateDatabase(database);
  await migrateDatabase(database);

  const expectedConstraints = [
    'uq_content_entry_revisions_entry_id_id',
    'fk_content_entries_current_rev',
    'fk_content_entries_published_rev',
    'content_types_scope_site_key_idx',
    'taxonomies_scope_site_key_idx',
    'chk_ct_tax_terms_range',
    'chk_term_no_self_parent',
    'chk_term_depth_cap',
  ];
  const constraints = await database.pool.query<{ conname: string }>(
    'SELECT conname FROM pg_constraint WHERE conname = ANY($1::text[])',
    [expectedConstraints],
  );
  assert.deepEqual(
    new Set(constraints.rows.map((row) => row.conname)),
    new Set(expectedConstraints),
    'Upgrade did not create every expected constraint',
  );

  const nullsNotDistinct = await database.pool.query<{ index_name: string; enabled: boolean }>(`
    SELECT indexrelid::regclass::text AS index_name, indnullsnotdistinct AS enabled
    FROM pg_index
    WHERE indexrelid::regclass::text = ANY($1::text[])
  `, [['content_types_scope_site_key_idx', 'taxonomies_scope_site_key_idx']]);
  assert.equal(nullsNotDistinct.rowCount, 2);
  assert.ok(nullsNotDistinct.rows.every((row) => row.enabled));

  const partialIndexes = await database.pool.query<{ indexname: string; indexdef: string }>(`
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = ANY($1::text[])
  `, [['content_entries_single_unique_idx', 'content_entries_published_slug_unique_idx']]);
  assert.equal(partialIndexes.rowCount, 2);
  assert.match(
    partialIndexes.rows.find((row) => row.indexname === 'content_entries_single_unique_idx')?.indexdef ?? '',
    /WHERE \(entry_kind = 'single'::text\)/,
  );
  assert.match(
    partialIndexes.rows.find((row) => row.indexname === 'content_entries_published_slug_unique_idx')?.indexdef ?? '',
    /WHERE \(published_slug IS NOT NULL\)/,
  );

  console.info('Upgrade verification passed: clean 0004 baseline -> 0005 -> repeat migrate, with catalog checks.');
} finally {
  await database.pool.end();
  await rm(temporaryFolder, { recursive: true, force: true });
}
