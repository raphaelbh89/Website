import pg from 'pg';

const dbName = process.argv[2] || 'm31_clean_verify_db';

async function main() {
  const connStr = process.env.DATABASE_URL || 'postgresql://platform:local-development-only@127.0.0.1:5432/postgres';
  const client = new pg.Client({ connectionString: connStr });
  await client.connect();
  await client.query(`DROP DATABASE IF EXISTS ${dbName}`);
  await client.query(`CREATE DATABASE ${dbName}`);
  console.log(`Clean database ${dbName} successfully recreated!`);
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
