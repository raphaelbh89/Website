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
});

