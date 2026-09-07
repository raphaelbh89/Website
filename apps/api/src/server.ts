import { apiEnvironment, loadEnvironment } from '@platform/config';
import { createDatabase } from '@platform/database';
import { buildApp } from './app.js';
loadEnvironment();
const parsed = apiEnvironment.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid API environment. Check DATABASE_URL, API_HOST, API_PORT and NODE_ENV.');
  process.exitCode = 1;
} else {
  const env = parsed.data;
  const database = createDatabase(env.DATABASE_URL);
  const app = buildApp(async () => {
    // Verify connectivity AND baseline schema, not just an open database port.
    await database.pool.query('SELECT id FROM sites LIMIT 0');
  }, true);
  app.addHook('onClose', async () => { await database.pool.end(); });
  for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => { void app.close(); });
  try { await app.listen({ host: env.API_HOST, port: env.API_PORT }); }
  catch { console.error('API startup failed. Check the bind address and port.'); await app.close(); process.exitCode = 1; }
}

