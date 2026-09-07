import { expect, it } from 'vitest';
import { buildApp } from './app.js';
it('keeps liveness independent of unavailable dependencies and sanitizes readiness errors', async () => {
  const app = buildApp(async () => { throw new Error('postgresql://secret@private-host'); });
  try {
    expect((await app.inject('/health/live')).json()).toEqual({ status: 'ok' });
    const ready = await app.inject('/health/ready');
    expect(ready.statusCode).toBe(503);
    expect(ready.json()).toEqual({ status: 'not_ready' });
    expect(ready.headers['cache-control']).toBe('no-store');
    expect((await app.inject('/missing')).statusCode).toBe(404);
  } finally { await app.close(); }
});
it('returns readiness when dependency probe succeeds', async () => {
  const app = buildApp(async () => {});
  try { expect((await app.inject('/health/ready')).statusCode).toBe(200); }
  finally { await app.close(); }
});

