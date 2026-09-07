import { databaseEnvironment, loadEnvironment } from '@platform/config';
import { createDatabase, migrateDatabase, seedDatabase } from './index.js';
loadEnvironment();
const env = databaseEnvironment.safeParse(process.env);
if (!env.success) {
  console.error('DATABASE_URL must be a valid PostgreSQL URL.');
  process.exitCode = 1;
} else {
  const database = createDatabase(env.data.DATABASE_URL);
  try {
    const command = process.argv[2];
    if (command === 'migrate') await migrateDatabase(database);
    else if (command === 'seed') await seedDatabase(database);
    else throw new Error('Unknown database command');
    console.info('Database operation completed.');
  } catch {
    console.error('Database operation failed. Check connectivity, privileges and migration state.');
    process.exitCode = 1;
  } finally { await database.pool.end(); }
}

