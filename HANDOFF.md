# HANDOFF.md

> Agent rời session phải cập nhật file này. Agent mới đọc file này trước khi sửa code.

## Current Handoff

### Session State

- Current milestone: M2 IN_PROGRESS (M2.1 Identity Schema & Persistence `VERIFIED`; ready for M2.2 Authentication Vertical Slice).
- Working tree: Clean baseline commit `9294b50` on `origin/main`. Changes for ADRs and M2.1 staged/uncommitted.

### Completed

- Baseline commit `9294b50` pushed to GitHub remote `origin/main`.
- ADR-0005 (Auth & Session Strategy) and ADR-0006 (Scoped RBAC Strategy) formulated and accepted.
- Vertical slice M2.1:
  - Added `@node-rs/argon2` to `@platform/auth`.
  - Implemented Argon2id password hashing, verification, email normalization, high-entropy session token generation, SHA-256 token hashing, and hierarchical scoped permission evaluation (`GLOBAL`, `SITE`, `CAMPUS`, `RESOURCE`).
  - Implemented database schema in `@platform/database`: `users`, `sessions`, `roles`, `permissions`, `role_permissions`, `user_role_assignments` using UUIDv7 primary keys and cascade foreign keys.
  - Generated and reviewed SQL migration `0001_milky_roland_deschain.sql`.
  - Implemented idempotent database seed for 15 system permissions and `system_super_admin` system role with zero plain text secrets committed.
  - Verified clean migration, repeated migration, seed idempotency, unique constraints, FK cascade, and persistence with real PostgreSQL 16.
  - Lint, typecheck (9 tasks), unit tests (9 tests), build (6 tasks), integration tests, and smoke tests all PASS.

### Not Started

- M2.2: Fastify auth endpoints (`POST /auth/login`, `POST /auth/logout`, `GET /auth/me`), cookies & session middleware, Admin Login UI.
- M2.3: Scoped Authorization guards and permission enforcement middleware.
- M2.4: Admin User and Role management CRUD.
- Hosted CI execution on GitHub Actions.

### Next Recommended Actions

1. Commit M2.1 work: `feat(database,auth): implement identity schema, argon2id hashing and scoped rbac persistence`.
2. Begin vertical slice M2.2:
   - Add `@fastify/cookie`, `@fastify/cors`, `@fastify/rate-limit` to `apps/api`.
   - Implement authentication service (verify credentials, create session, set HttpOnly cookie, retrieve me).
   - Implement Next.js Admin login page and auth state provider.

### Files changed / commands / limitations

- Added: root workspace/tooling/env/Compose/CI configuration, apps/*, packages/*, scripts/smoke.mjs, ADR-0004 and local database instructions.
- Updated: README, PROJECT_STATE, PROGRESS, TEST_REPORT, ISSUES, HANDOFF, DEV_LOG.
- PASS commands and actual DB evidence: TEST_REPORT.md TR-20260907-M1. No product login/publish behavior is claimed.
- Local PostgreSQL and fresh-install copy under .local-postgres are ignored, retained (not deleted), and must not be committed.
- PostgreSQL portable was stopped successfully with pg_ctl; all smoke servers were stopped by the script. Data remains available for later QA.
- Sandbox helper failed intermittently; edits used apply_patch directly through an authorized elevated process. Elevated Git needs command-scoped `-c safe.directory=E:/WebstiteCMS` due to sandbox account ownership; no global exception added.

## Template cho handoff sau này

```md
### Agent / Role
...

### Task
...

### What was done
...

### Files changed
- ...

### Commands executed
- `...` -> PASS/FAIL

### Tests passed
- ...

### Tests failed
- ...

### Known issues / risks
- ...

### Architecture decisions
- ADR-...

### Next exact step
1. ...

### Do not forget
- ...
```
