# HANDOFF.md

> Agent rời session phải cập nhật file này. Agent mới đọc file này trước khi sửa code.

## Current Handoff

### Session State

- Current milestone: M2 IN_PROGRESS (M2.1 Identity Schema & Persistence `VERIFIED` [commit `a7b5a2d`]; M2.2 Auth Vertical Slice `READY_FOR_TEST` [API/DB Verified, Browser Runtime Not Run]; M2.3 Scoped Authorization Guards `VERIFIED` [ready to commit]; M2.4 Admin User/Role Management `TODO`).
- Working tree: All M2.2 security hardening and M2.3 scoped authorization guard code implemented and verified across 17 unit tests, 3 integration test suites, production build, and smoke tests.

### Completed

- Baseline commit `9294b50` and M2.1 commit `a7b5a2d` pushed to GitHub remote `origin/main`.
- Vertical slice M2.2 Authentication & Security Hardening:
  - Added `@fastify/cookie`, `@fastify/cors`, `@fastify/rate-limit`, `drizzle-orm`, `@platform/auth` to `apps/api`.
  - Added `COOKIE_SECRET` (with production rejection of default secret) and `CORS_ORIGIN` to `@platform/config`.
  - Added cookie constants `SESSION_COOKIE_NAME`, `SESSION_COOKIE_NAME_PROD`, `getSessionCookieName` to `@platform/auth`.
  - Implemented `AuthService` in `apps/api/src/auth.service.ts` with Argon2id password verification, SHA-256 session token hashing, absolute 7d expiry, idle 24h timeout, rolling activity updates (15m interval), instant session revocation, and generic 401 errors.
  - Implemented CSRF & Origin protection: strict Origin/Referer matching against allowed CORS origins, non-JSON Content-Type rejection (415), safe GET exemption, and Bearer token client compatibility.
  - Implemented brute-force login rate limiting with `IP + normalized email` bucket keys (5/min).
  - Implemented Admin Login UI in `apps/admin/app/login/page.tsx` and Protected Dashboard in `apps/admin/app/page.tsx`.
  - Implemented Admin Bootstrap CLI in `packages/database/src/cli.ts` via `pnpm auth:bootstrap-admin`.
- Vertical slice M2.3 Scoped Authorization Guards:
  - Implemented `apps/api/src/auth.guard.ts` with `requireAuthentication` and `requirePermission(permission, scopeResolver)` preHandler hooks.
  - Verified allow-list, deny-by-default, and hierarchical RBAC evaluation (`GLOBAL` and `SITE` scopes).
  - Implemented and verified proof routes `GET /admin/proof` (GLOBAL scope, `users.read`) and `GET /sites/:siteId/proof` (SITE scope, `sites.read`).
  - Proved site isolation (Site A grant accesses Site A, denied on Site B with 403 Forbidden).
  - Proved authentication (401) vs authorization (403) distinct status codes.
  - Verified production cookie attributes (`__Host-platform_session`, `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, no `Domain`).

### Not Started

- M2.4: Admin User and Role management CRUD API & UI.
- M3: CMS Core (Content types, entries, schema engine).
- Hosted CI execution on GitHub Actions.
- Browser automation flow verification (Playwright download returned 404 in current environment).

### Next Recommended Actions

1. Commit M2.2 hardening and M2.3 work:
   - `fix(auth): harden session lifecycle, csrf verification and rate limiting`
   - `feat(authz): implement M2.3 scoped authorization guards and proof endpoints`
2. Push commits to `origin/main`.
3. Proceed to milestone M2.4: Admin User & Role Management.

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
