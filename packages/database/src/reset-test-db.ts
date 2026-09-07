import pg from 'pg';

const dbName = process.argv[2] || 'm31_clean_verify_db';

async function main() {
  const client = new pg.Client({ connectionString: 'postgresql://platform@127.0.0.1:55432/postgres' });
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
