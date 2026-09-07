# TEST_REPORT.md

## Test Run Template

### TR-YYYYMMDD-001 — Feature Name

**Environment**

- Commit: `...`
- Runtime: `...`
- Database: `...`

**Commands**

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

**Results**

| Check | Result | Evidence/Notes |
|---|---|---|
| Lint | PASS/FAIL | ... |
| Typecheck | PASS/FAIL | ... |
| Unit | PASS/FAIL | ... |
| Integration | PASS/FAIL | ... |
| Build | PASS/FAIL | ... |
| Runtime | PASS/FAIL | ... |

**Acceptance Questions**

- Feature có chạy thật? `YES/NO`
- DB có lưu thật? `YES/NO/N/A`
- Refresh còn dữ liệu? `YES/NO/N/A`
- Admin sửa -> public cập nhật? `YES/NO/N/A`
- Invalid input bị từ chối đúng? `YES/NO`
- Permission server-side đúng? `YES/NO/N/A`
- Direct API/URL bypass bị chặn? `YES/NO/N/A`
- Mobile/tablet/desktop ổn? `YES/NO/N/A`
- Production build chạy? `YES/NO`
- Clean migration chạy? `YES/NO/N/A`

**Final QA Status**: `FAILED / VERIFIED`

---

## Current Evidence

M0 documentation baseline is followed by M1 runtime verification below. Business CMS/auth features remain unimplemented.

### TR-20260907-M1 — Foundation implementation checks

- Environment: Windows, Node 24.18.0, pnpm 11.17.0; newly initialized Git, no commit yet.
- PostgreSQL: portable 16.14, localhost:55432; dedicated m1_root_test database, no production data.
- ADR: docs/adr/0004-foundation-stack.md.
- `pnpm install`: PASS after explicit esbuild allowBuilds and ESLint update.
- `pnpm install --frozen-lockfile`: PASS.
- `pnpm db:generate`: PASS, generated packages/database/drizzle/0000_wakeful_marvel_apes.sql plus journal/snapshot.
- `pnpm typecheck`: PASS, 8 Turbo tasks (including prerequisite package builds).
- `pnpm lint`: PASS.
- Final unit/lint rerun after adding vitest.config.ts: PASS, still exactly 3 source test files / 5 tests; ignored portable/fresh-copy directories do not participate in lint/test discovery.
- `pnpm test`: PASS, 3 files / 5 tests; environment validation, permission deny/site isolation, health negative/positive unit paths.
- `pnpm build`: PASS, all 6 packages/apps including both Next production builds.
- `TEST_DATABASE_URL=.../m1_root_test pnpm test:integration`: PASS, real PostgreSQL 16; clean and repeated migration, idempotent seed, UUIDv7, uniqueness enforcement, persistence across connection, ready 200.
- `pnpm test:smoke`: PASS, compiled API liveness 200 / unavailable DB readiness 503 and both Next production servers HTTP 200.
- `TEST_DATABASE_URL=.../m1_root_test pnpm test:smoke`: PASS, also compiled API readiness 200 against migrated real DB.
- `git -c safe.directory=E:/WebstiteCMS diff --check`: no output; newly created files still untracked, so this is not a full new-file whitespace review.
- Fresh-source copy under .local-postgres/fresh-workspace: PASS frozen install, typecheck (8 tasks), build (6 tasks), with no pre-existing node_modules/dist/.next in the copy.
- `DATABASE_URL=.../m1_root_test pnpm db:migrate` and `pnpm db:seed`: PASS through documented CLI, in addition to integration test calls.
- Independent QA: BLOCKED by sandbox helper startup; the agent's elevated initial read waited 578 seconds then was aborted without output. No independent tests ran. See docs/M1_QA.md. Do not treat implementation checks above as independent QA.
- Hosted CI: NOT RUN; workflow provided, no Git remote configured.
- Product login/CRUD/publish/SEO business behavior: outside M1, NOT IMPLEMENTED, not claimed verified.

Initial failures were environmental/tooling: pnpm ignored esbuild scripts, Windows apply_patch launcher newline handling, sandbox helper startup. Resolved as recorded in ISSUES.md. No failed functional assertion in the checks above.

Final milestone status: READY_FOR_TEST. Implementation environment had an elevated workaround; independent QA execution remained blocked.
Browser responsive/visual verification and hosted CI have not run. PostgreSQL portable stopped successfully via pg_ctl; data retained.

---

### TR-20260907-M1-RERUN — Independent verification rerun

- Date/Time: 2026-09-07T07:54:00+07:00
- Environment: Windows, Node 24.18.0, pnpm 11.17.0, PostgreSQL 16.14 portable (`127.0.0.1:55432`).
- Target Branch: `main`

**Executed checks**:
1. `pnpm install --frozen-lockfile`: PASS (451ms, zero changes, dependencies aligned).
2. `pnpm lint`: PASS (ESLint 10.10.0 passed with zero warnings/errors).
3. `pnpm typecheck`: PASS (8 Turbo tasks passed across all packages/apps).
4. `pnpm test`: PASS (3 test files, 5 unit tests passed).
5. `pnpm build`: PASS (6 Turbo tasks passed, Next.js web/admin and Fastify API compiled).
6. PostgreSQL integration test against empty clean database `fresh_test_db`:
   `TEST_DATABASE_URL='postgresql://platform@127.0.0.1:55432/fresh_test_db' pnpm test:integration`:
   PASS (Clean migration, repeat migration, seed idempotency, UUIDv7 check, unique constraint, persistence across connection, readiness 200).
7. Production smoke test:
   `TEST_DATABASE_URL='postgresql://platform@127.0.0.1:55432/fresh_test_db' pnpm test:smoke`:
   PASS (Production API readiness against migrated PostgreSQL, live endpoint 200, unavailable DB readiness 503, web and admin HTTP 200).

**Checks NOT run / Scope limitations**:
- Hosted GitHub CI: NOT RUN (remote `origin` configured to https://github.com/raphaelbh89/Website.git, but no CI trigger executed yet).
- Browser visual / responsive verification: NOT RUN (M1 provides foundation placeholder screens only; no business UI).
- Definition of Done audit: M1 foundation meets all technical criteria for M1; status updated to `VERIFIED`. (Milestone not marked `DONE` pending initial baseline commit and upstream CI verification).

---

### TR-20260907-M2-1 — M2.1 Identity Schema & Persistence

- Date/Time: 2026-09-07T08:08:00+07:00
- Environment: Windows, Node 24.18.0, pnpm 11.17.0, PostgreSQL 16.14 portable (`127.0.0.1:55432`).
- Target Branch: `main`
- Baseline Commit: `9294b50`

**Executed checks**:
1. `pnpm db:generate`: PASS, generated `packages/database/drizzle/0001_milky_roland_deschain.sql` for `users`, `sessions`, `roles`, `permissions`, `role_permissions`, `user_role_assignments`.
2. `pnpm lint`: PASS (ESLint passed across whole monorepo with zero warnings/errors).
3. `pnpm typecheck`: PASS (9 Turbo tasks passed across all packages/apps).
4. `pnpm test`: PASS (3 test files, 9 unit tests passed including Argon2id hashing/verification, email normalization, high-entropy session token generation, SHA-256 token hashing, and scoped permission evaluation with global/site/campus/resource hierarchy).
5. `pnpm build`: PASS (6 Turbo tasks passed including Next.js web/admin and Fastify API compilation).
6. PostgreSQL integration test against fresh clean database `m2_clean_test_db`:
   `TEST_DATABASE_URL='postgresql://platform@127.0.0.1:55432/m2_clean_test_db' pnpm test:integration`:
   PASS:
   - Clean PostgreSQL 16 migration + repeat migration (idempotent).
   - Idempotent seed for sites, 15 system permissions, and `system_super_admin` role with all attached permissions.
   - User creation with Argon2id hash (never plain text password in DB).
   - Unique constraints on `users.email` and `sessions.token_hash`.
   - Session creation with SHA-256 token hash (never plain token in DB).
   - Scoped user role assignments (`global` and `site` scopes).
   - Persistence verification across independent database connections.
   - Foreign Key cascade delete verification (`DELETE FROM users` cleanly cascades to related sessions and role assignments).
   - Fastify `/health/ready` verification against the migrated DB.
7. Production smoke test:
   `TEST_DATABASE_URL='postgresql://platform@127.0.0.1:55432/m2_clean_test_db' pnpm test:smoke`:
   PASS (API live/ready against PostgreSQL 16, unavailable DB readiness 503, web/admin HTTP 200).

**Checks NOT run / Scope limitations**:
- Hosted CI on GitHub: NOT RUN.
- Authentication API endpoints (`/auth/login`, `/auth/logout`, `/auth/me`): Belongs to M2.2.
- Admin Login UI: Belongs to M2.2.
- Status for Slice M2.1: `VERIFIED`.

---

### TR-20260907-M2-2 — Authentication Vertical Slice & Security Hardening

- Date/Time: 2026-09-07T08:35:00+07:00
- Environment: Windows, Node 24.18.0, pnpm 11.17.0, PostgreSQL 16.14 portable (`127.0.0.1:55432`).
- Target Branch: `main`
- Baseline Commit: `a7b5a2d`

**Executed checks**:
1. `pnpm lint`: PASS (0 errors, 0 warnings).
2. `pnpm typecheck`: PASS (9 Turbo tasks across all packages/apps).
3. `pnpm test`: PASS (17 unit tests across 3 suites including CSRF Origin validation, referer fallback check, non-JSON Content-Type rejection, safe GET methods, cookie naming dev vs prod, and production `COOKIE_SECRET` validation).
4. `pnpm build`: PASS (6 Turbo tasks, Next.js web/admin and Fastify API compiled in production mode).
5. PostgreSQL 16 integration tests against fresh database `m2_full_pipeline_db`:
   - Admin bootstrap CLI logic (`pnpm auth:bootstrap-admin`) creating active user with Argon2id hash and assigning `system_super_admin` role via proper RBAC.
   - `POST /auth/login` valid credentials returning 200, setting `Set-Cookie` (`HttpOnly`, `SameSite=Lax`, `Path=/`), and storing only SHA-256 `token_hash` in DB (no raw token in DB).
   - `POST /auth/login` invalid password, unknown email, inactive user returning generic `401 Unauthorized` without user enumeration.
   - `GET /auth/me` with valid session cookie or Bearer token returning 200 with user profile and effective permissions grants.
   - `POST /auth/logout` revoking session in DB and clearing session cookie (`Max-Age=0`).
   - CSRF & Origin: Mutating requests with foreign Origin/Referer rejected with `403 Forbidden`; allowed Origin accepted; non-browser API clients with Bearer token allowed without Origin; safe GET requests never blocked.
   - Rate limiting: Login brute-force limit enforced (keying by `IP + normalized email`, 5 requests/minute).

**Component Status Breakdown**:
- `M2.2 Authentication API`: **VERIFIED**
- `M2.2 Database/session behavior`: **VERIFIED**
- `M2.2 Admin Login UI build`: **PASS**
- `M2.2 Browser runtime flow`: **NOT RUN / READY_FOR_TEST**
  - Reason: Headless Playwright manager download endpoint returned 404 for Windows runner in current environment.
- Overall M2.2 Milestone Status: **READY_FOR_TEST** (retained pending browser runtime per `DEFINITION_OF_DONE.md`).

---

### TR-20260907-M2-3 — Scoped Authorization Guards

- Date/Time: 2026-09-07T08:42:00+07:00
- Environment: Windows, Node 24.18.0, pnpm 11.17.0, PostgreSQL 16.14 portable (`127.0.0.1:55432`).
- Target Branch: `main`

**Executed checks**:
1. Scoped Authorization Guard Implementation (`apps/api/src/auth.guard.ts`):
   - `requireAuthentication`: Resolves session via cookie or Bearer token, attaches `request.authSession`, returns `401 Unauthorized` on missing/expired/inactive session.
   - `requirePermission`: Enforces permission check using hierarchical Scoped RBAC engine (`GLOBAL` and `SITE` scopes). Returns `401` if unauthenticated, returns `403 Forbidden` (`{"error":"FORBIDDEN","message":"Insufficient permissions for target scope"}`) if permission is missing.
2. Proof Routes Verification:
   - `GET /admin/proof` (guarded by `users.read` with `GLOBAL` scope):
     - Anonymous -> 401 Unauthorized
     - Global Admin with `users.read` -> 200 OK
     - Site Editor lacking `users.read` -> 403 Forbidden
     - Regular viewer lacking permission -> 403 Forbidden
   - `GET /sites/:siteId/proof` (guarded by `sites.read` with `SITE` scope):
     - Anonymous -> 401 Unauthorized
     - Global Admin -> 200 OK on Site A and Site B
     - Site Editor with Site A grant -> 200 OK on Site A
     - Site Editor with Site A grant -> 403 Forbidden on Site B (Verified Site Isolation)
     - Regular viewer lacking permission -> 403 Forbidden
3. Production Cookie Security Verification:
   - Name: `__Host-platform_session`
   - `HttpOnly = true`
   - `Secure = true`
   - `SameSite = Lax`
   - `Path = /`
   - `Domain` attribute is strictly ABSENT.
4. Session Lifecycle Hardening Verification:
   - Absolute expiry (> 7 days) -> 401
   - Idle timeout (> 24 hours) -> 401
   - Rolling `last_active_at` updates (recorded activity updates `last_active_at` timestamp after 15m)
   - User deactivation (`isActive = false`) -> existing active session is immediately rejected with 401.
5. Automated Test Pipeline:
   - `pnpm lint`: PASS
   - `pnpm typecheck`: PASS (9 Turbo tasks)
   - `pnpm test`: PASS (17 unit tests)
   - `pnpm build`: PASS (6 Turbo tasks)
   - `pnpm test:integration`: PASS (3 suites on dedicated clean PostgreSQL 16 DB `m2_full_pipeline_db`)
   - `pnpm test:smoke`: PASS (Production Fastify readiness, unavailable DB 503, web and admin HTTP 200)

**Status for Slice M2.3**: **VERIFIED**

---

### TR-20260907-M2-4 — Admin User & Role Management

- Date/Time: 2026-09-07T08:53:00+07:00
- Environment: Windows, Node 24.18.0, pnpm 11.17.0, PostgreSQL 16.14 portable (`127.0.0.1:55432`).
- Target Branch: `main`

**Executed checks**:
1. User Management REST APIs:
   - `GET /users`: Paginated, search by email/name, filter by `isActive`, deterministic ordering (`created_at DESC`), no sensitive secrets leaked (`password_hash`, `token_hash` omitted). Guarded by `users.read`.
   - `POST /users`: Normalized unique email, Argon2id password hashing, duplicate email returns `409 Conflict`, missing/invalid fields return `400 Bad Request`. Guarded by `users.create`.
   - `GET /users/:id`: Returns clean user summary. Guarded by `users.read`.
   - `PATCH /users/:id`: Updates name, email, active status, password. If password changes, existing sessions are revoked immediately in DB. Guarded by `users.update`.
   - `POST /users/:id/deactivate`: Sets `is_active = false` and deletes all active sessions for that user. Guarded by `users.deactivate`.
2. Role Management REST APIs:
   - `GET /roles`: Lists all roles with attached permissions. Guarded by `roles.read`.
   - `POST /roles`: Creates custom role with validated permissions. Duplicate key returns `409 Conflict`. Guarded by `roles.manage`.
   - `GET /roles/:id`: Returns role detail with permissions list. Guarded by `roles.read`.
   - `PATCH /roles/:id`: Updates role name/description. Guarded by `roles.manage`.
   - `PUT /roles/:id/permissions`: Replaces attached permissions with exact validated keys. System role `system_super_admin` is protected from being stripped of system permissions. Guarded by `roles.manage`.
   - `GET /permissions`: Lists catalog of available system permissions grouped by module. Guarded by `roles.read`.
   - `GET /sites`: Lists sites for scope selection. Guarded by `sites.read`.
3. Role Assignment REST APIs & Business Invariants:
   - `GET /users/:id/roles`: Returns active role assignments with scope details and site names. Guarded by `roles.assign`.
   - `POST /users/:id/roles`: Assigns role to user under `GLOBAL` or `SITE` scope. Guarded by `roles.assign`.
     - `GLOBAL` Invariant: Enforces `scope_id = NULL`. Non-null `scope_id` is rejected with `400 Bad Request`.
     - `SITE` Invariant: Enforces `scope_id` must be an existing valid site UUID in `sites` table. Nonexistent site rejected with `400 Bad Request`.
     - Duplicate Assignment Invariant: Enforces `(user_id, role_id, scope_kind, scope_id)` uniqueness via DB index `user_role_assignments_unique_idx NULLS NOT DISTINCT` + application check. Returns `409 Conflict`.
   - `DELETE /users/:id/roles/:assignmentId`: Removes role assignment. Guarded by `roles.assign`.
4. Protection of Last Administrative Access:
   - Self-deactivation of the last active global super admin is rejected with `400 Bad Request` (`Cannot deactivate the last active global system super admin`).
   - Removal/deletion of the last active global super admin assignment is rejected with `400 Bad Request` (`Cannot remove the last active global system super admin assignment`).
5. Admin UI Implementation (`apps/admin`):
   - `/users`: User listing table, search filter, pagination controls, status badge, create user modal, deactivate confirmation, manage role assignments modal with scope selector and live site dropdown from DB.
   - `/roles`: Role listing table, system role badge, create custom role modal, permission matrix modal grouped by module.
   - Top navigation tabs: `Dashboard`, `Users`, `Roles`.
   - Cookie-based HttpOnly session used (no tokens in `localStorage`/`sessionStorage`).
6. Automated Verification Pipeline:
   - `pnpm lint`: PASS (0 errors, 0 warnings).
   - `pnpm typecheck`: PASS (9 Turbo tasks across all packages).
   - `pnpm test`: PASS (17 unit tests).
   - `pnpm build`: PASS (6 Turbo tasks; Next.js routes `/`, `/_not-found`, `/login`, `/roles`, `/users` prerendered statically).
   - `pnpm test:integration`: PASS (4 full suites on PostgreSQL 16 clean DB `m24_clean_verify_db`).
   - `pnpm test:smoke`: PASS (Production Fastify readiness, unavailable DB 503, web and admin HTTP 200).

**Component Status Breakdown**:
- `M2.4 Admin User & Role APIs`: **VERIFIED**
- `M2.4 Database Schema & Invariants (0002_cultured_loki.sql)`: **VERIFIED**
- `M2.4 Admin UI build`: **PASS**
- `M2.4 Browser runtime flow`: **NOT RUN / READY_FOR_TEST**
  - Reason: Browser test runner binary download unavailable in local environment; API and UI build fully verified.
- Overall M2 Status: **READY_FOR_TEST** (pending browser runtime verification per `DEFINITION_OF_DONE.md`).



