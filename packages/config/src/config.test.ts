import { describe, expect, it } from 'vitest';
import { apiEnvironment } from './index.js';
describe('environment boundary', () => {
  it('requires a PostgreSQL URL', () => {
    expect(apiEnvironment.safeParse({}).success).toBe(false);
    expect(apiEnvironment.safeParse({ DATABASE_URL: 'https://example.com' }).success).toBe(false);
  });
  it('rejects invalid ports and supplies safe binding defaults', () => {
    const input = { DATABASE_URL: 'postgresql://localhost/platform' };
    expect(apiEnvironment.parse(input).API_HOST).toBe('127.0.0.1');
    for (const API_PORT of ['0', '65536', 'abc']) expect(apiEnvironment.safeParse({ ...input, API_PORT }).success).toBe(false);
  });
  it('validates COOKIE_SECRET requirements in development vs production', () => {
    const base = { DATABASE_URL: 'postgresql://localhost/platform' };
    // In development: default secret is allowed
    const devParsed = apiEnvironment.safeParse({ ...base, NODE_ENV: 'development' });
    expect(devParsed.success).toBe(true);

    // In production: default secret is rejected
    const prodDefault = apiEnvironment.safeParse({ ...base, NODE_ENV: 'production' });
    expect(prodDefault.success).toBe(false);

    // In production: short secret (< 32 chars) is rejected
    const prodShort = apiEnvironment.safeParse({
      ...base,
      NODE_ENV: 'production',
      COOKIE_SECRET: 'too-short',
    });
    expect(prodShort.success).toBe(false);

    // In production: custom 32+ char secret is accepted
    const prodValid = apiEnvironment.safeParse({
      ...base,
      NODE_ENV: 'production',
      COOKIE_SECRET: 'a-very-strong-production-cookie-secret-key-32chars',
    });
    expect(prodValid.success).toBe(true);
  });
});

