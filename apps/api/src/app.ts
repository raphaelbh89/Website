import Fastify from 'fastify';
export function buildApp(checkDatabase: () => Promise<void>, logger = false) {
  const app = Fastify({ logger, bodyLimit: 1048576, requestTimeout: 10000 });
  app.get('/health/live', async () => ({ status: 'ok' }));
  app.get('/health/ready', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store');
    try { await checkDatabase(); return { status: 'ready' }; }
    catch { return reply.code(503).send({ status: 'not_ready' }); }
  });
  return app;
}

