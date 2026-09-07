# HANDOFF.md

> Agent rời session phải cập nhật file này. Agent mới đọc file này trước khi sửa code.

## Current Handoff

### Session State

- Current milestone: M2 IN_PROGRESS (M2.1 Identity Schema & Persistence `VERIFIED` [commit `a7b5a2d`]; M2.2 Authentication Vertical Slice `VERIFIED` [pending commit]; M2.3 Scoped Authorization Guards `TODO`).
- Working tree: All M2.2 code implemented and verified. Ready to commit and push to `origin/main`.

### Completed

- Baseline commit `9294b50` and M2.1 commit `a7b5a2d` pushed to GitHub remote `origin/main`.
- Vertical slice M2.2 Authentication:
  - Added `@fastify/cookie`, `@fastify/cors`, `@fastify/rate-limit`, `drizzle-orm`, `@platform/auth` to `apps/api`.
  - Added `COOKIE_SECRET` and `CORS_ORIGIN` to `@platform/config`.
  - Added cookie constants `SESSION_COOKIE_NAME`, `SESSION_COOKIE_NAME_PROD`, `getSessionCookieName` to `@platform/auth`.
  - Implemented `AuthService` in `apps/api/src/auth.service.ts` with Argon2id password verification, SHA-256 session token hashing, rolling idle timeout (15m updates), session revocation, and generic 401 errors.
  - Implemented endpoints in Fastify API:
    - `POST /auth/login`: rate-limited (5/min), validates input, verifies user & password, stores SHA-256 token_hash in DB, issues HttpOnly SameSite=Lax cookie.
    - `POST /auth/logout`: deletes/revokes session in DB, clears cookie with Max-Age=0.
    - `GET /auth/me`: resolves session via cookie or Bearer token, rejects expired or inactive accounts, returns sanitized profile & grants.
  - Implemented CSRF Origin protection: preHandler hook validating Origin/Referer for mutating browser requests against allowed CORS origins.
  - Implemented Admin Login UI in `apps/admin/app/login/page.tsx` with email/password inputs, loading state, error alerts, and redirect on success.
  - Implemented Protected Admin Dashboard in `apps/admin/app/page.tsx` that calls `GET /auth/me` on mount, redirects to `/login` if unauthenticated, and provides Sign Out button.
  - Implemented Admin Bootstrap CLI in `packages/database/src/cli.ts` via `pnpm auth:bootstrap-admin` (supports `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME` env vars or interactive prompt, assigns `system_super_admin` role via proper RBAC).
  - Expanded unit and integration test suites: 12 unit tests, 2 PostgreSQL 16 integration test suites, production build, and production smoke tests all PASS.

### Not Started

- M2.3: Scoped Authorization Guards (RBAC preHandler middleware for Fastify, site-scoped permission resolution, site isolation check).
- M2.4: Admin User and Role management CRUD API & UI.
- M3: CMS Core (Content types, entries, schema engine).
- Hosted CI execution on GitHub Actions.

### Next Recommended Actions

1. Commit M2.2 work: `feat(auth): implement M2.2 authentication vertical slice`.
2. Push commit to `origin/main`.
3. Proceed to milestone M2.3: Scoped Authorization Guards.

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
