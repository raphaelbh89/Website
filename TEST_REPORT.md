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

---

### TR-20260907-M3-1 — CMS Core Vertical Slice

- Date/Time: 2026-09-07T09:40:00+07:00
- Environment: Windows, Node 24.18.0, pnpm 11.17.0, PostgreSQL 16.14 portable (`127.0.0.1:55432`).
- Target Branch: `main`
- Dedicated Clean Database: `m31_clean_verify_db`

**Executed checks**:
1. ADR & Architecture Consistency:
   - `ADR-0007` & `ADR-0008` finalized and accepted with Revision-Pointer model (`current_revision_id` vs `published_revision_id`), CMS Field Schema format, and bi-directional no-shadowing.
2. Database Schema & Migration `0003_flaky_supernaut.sql`:
   - `content_types`: (id, key, name, description, kind, scope_kind, site_id, schema_version, is_system, data_schema, ui_schema, capabilities, created_at, updated_at).
   - `content_entries`: (id, site_id, content_type_id, locale, translation_group_id, entry_kind, current_revision_id, published_revision_id, published_slug, lifecycle_state, created_by, created_at, updated_at).
   - `content_entry_revisions`: (id, entry_id, version_number, schema_version, title, slug, data, created_by, created_at).
   - Partial unique indexes for Singleton (`WHERE entry_kind = 'single'`) and Published Slug routing (`WHERE published_slug IS NOT NULL`).
   - Verified `pnpm db:generate` reports 0 schema drift ("No schema changes, nothing to migrate 😴").
3. CMS Field Schema & 5 Supported Field Types:
   - Allow-list activated: `text`, `textarea`, `number`, `boolean`, `select`.
   - Rejection of unsupported types (`media`, `relation`, etc.) in M3.1.
   - Evolution: `schema_version` incremented safely on non-breaking additions, breaking mutations rejected when populated entries exist.
4. Bi-directional No-Shadowing & Concurrency Serialization:
   - Global type creation rejected if any Site type exists with same key across platform.
   - Site type creation rejected if any Global type exists with same key.
   - Hashed normalized key serialization via PostgreSQL advisory transaction locks (`pg_advisory_xact_lock(hashtext(LOWER(key)))`).
5. Revision-Pointer & Publishing Lifecycle:
   - Non-destructive draft edits: Editing a published entry creates a new revision N+1 and updates `current_revision_id`, while `published_revision_id` and `published_slug` remain intact.
   - Public content resolver (`GET /public/sites/:siteId/content/:typeKey/:slug`) reads ONLY `published_revision_id` when `lifecycle_state = 'active'`.
   - Zero draft leakage, zero 404 on ongoing draft edits.
   - Published slug conflict check returns `409 Conflict`.
   - Singleton enforcement returns `409 Conflict` on duplicate creation.
   - Optimistic concurrency control via `expectedRevision` returning `409 Conflict` on stale update attempts.
6. Admin UI (`apps/admin`):
   - `/content-types`: Schema viewer, create content type modal with 5-field schema builder, kind selector (`collection`/`single`), scope selector (`global`/`site`).
   - `/content`: Content entries table with revision & publishing status badges, dynamic form renderer keyed by field type (`text`, `textarea`, `number`, `boolean`, `select`), edit draft, publish to live, and archive actions.
   - Top navigation updated across all admin views.
7. Automated Verification Pipeline:
   - `pnpm lint`: PASS (0 errors, 0 warnings)
   - `pnpm typecheck`: PASS (9 Turbo tasks across all packages)
   - `pnpm test`: PASS (17 unit tests)
   - `pnpm build`: PASS (6 Turbo tasks including `/content-types` and `/content` static prerender)
   - `pnpm test:integration`: PASS (5 full integration suites against clean PostgreSQL 16 DB `m31_clean_verify_db`)
   - `pnpm test:smoke`: PASS (Production Fastify readiness, unavailable DB 503, web and admin HTTP 200)

**M3.1 Invariant Closures & Verification**:
1. Revision ownership integrity:
   - Enforced at service/transaction boundary (`publishContentEntry` verifies `currentRev.entry_id === entry.id`).
   - Integration negative test verified: Attempting to assign or publish Entry A pointing to Entry B's revision rejected with HTTP 400 (`Integrity violation: revision does not belong to this content entry`).
2. Immutable Content Type identity:
   - Policy: `key`, `scope_kind`, and `site_id` are strictly immutable; `kind` is immutable once any `ContentEntry` exists for the type.
   - Integration negative test verified: Attempting to mutate `key` returns 400 (`ContentType key cannot be changed`); attempting to change `kind` from `collection` to `single` when populated entries exist returns 400 (`Cannot change ContentType kind once entries exist`).
3. No-shadowing concurrency race test:
   - Concurrency integration test with parallel `Promise.all` creating GLOBAL type and SITE type with same key.
   - Result: Exactly one succeeds with HTTP 201, exactly one receives HTTP 409 Conflict. Zero deadlock via PostgreSQL advisory transaction lock (`pg_advisory_xact_lock(hashtext(LOWER(key)))`).
4. Canonical BCP-47 locale validation:
   - Validated via canonical BCP-47 tag subset regex (`/^[a-z]{2,3}(-[A-Za-z0-9]{2,4})*$/`).
   - `vi`, `en`, `zh-CN` accepted; invalid locale strings rejected with HTTP 400.
   - `translation_group_id` strictly server-controlled on entry creation.

**Component Status Breakdown**:
- `M3.1 Content Engine DB/API`: **VERIFIED**
- `M3.1 Admin UI Build`: **PASS**
- `M3.1 Browser Runtime`: **NOT RUN / READY_FOR_TEST**
- `M3.1 Overall`: **READY_FOR_TEST**
- Milestone M3 overall status: **IN_PROGRESS**.

---

### TR-20260907-M3-2 — Taxonomy & Categories Engine

- Date/Time: 2026-09-07T10:10:00+07:00
- Environment: Windows, Node 24.18.0, pnpm 11.17.0, PostgreSQL 16.14 portable (`127.0.0.1:55432`).
- Target Branch: `main`
- Dedicated Clean Database: `m32_clean_verify_db`

**Executed checks**:
1. ADR & Architecture Consistency:
   - `ADR-0009` accepted: Hybrid global/site taxonomies, always site-bound terms, bi-directional no-shadowing via PostgreSQL advisory transaction locks, transaction-safe subtree move with CTE cycle detection and rigid depth cap (`depth <= 5`), tree mutation advisory lock (`tree:taxId:siteId`), activation/deactivation rules, and revision-term snapshotting (`content_revision_terms`).
2. Database Schema & Migration `0004_condemned_invisible_woman.sql`:
   - `taxonomies`: (id, key, name, description, scope_kind, site_id, is_hierarchical, is_system, is_active, created_at, updated_at).
   - `taxonomy_terms`: (id, taxonomy_id, site_id, parent_id, depth, key, name, description, sort_order, is_active, created_at, updated_at).
   - `content_type_taxonomies`: (content_type_id, taxonomy_id, is_required, min_terms, max_terms, sort_order).
   - `content_revision_terms`: (revision_id, taxonomy_term_id, sort_order).
   - Unique constraints, check constraints (`depth >= 0 AND depth <= 5`, `parent_id <> id`), and foreign key cascade/restrict rules verified.
   - Verified `pnpm db:generate` reports 0 schema drift ("No schema changes, nothing to migrate 😴").
3. Namespace & Concurrency Serialization:
   - Global taxonomy creation (`category`) succeeds.
   - Creating Site taxonomy with same key (`category`) rejected with 409 Conflict.
   - Creating Site-specific taxonomy (`campus-dept`) succeeds.
   - Creating Global taxonomy with key matching existing site taxonomy rejected with 409 Conflict.
   - Concurrency race test: `Promise.all` with concurrent GLOBAL and SITE taxonomy creation on same key: exactly one succeeds (201), exactly one receives 409 Conflict, zero deadlock.
4. Terms Hierarchy, Cycle Prevention, maxDepth=5, and Subtree Move:
   - Root term creation (D:0) succeeds; duplicate term key in same taxonomy and site rejected (409).
   - Terms are site-bound: Site B can create term with same key as Site A without collision.
   - Cross-site parent assignment rejected with 400 Bad Request.
   - Linear hierarchy Root(D:0) -> Child1(D:1) -> Child2(D:2) -> Child3(D:3) -> Child4(D:4) -> Child5(D:5) verified.
   - Attempting to create Child 6 (depth 6) rejected with 400 Bad Request (`maxDepth = 5`).
   - Self-parent attempt rejected (`parent_id <> id`).
   - Moving node into its own descendant subtree rejected with 400 Bad Request (CTE cycle detection).
   - Subtree move: Moving subtree (c3..c5) under root `admissions` atomically recomputes depths for the node and all descendants.
5. Activation / Deactivation Invariants:
   - Deactivating parent term while active descendants exist rejected with 400 Bad Request.
   - Deactivating leaf term succeeds; inactive term cannot be newly assigned to a content entry.
6. ContentType ↔ Taxonomy Bindings:
   - Global ContentType attaching Site Taxonomy rejected with 400 Bad Request.
   - Attaching Global Taxonomy to Global ContentType succeeds with required=true, minTerms=1, maxTerms=2.
7. Revision-Term Snapshots & Zero Draft Leakage:
   - Content entry creation enforces required taxonomy and validates terms.
   - Published Revision 1 with category `news` is live on public endpoint.
   - Draft Revision 2 updates category to `admissions` and headline.
   - Public endpoint continues to serve Revision 1 with `news` (Zero Draft Leakage verified).
   - Public filter by term `news` returns 1 item; public filter by term `admissions` returns 0 items.
   - Publishing Revision 2 makes `admissions` live publicly.
8. Copy-Forward Behavior:
   - Updating title in Revision 3 with `taxonomyAssignments` omitted automatically copies forward Revision 2's taxonomy terms without term loss.
9. Term Metadata Versioning Boundary:
   - Updating Term display name (`name: "Tuyển sinh 2026"`) immediately reflects in live public content detail without creating a new revision.
10. Admin UI (`apps/admin/app/taxonomies/page.tsx`):
    - Hierarchical taxonomy list, Global/Site indicators, tree term renderer, edit/move terms, activation toggle. Static build prerender PASS.
11. Automated Verification Pipeline:
    - `pnpm lint`: PASS (0 errors, 0 warnings).
    - `pnpm typecheck`: PASS (9 Turbo tasks across all packages).
    - `pnpm test`: PASS (17 unit tests).
    - `pnpm build`: PASS (6 Turbo tasks including `/taxonomies`).
    - `pnpm test:integration`: PASS (6 full integration suites against clean PostgreSQL 16 DB `m32_clean_verify_db`).
    - `pnpm test:smoke`: PASS (Production Fastify readiness, unavailable DB 503, web and admin HTTP 200).

**Component Status Breakdown**:
- `M3.2 Taxonomy Engine DB/API`: **VERIFIED**
- `M3.2 Admin UI Build`: **PASS**
- `M3.2 Browser Runtime`: **NOT RUN / READY_FOR_TEST**
- `M3.2 Overall`: **READY_FOR_TEST**

---

### TR-20260907-M3-CLOSURE — M3 Final Closure Verification

- **Date/Time**: 2026-09-07T10:37:00+07:00
- **Agent/Role**: Backend / Admin / QA
- **Scope**: M3 Final Closure: Public Taxonomy Multi-site Deterministic Routing Scope, Admin Taxonomy Integration Completeness, Archive/Public Semantics Regression, and Revision-Term Transaction Atomicity.
- **Dedicated Clean Database**: `m3_closure_clean_verify_db`

**Executed checks**:
1. **Public Taxonomy Multi-Site Deterministic Routing**:
   - Fixed endpoint route to site-aware candidate: `GET /public/sites/:siteId/content-types/:typeKey/taxonomies/:taxKey/terms/:termKey/entries` (with route alias `/public/sites/:siteId/content/:typeKey/taxonomies/:taxKey/:termSlug`).
   - Querying Site A returns strictly Site A content (`news-site-a`), total: 1.
   - Querying Site B returns strictly Site B content (`news-site-b`), total: 1.
   - Querying unknown site (`00000000-0000-0000-0000-000000000000`) returns 404 NOT_FOUND.
   - Querying Site A with term existing only in Site B (`exclusive-b`) returns empty total: 0, with zero cross-site fallback.
   - Querying with `?locale=vi` returns only Vietnamese entry and does not return English entry.
   - Querying with `?locale=en` returns only English entry.
   - Draft-only taxonomy assignment does not match public filter (total: 0) until published (total: 1).
2. **Admin Taxonomy Integration Completeness**:
   - `/taxonomies`: List, create, terms hierarchy, reparenting, activate/deactivate verified (`apps/admin/app/taxonomies/page.tsx`).
   - ContentType Taxonomy Binding UI (`apps/admin/app/content-types/page.tsx`): Added "Taxonomies" action button and modal for configuring bound taxonomies (`isRequired`, `minTerms`, `maxTerms`, `sortOrder`) with strict scope filtering (Global ContentTypes can only bind Global Taxonomies; Site ContentTypes can only bind Global or own Site Taxonomies).
   - Content Entry Taxonomy Editor (`apps/admin/app/content/page.tsx`): Added Dynamic Taxonomy Controls section deriving directly from `content_type_taxonomies`. Loads active terms for site, hierarchical tree depth indentation, multi-select checkboxes, initial terms population from `current_revision_id.terms`, preserves terms when saving, and sends complete taxonomy assignment snapshot.
3. **Taxonomy Archive / Public Semantics Regression**:
   - Deactivating a term: Content detail still resolvable/displayable with historical term; new revision cannot assign inactive term (400 Bad Request); public taxonomy navigation excludes inactive term (total: 0).
   - Deactivating a taxonomy: Historical published content revision relation remains intact in database and resolvable; public taxonomy filter excludes inactive taxonomy (total: 0); no rows deleted in `content_revision_terms`.
4. **M3 Revision-Term Transaction Atomicity**:
   - Creating a draft update (Revision N+1) with invalid taxonomy assignment (cross-site term ID from Site B) fails with 400 Bad Request.
   - PostgreSQL transaction rollback verified: `current_revision_id` remains N, `published_revision_id` remains unchanged, `content_entry_revisions` count is unchanged (zero orphan revisions), and no partial rows created in `content_revision_terms`.
5. **Full Automated Verification Pipeline**:
   - `pnpm lint`: PASS (0 errors, 0 warnings).
   - `pnpm typecheck`: PASS (9 Turbo tasks across all packages).
   - `pnpm test`: PASS (17 unit tests).
   - `pnpm build`: PASS (6 Turbo tasks across web, admin, api, config, database, auth).
   - `pnpm test:integration`: PASS (7 full integration test suites against clean PostgreSQL 16 DB `m3_closure_clean_verify_db`).
   - `pnpm test:smoke`: PASS (Production Fastify readiness, unavailable DB 503, web and admin HTTP 200).
   - `pnpm db:generate`: PASS ("No schema changes, nothing to migrate 😴").

**M3 Final Status**:
- `M3 Content Engine Backend/API`: **VERIFIED**
- `M3 Taxonomy Backend/API`: **VERIFIED**
- `M3 Admin UI Build`: **PASS**
- `M3 Browser Runtime`: **NOT RUN / READY_FOR_TEST**
- `M3 Overall`: **READY_FOR_TEST**

---

### TR-20260908-M3-AUDIT — M3 Audit Remediation and Independent Closure

- **Date/Time**: 2026-09-08T07:09:00+07:00
- **Environment**: Windows, Node 24.18.0, pnpm 11.17.0, PostgreSQL 16.14 portable (`127.0.0.1:55432`)
- **Scope**: all findings in `AUDIT-001`, while preserving the complete M3 content/taxonomy closure.
- **Clean databases**: `m3_final_fresh_20260908_0709` (fresh full migration) and `m3_final_upgrade_20260908_0709` (0000-0004 baseline then 0005 and repeat migrate).

**Automated evidence**

- `pnpm lint`: PASS, zero errors/warnings.
- `pnpm typecheck`: PASS, 9/9 Turbo tasks.
- `pnpm test`: PASS, 42/42 tests across 4 files.
- `pnpm build`: PASS, 6/6 Turbo tasks; all Admin routes prerendered.
- `pnpm test:integration`: PASS, 7/7 suites on the fresh database, including regional locale canonicalization and revision-pointer ownership/cascade checks.
- `pnpm test:migration-upgrade`: PASS, clean 0004 baseline -> forward-only 0005 -> repeat migrate, with PostgreSQL catalog assertions.
- `pnpm test:smoke`: PASS, production API live/ready behavior and web/admin HTTP.
- `pnpm db:generate`: PASS, no schema drift.
- `git diff --check`: PASS.

**Browser runtime evidence**

- In-app browser against real Admin (`localhost:3001`), API (`localhost:4000`) and PostgreSQL: PASS.
- Login with synthetic super-admin, HttpOnly session persistence, dashboard, Users, Roles, Content Types, taxonomy binding modal, Taxonomies, and Content Entries all loaded through the configured API origin.
- Created `Browser Matrix Entry` with optional numeric input blank, edited it to revision 2, published it, and observed `PUBLISHED` plus draft/published slug projection.
- Logout cleared the session and redirected to `/login`.

**Independent QA**

- Independent QA reran lint, typecheck, 42 unit tests, 7 integration suites on `qa_m3_fresh_20260908_0703`, 0004->0005 upgrade on `qa_m3_upgrade_20260908_0703`, build, smoke and diff checks.
- Final independent QA result: PASS; no open P0/P1/P2 finding.

**Final status**: M3 Backend/API `VERIFIED`; Admin Build `VERIFIED`; Browser Runtime `VERIFIED`; M3 Overall `DONE`.

---

### TR-20260909-M2-GOVERNANCE — M2 DoD reconciliation

- M2.1 identity persistence, M2.2 authentication/session, M2.3 scoped authorization and M2.4 user/role management already had passing API, PostgreSQL, security, negative-path, build and smoke evidence in their respective test reports.
- The only documented blocker retaining overall M2 at `READY_FOR_TEST` was browser runtime.
- `TR-20260908-M3-AUDIT` exercised the same real Admin/API/PostgreSQL runtime and verified login, HttpOnly session persistence, Users, Roles and logout redirect. Independent source audit #2 subsequently passed and explicitly approved M3 `DONE`.
- No other M2-specific acceptance blocker is recorded in `ISSUES.md` or the prior M2 evidence.

**Governance result**: final documented browser blocker closed; M2 overall status reconciled to `DONE` under `DEFINITION_OF_DONE.md`.


