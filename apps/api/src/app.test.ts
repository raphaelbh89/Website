import { describe, expect, it } from 'vitest';
import { buildApp } from './app.js';

describe('Health and Readiness Probes', () => {
  it('keeps liveness independent of unavailable dependencies and sanitizes readiness errors', async () => {
    const app = buildApp(async () => {
      throw new Error('postgresql://secret@private-host');
    });
    try {
      expect((await app.inject('/health/live')).json()).toEqual({ status: 'ok' });
      const ready = await app.inject('/health/ready');
      expect(ready.statusCode).toBe(503);
      expect(ready.json()).toEqual({ status: 'not_ready' });
      expect(ready.headers['cache-control']).toBe('no-store');
      expect((await app.inject('/missing')).statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });

  it('returns readiness when dependency probe succeeds', async () => {
    const app = buildApp(async () => {});
    try {
      expect((await app.inject('/health/ready')).statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });
});

describe('CSRF and Origin Validation Hook', () => {
  it('accepts allowed origins on mutating endpoints', async () => {
    const app = buildApp({
      checkDatabase: async () => {},
      corsOrigin: 'http://localhost:3001',
    });
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/auth/login',
        headers: {
          origin: 'http://localhost:3001',
          'content-type': 'application/json',
        },
        payload: { email: 'test@example.com', password: 'test' },
      });
      expect(res.statusCode).not.toBe(403);
    } finally {
      await app.close();
    }
  });

  it('rejects foreign origin on mutating endpoints with 403', async () => {
    const app = buildApp({
      checkDatabase: async () => {},
      corsOrigin: 'http://localhost:3001',
    });
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/auth/login',
        headers: {
          origin: 'http://evil-attacker.com',
          'content-type': 'application/json',
        },
        payload: { email: 'test@example.com', password: 'test' },
      });
      expect(res.statusCode).toBe(403);
      expect(res.json()).toEqual({ error: 'FORBIDDEN', message: 'Invalid request origin' });
    } finally {
      await app.close();
    }
  });

  it('validates referer origin fallback when Origin header is absent', async () => {
    const app = buildApp({
      checkDatabase: async () => {},
      corsOrigin: 'http://localhost:3001',
    });
    try {
      // Allowed referer
      const allowedRes = await app.inject({
        method: 'POST',
        url: '/auth/login',
        headers: {
          referer: 'http://localhost:3001/admin/login',
          'content-type': 'application/json',
        },
        payload: { email: 'test@example.com', password: 'test' },
      });
      expect(allowedRes.statusCode).not.toBe(403);

      // Foreign referer
      const foreignRes = await app.inject({
        method: 'POST',
        url: '/auth/login',
        headers: {
          referer: 'http://malicious-site.com/attack',
          'content-type': 'application/json',
        },
        payload: { email: 'test@example.com', password: 'test' },
      });
      expect(foreignRes.statusCode).toBe(403);
      expect(foreignRes.json()).toEqual({ error: 'FORBIDDEN', message: 'Invalid request referer' });
    } finally {
      await app.close();
    }
  });

  it('rejects invalid/non-JSON Content-Type on mutating endpoints with payload', async () => {
    const app = buildApp({
      checkDatabase: async () => {},
      corsOrigin: 'http://localhost:3001',
    });
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/auth/login',
        headers: {
          origin: 'http://localhost:3001',
          'content-type': 'text/plain',
        },
        body: 'email=test@example.com&password=test',
      });
      expect(res.statusCode).toBe(415);
      expect(res.json()).toEqual({
        error: 'UNSUPPORTED_MEDIA_TYPE',
        message: 'Expected application/json Content-Type',
      });
    } finally {
      await app.close();
    }
  });

  it('allows safe GET requests from any origin without CSRF blocking', async () => {
    const app = buildApp({
      checkDatabase: async () => {},
      corsOrigin: 'http://localhost:3001',
    });
    try {
      const res = await app.inject({
        method: 'GET',
        url: '/health/live',
        headers: {
          origin: 'http://foreign-site.com',
        },
      });
      expect(res.statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });

  it('allows non-browser requests without Origin header on mutating endpoints', async () => {
    const app = buildApp({
      checkDatabase: async () => {},
      corsOrigin: 'http://localhost:3001',
    });
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/auth/login',
        headers: {
          'content-type': 'application/json',
        },
        payload: { email: 'test@example.com', password: 'test' },
      });
      expect(res.statusCode).not.toBe(403);
    } finally {
      await app.close();
    }
  });
});
