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
- Authentication API endpoints (`/auth/login`, `/auth/logout`, `/auth/me`): Belongs to M2.2 (NOT YET IMPLEMENTED).
- Admin Login UI: Belongs to M2.2 (NOT YET IMPLEMENTED).
- Status for Slice M2.1: `VERIFIED`.


