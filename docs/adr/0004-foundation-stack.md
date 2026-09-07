# ADR-0004: M1 foundation stack

- Status: Accepted
- Date: 2026-09-07
- Owner: Orchestrator / Lead Architect

## Decision

Node.js 24 LTS, pnpm 11.17.0, Turborepo 2.10.12, TypeScript 5.9.3.
Next.js 16.3.4 + React 19.2.8 for both web and admin; Fastify 5.12.3 for API.
Drizzle ORM 0.45.2 / Kit 0.31.10 with pg 8.23.0 for PostgreSQL 16.
Zod 4.5.4 for environment and boundary contracts; Vitest 4.0.18 for unit/integration tests;
ESLint 10.10.0 + typescript-eslint 8.69.0 for lint. Dependencies are pinned and lockfile committed when available.

Next supports public SSR and a shared React foundation with admin. Separate Fastify owns domain APIs.
Using Next for admin adds server/build overhead compared with Vite, but avoids a second UI toolchain.
Drizzle keeps relational constraints and reviewable SQL migrations explicit, at the cost of more SQL ownership than Prisma.
No ORM push command is used as a substitute for migration history.

M1 only exposes operational foundation screens, not business pages or a CMS prototype.
Authentication implementation/library is deferred to M2 ADR; M1 adds only a deny-by-default site/global permission contract.
No auth endpoints or privileged business API are shipped in M1.
Storage, cache, jobs, chat, visual editor, browser E2E and deployment provider are deferred until their implementing milestone.
M1 CI uses GitHub Actions with a PostgreSQL 16 service; this does not select a production hosting provider.

## Data and scope

Sites have a UUIDv7 identifier and unique stable key. M1 seed requires explicit DATABASE_URL, is idempotent,
and creates a development site only (no passwords or privileged accounts).
Permission skeleton uses global grants or grants bound to one site; campus/resource rules are deferred to M2.
This is not a completed authentication/authorization system.

## Verification / rollback

Locked install, lint, typecheck, unit tests, production build, production HTTP smoke,
PostgreSQL 16 clean/repeated migration and seed persistence tests are required.
Migration is forward-only; restore a database backup or use a reviewed forward migration for rollback.
Do not edit released migration SQL. No prior source contracts existed when this decision was made.

## References

- https://nextjs.org/docs/app/getting-started/installation
- https://fastify.dev/docs/latest/Reference/LTS/
- https://orm.drizzle.team/docs/migrations
- Exact release versions checked against npm registry during M1.
