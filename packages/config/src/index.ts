import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

export function loadEnvironment() {
  config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true });
}
export const databaseEnvironment = z.object({
  DATABASE_URL: z.string().url().refine(value => ['postgres:', 'postgresql:'].includes(new URL(value).protocol), 'Expected PostgreSQL URL'),
});
export const apiEnvironment = databaseEnvironment.extend({
  API_HOST: z.string().min(1).default('127.0.0.1'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
});

