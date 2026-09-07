import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

export function loadEnvironment() {
  config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true });
}

export const databaseEnvironment = z.object({
  DATABASE_URL: z
    .string()
    .url()
    .refine((value) => ['postgres:', 'postgresql:'].includes(new URL(value).protocol), 'Expected PostgreSQL URL'),
});

export const apiEnvironment = databaseEnvironment
  .extend({
    API_HOST: z.string().min(1).default('127.0.0.1'),
    API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    COOKIE_SECRET: z.string().min(32).default('development-only-insecure-cookie-secret-32-chars-min!'),
    CORS_ORIGIN: z.string().default('http://localhost:3000,http://localhost:3001'),
  })
  .superRefine((data, ctx) => {
    if (data.NODE_ENV === 'production') {
      if (data.COOKIE_SECRET === 'development-only-insecure-cookie-secret-32-chars-min!') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'COOKIE_SECRET must be explicitly set and cannot use the default value in production',
          path: ['COOKIE_SECRET'],
        });
      }
    }
  });

export type ApiEnvironment = z.infer<typeof apiEnvironment>;
