# DEV_LOG.md — Nhật ký tiến độ

> `PROGRESS.md` là trạng thái hiện tại. `DEV_LOG.md` là lịch sử append-only theo từng phiên làm việc.

## Quy tắc ghi log

Sau mỗi phiên có thay đổi đáng kể, thêm entry mới ở đầu hoặc cuối file nhưng không xóa lịch sử cũ.

Mỗi entry phải ghi:

- thời gian;
- Agent/Role;
- task;
- files changed;
- quyết định quan trọng;
- commands đã chạy;
- PASS/FAIL;
- vấn đề còn lại;
- trạng thái sau phiên;
- bước tiếp theo chính xác.

---

## 2026-09-08 — M2/M3 audit remediation started

**Agent/Role:** Backend / Admin remediation; independent QA required before final closure.

**Task:** Preserve current M3 closure and remediate reviewer findings before browser runtime, commit, or M4.

**Pre-remediation working-tree snapshot:**

- Modified: `.env.example`, `.gitignore`, `DEV_LOG.md`, `HANDOFF.md`, `PROGRESS.md`, `PROJECT_STATE.md`, `TEST_REPORT.md`.
- Modified Admin: `apps/admin/app/content-types/page.tsx`, `content/page.tsx`, `login/page.tsx`, `page.tsx`, `roles/page.tsx`, `taxonomies/page.tsx`, `users/page.tsx`, `apps/admin/tsconfig.json`.
- Modified API: `apps/api/src/app.test.ts`, `app.ts`, `content.service.ts`, `taxonomy.service.ts`.
- Modified architecture/database: `docs/adr/0005-auth-session-strategy.md`, `packages/database/drizzle/meta/_journal.json`, `packages/database/src/database.integration.test.ts`, `index.ts`, `reset-test-db.ts`, `schema.ts`.
- Untracked: `apps/admin/lib/api.ts`, `docs/adr/0010-media-storage-and-processing.md`, `packages/database/drizzle/0005_worried_starjammers.sql`, `packages/database/drizzle/meta/0005_snapshot.json`.
- Baseline HEAD: `6f98114` (`feat(cms): implement M3.2 taxonomy engine and revision-term snapshots`). Branch: `main`.

**Preservation rule:** no reset, checkout, stash, or commit until audit remediation and regression complete. M3 closure changes remain in place.

**Resulting status:** `IN_PROGRESS`. ADR-0010 remains `Proposed`; M4 implementation forbidden in this task.

---

## 2026-09-07 — Documentation Architecture Bootstrap

**Agent/Role:** Lead Architect / Documentation Bootstrap

**Task:** Chuẩn hóa ý tưởng thành kiến trúc kỹ thuật và bộ governance cho Multi-Agent.

**Created:**

- README/MASTER_PROMPT
- AGENTS/RULES/ROLES/ROLL
- WORKFLOW/PROJECT_STATE/PROGRESS/HANDOFF
- TESTING/TEST_REPORT/DEFINITION_OF_DONE
- architecture/domain documents
- ADR baseline
- specialized Agent prompts

**Verification:**

- Documentation files generated successfully.
- No application source code exists yet.
- No runtime product feature has been claimed as DONE.

**Status:** `VERIFIED` for documentation milestone M0.

**Next:** Start M1 — Monorepo Foundation after stack ADRs are finalized.

---

## Entry Template

## 2026-09-07 — M1 Foundation implementation

**Agent/Role:** Orchestrator / Backend; separate m1_qa agent for independent verification.

**Task:** Build runnable workspace foundation defined by M1.

**Files changed:** workspace/tooling/lockfile/env/Compose/CI at root; apps/web, apps/admin, apps/api;
packages/config, packages/database, packages/auth; scripts/smoke.mjs; ADR-0004;
README, PROJECT_STATE, PROGRESS, TEST_REPORT, ISSUES, HANDOFF and local PostgreSQL instructions.

**Decisions:** Next/React shared frontend stack, Fastify API, Drizzle relational migration; auth/session deferred to M2;
only a global/site permission contract skeleton in M1. Source code is not a functional CMS yet.

**Commands/results:** PASS install/frozen install, db:generate, typecheck, lint, 5 unit tests,
production build, real PostgreSQL 16 integration, db:migrate/db:seed CLI, production smoke with healthy/unavailable DB.
Fresh-source copy frozen install/typecheck/build also PASS. Detailed evidence: TEST_REPORT.md TR-20260907-M1.

**Environment:** Git initialized; no commit/remote. Docker CLI missing, so PostgreSQL 16 portable used for isolated QA.
Sandbox helper/patch launcher issues worked around via authorized direct apply_patch execution.
No production/service installation; .local-postgres artifacts kept and ignored.

**Resulting status:** READY_FOR_TEST. Independent QA blocked before reading/running tests by sandbox helper failure; no independent approval claimed. PostgreSQL portable stopped; data retained.
**Next exact step:** restore QA execution and independently verify M1, then M2 auth/session and RBAC scope ADRs.

## 2026-09-07 07:55 — M1 Independent Verification Rerun

**Agent/Role:** Orchestrator / Backend / QA
**Task:** Độc lập chạy lại toàn bộ verification cho Milestone M1, giải quyết blocker ENV-M1-001 và chuẩn hóa trạng thái repo trước M2.

**Files changed:**
- `TEST_REPORT.md`: Bổ sung bằng chứng TR-20260907-M1-RERUN cho 7 bước kiểm thử.
- `PROJECT_STATE.md`: Cập nhật Stage thành FOUNDATION_VERIFIED.
- `PROGRESS.md`: Chuyển M1 từ READY_FOR_TEST sang VERIFIED.
- `ISSUES.md`: Đánh dấu ENV-M1-001 là RESOLVED.
- `HANDOFF.md`: Cập nhật trạng thái handoff.

**Decisions:**
- M1 đạt tiêu chí VERIFIED. Chưa chuyển DONE vì còn chờ initial baseline commit và hosted CI trigger.

**Commands:**
- `pnpm install --frozen-lockfile` -> PASS
- `pnpm lint` -> PASS
- `pnpm typecheck` -> PASS
- `pnpm test` -> PASS
- `pnpm build` -> PASS
- Portable PostgreSQL 16 `pg_ctl start` -> PASS
- `TEST_DATABASE_URL=.../fresh_test_db pnpm test:integration` -> PASS
- `TEST_DATABASE_URL=.../fresh_test_db pnpm test:smoke` -> PASS

**Issues:**
- Hosted GitHub CI chưa chạy do chưa có commit/push ban đầu.
- Trình duyệt UI visual/responsive chưa áp dụng vì M1 chỉ có màn hình kỹ thuật foundation.

**Resulting status:** M1: VERIFIED.
**Next exact step:** Tạo baseline commit `feat: establish M1 platform foundation`, push remote nếu có quyền, sau đó soạn thảo 2 ADR kiến trúc cho M2 (0005-auth-session-strategy.md và 0006-rbac-scope-strategy.md).

## 2026-09-07 08:02 — Git Baseline & M2 Architecture Decisions (ADR-0005 & ADR-0006)

**Agent/Role:** Lead Architect / Security / Backend
**Task:** Thiết lập baseline commit M1 trên Git, push lên GitHub remote, và xây dựng 2 quyết định kiến trúc quan trọng cho M2: Auth/Session Strategy và Scoped RBAC Strategy.

**Files changed:**
- `docs/adr/0005-auth-session-strategy.md` (NEW): Chốt chiến lược session opaque phía server, SHA-256 token hashing trong DB, HttpOnly/Secure/SameSite=Lax cookie, mật khẩu Argon2id (`@node-rs/argon2`), login rate limiting, generic auth error, CSRF header verification.
- `docs/adr/0006-rbac-scope-strategy.md` (NEW): Chốt kiến trúc phân quyền đa cấp độ Scoped RBAC (GLOBAL, SITE, CAMPUS, RESOURCE), phân tách User -> RoleAssignment -> Role -> RolePermission -> Permission, cơ chế allow-list tường minh, deny-by-default, đặt tên quyền `<resource>.<action>`.
- `PROJECT_STATE.md`: Cập nhật các quyết định M2 đã chốt.
- `PROGRESS.md`: Chuyển milestone M2 sang IN_PROGRESS.
- `HANDOFF.md`: Cập nhật checkpoint M2.

**Git Operations:**
- Baseline commit created: `9294b50 feat: establish M1 platform foundation`.
- Remote origin added: `https://github.com/raphaelbh89/Website.git`.
- Git push executed: `git push -u origin main` -> PASS (Pushed to origin/main successfully).

**Decisions:**
- Không dùng JWT thuần hoặc localStorage cho admin web session.
- Không hard-code role string `user.role = 'admin'` hay `is_super_admin` trong code.
- Chuẩn bị bước tiếp theo: M2.1 Identity Schema & Persistence (Drizzle schema, migration, seed).

**Resulting status:** M2: IN_PROGRESS (Architecture checkpoint reached).
**Next exact step:** Thực hiện vertical slice M2.1 — Identity schema (users, sessions, roles, permissions, role_permissions, user_role_assignments).

## 2026-09-07 08:08 — M2.1 Identity Schema & Persistence Completed

**Agent/Role:** Backend / Security / Database
**Task:** Triển khai lát cắt M2.1: Identity schema, Argon2id password hashing, session tokens, scoped permissions evaluation engine, database migration và integration tests.

**Files changed:**
- `packages/auth/package.json`: Thêm `@node-rs/argon2`.
- `packages/auth/src/index.ts`: Bổ sung `hashPassword`, `verifyPassword` (Argon2id RFC 9106), `normalizeEmail`, `generateSessionToken`, `hashSessionToken` (SHA-256), `hasPermission` hỗ trợ `GLOBAL`, `SITE`, `CAMPUS`, `RESOURCE` và wildcard `*`.
- `packages/auth/src/auth.test.ts`: Thêm unit tests cho Argon2id, tokens, email normalization và hierarchical scoped grants.
- `packages/database/src/schema.ts`: Định nghĩa các bảng `users`, `sessions`, `roles`, `permissions`, `role_permissions`, `user_role_assignments` với UUIDv7 và foreign keys cascade.
- `packages/database/drizzle/0001_milky_roland_deschain.sql`: Generated SQL migration file.
- `packages/database/src/index.ts`: Export các bảng schema và bổ sung `seedDatabase` với 15 system permissions chuẩn và `system_super_admin` role.
- `packages/database/src/database.integration.test.ts`: Test migration sạch, repeat migration, seed idempotency, FKs, UUIDv7, unique constraints, quan hệ roles/permissions, và Argon2id/token persistence trên PostgreSQL 16 thật.

**Commands:**
- `pnpm db:generate` -> PASS
- `pnpm lint` -> PASS
- `pnpm typecheck` -> PASS (9 tasks)
- `pnpm test` -> PASS (9 unit tests)
- `pnpm build` -> PASS (6 tasks)
- `TEST_DATABASE_URL=.../m2_clean_test_db pnpm test:integration` -> PASS (tested against clean PostgreSQL 16)
- `TEST_DATABASE_URL=.../m2_clean_test_db pnpm test:smoke` -> PASS

**Resulting status:** M2.1: VERIFIED.
**Next exact task:** M2.2 — Authentication Vertical Slice (Login API `POST /auth/login`, Logout `POST /auth/logout`, Me `GET /auth/me`, cookies/session Fastify plugin, và Admin Login UI).

## 2026-09-07 08:26 — M2.2 Authentication Vertical Slice Completed

**Agent/Role:** Backend / Security / Admin Frontend
**Task:** Triển khai lát cắt M2.2: Fastify authentication infrastructure (`@fastify/cookie`, `@fastify/cors`, `@fastify/rate-limit`), `AuthService` (Argon2id verification, SHA-256 session token hashing, rolling update), API endpoints `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`, CSRF Origin verification hook, Next.js Admin Login UI & Protected Dashboard, bootstrap admin CLI (`pnpm auth:bootstrap-admin`), and comprehensive integration & smoke tests.

**Files changed:**
- `packages/config/src/index.ts`: Bổ sung cấu hình `COOKIE_SECRET` và `CORS_ORIGIN`.
- `packages/auth/src/index.ts`: Thêm hằng số và helper session cookie `SESSION_COOKIE_NAME`, `SESSION_COOKIE_NAME_PROD`, `getSessionCookieName`.
- `apps/api/package.json`: Cài đặt `@fastify/cookie`, `@fastify/cors`, `@fastify/rate-limit`, `@platform/auth`, `drizzle-orm`.
- `apps/api/src/auth.service.ts` (NEW): Triển khai `AuthService` (`login`, `resolveSession`, `logout`) tuân thủ nghiêm ngặt ADR-0005.
- `apps/api/src/app.ts`: Tích hợp plugins, CSRF preHandler hook kiểm tra mutating origin, và 3 authentication endpoints.
- `apps/api/src/server.ts`: Truyền biến môi trường runtime cho Fastify app.
- `apps/api/src/app.test.ts`: Thêm unit tests cho CSRF Origin verification.
- `apps/admin/app/login/page.tsx` (NEW): Triển khai Next.js Admin Login form.
- `apps/admin/app/page.tsx`: Triển khai Protected Admin Dashboard.
- `packages/database/src/cli.ts` & `package.json`: Triển khai command `pnpm auth:bootstrap-admin`.
- `packages/database/src/database.integration.test.ts`: Mở rộng integration test kiểm thử toàn bộ auth flow trên PostgreSQL 16 thật.

**Commands:**
- `pnpm lint` -> PASS (0 warnings/errors)
- `pnpm typecheck` -> PASS (9 tasks)
- `pnpm test` -> PASS (12 unit tests)
- `pnpm build` -> PASS (6 tasks)
- `TEST_DATABASE_URL=.../m2_clean_verify_db pnpm test:integration` -> PASS (2 suites)
- `TEST_DATABASE_URL=.../m2_smoke_db pnpm test:smoke` -> PASS

**Resulting status:** M2.2: READY_FOR_TEST (API & Database Verified; Browser Runtime Not Run).
**Next exact task:** M2.3 — Scoped Authorization Guards.

## 2026-09-07 08:42 — M2.2 Security Hardening & M2.3 Scoped Authorization Guards Completed

**Agent/Role:** Backend / Security / Platform
**Task:** Hoàn tất bảo mật cho M2.2 (CSRF transport hardening, idle timeout 24h, rolling activity update, production cookie `__Host-` validation, IP+email rate limiting) và triển khai Milestone M2.3 Scoped Authorization Guards (`requireAuthentication` và `requirePermission` preHandlers, hierarchical Scoped RBAC `GLOBAL`/`SITE`, proof endpoints `/admin/proof` và `/sites/:siteId/proof`, và comprehensive integration tests trên PostgreSQL 16).

**Files changed:**
- `packages/config/src/index.ts` & `packages/config/src/config.test.ts`: Bổ sung `superRefine` kiểm tra bắt buộc `COOKIE_SECRET` trong production không được dùng default và có độ dài >= 32 ký tự.
- `packages/auth/src/auth.test.ts`: Bổ sung unit tests cho cookie naming dev vs prod.
- `apps/api/src/auth.service.ts`: Bổ sung kiểm tra timeout idle 24 giờ (`IDLE_TIMEOUT_MS = 24 * 60 * 60 * 1000`) và cập nhật rolling `last_active_at`.
- `apps/api/src/auth.guard.ts` (NEW): Triển khai `requireAuthentication` và `requirePermission` preHandler hooks.
- `apps/api/src/app.ts`: Tích hợp CSRF/Content-Type check, `keyGenerator` theo IP + normalized email cho rate-limiting login, bảo đảm cookie production không có `Domain` attribute, và đăng ký 2 proof endpoints (`GET /admin/proof` và `GET /sites/:siteId/proof`).
- `apps/api/src/app.test.ts`: Mở rộng unit tests cho referer origin fallback, non-JSON Content-Type rejection (415), safe GET requests, và non-browser Bearer API client requests.
- `packages/database/src/database.integration.test.ts`: Mở rộng integration tests kiểm thử toàn diện production cookie, absolute timeout, idle timeout, rolling active update, user deactivation session invalidation, global grants, site isolation (site A grant allow site A, deny site B), unauthenticated (401), và insufficient permissions (403).
- `scripts/smoke.mjs`: Thêm `COOKIE_SECRET` cho production launch.

**Commands:**
- `pnpm lint` -> PASS (0 errors, 0 warnings)
- `pnpm typecheck` -> PASS (9 tasks)
- `pnpm test` -> PASS (17 unit tests across 3 suites)
- `pnpm build` -> PASS (6 tasks)
- `TEST_DATABASE_URL=.../m2_full_pipeline_db pnpm test:integration` -> PASS (3 suites on clean PostgreSQL 16)
- `TEST_DATABASE_URL=.../m2_full_pipeline_db pnpm test:smoke` -> PASS

**Resulting status:**
- M2.2: `READY_FOR_TEST` (API & DB Verified; Browser UX Not Run)
- M2.3: `VERIFIED`
**Next exact task:** M2.4 — Admin User & Role Management CRUD.

---

## 2026-09-07 08:54 — M2.4 Admin User & Role Management Completed

**Agent/Role:** Backend / Admin / Security
**Task:** Triển khai Milestone M2.4 Admin User & Role Management (REST APIs đầy đủ cho Users, Roles, Permissions, Sites, Role Assignments; Database unique index migration `0002_cultured_loki.sql`; Last Super Admin Protection; Admin UI quản lý Users và Roles trong Next.js; và Comprehensive Integration Test Suite trên PostgreSQL 16 clean DB).

**Files changed / created:**
- `packages/database/src/schema.ts`: Thêm `uniqueIndex('user_role_assignments_unique_idx').on(table.userId, table.roleId, table.scopeKind, table.scopeId)` cho `userRoleAssignments`.
- `packages/database/drizzle/0002_cultured_loki.sql` (NEW): Generated migration với `NULLS NOT DISTINCT` cho PostgreSQL 16.
- `apps/api/src/admin.service.ts` (NEW): Triển khai `AdminService` xử lý toàn bộ nghiệp vụ User CRUD, Role CRUD, Permission Catalog, Site Catalog, Role Assignment, Invariant checks (GLOBAL `scopeId = null`, SITE `scopeId = valid site UUID`), và Last Active Global Super Admin Protection (chặn self-deactivation và chặn xóa assignment cuối cùng).
- `apps/api/src/app.ts`: Đăng ký 14 REST endpoints cho User Management, Role Management, và Assignment Management được bảo vệ bởi `requirePermission` preHandlers (`users.read`, `users.create`, `users.update`, `users.deactivate`, `roles.read`, `roles.manage`, `roles.assign`, `sites.read`).
- `apps/admin/app/users/page.tsx` (NEW): Admin Users management page (bảng danh sách, tìm kiếm, phân trang, modal tạo user, deactivate action, modal quản lý Role Assignments với scope selector và dropdown danh sách site thật).
- `apps/admin/app/roles/page.tsx` (NEW): Admin Roles management page (danh sách roles, system role badge, modal tạo custom role, modal ma trận permission theo từng module).
- `apps/admin/app/page.tsx`: Cập nhật dashboard với thanh điều hướng top navigation kết nối Dashboard, Users, Roles.
- `packages/database/src/database.integration.test.ts`: Bổ sung test suite thứ 4 kiểm thử toàn diện 14 REST APIs, User deactivation session revocation, password change session revocation, GLOBAL/SITE invariants, duplicate assignment rejection (409), Last Super Admin deactivation protection (400), Last Super Admin assignment removal protection (400), và system role permission protection.

**Commands:**
- `pnpm lint` -> PASS (0 errors, 0 warnings)
- `pnpm typecheck` -> PASS (9 Turbo tasks across all packages)
- `pnpm test` -> PASS (17 unit tests across 3 suites)
- `pnpm build` -> PASS (6 Turbo tasks; Next.js static pages `/`, `/_not-found`, `/login`, `/roles`, `/users` generated)
- `TEST_DATABASE_URL=.../m24_clean_verify_db pnpm test:integration` -> PASS (4 suites against real PostgreSQL 16)
- `pnpm test:smoke` -> PASS (API readiness/liveness, web and admin HTTP 200)

**Resulting status:**
- M2.4 Backend API & Invariants: `VERIFIED`
- M2.4 Admin UI build: `PASS`
- M2.4 Browser runtime: `NOT RUN / READY_FOR_TEST`
- Overall M2: `READY_FOR_TEST` (Pending browser runtime)
**Next exact task:** M3 — CMS Core Architecture Hardening & ADRs.

---

## 2026-09-07 09:14 — M3 CMS Core Architecture Hardening & ADRs Finalized

**Agent/Role:** Lead Architect / Backend Lead / Security Lead
**Task:** Hoàn tất Architecture Hardening cho CMS Core, hoàn thiện và chấp nhận `ADR-0007` (CMS Content Engine Schema, Canonical Field Registry, Data/UI Schema Separation, Revision-Pointer Model, Optimistic Concurrency) và `ADR-0008` (Content Scoping, No-Shadowing Rule, Multi-site Isolation, Singleton Semantics, Translation Group Invariants, Scoped Permissions). Revert global safe.directory và kiểm tra migration integrity (0 drift).

**Files changed / created:**
- `docs/adr/0007-cms-content-engine-schema.md` (NEW): Quyết định kiến trúc Revision-Pointer Model (`current_revision_id` vs `published_revision_id`), Allow-list Field Registry (M3.1 core: text, textarea, number, boolean, select; deferred media, relation, richtext, repeater), ReDoS protection, Optimistic Concurrency (`409 Conflict`), Schema Evolution (`schema_version`), và JSONB indexing.
- `docs/adr/0008-content-scoping-and-routing.md` (NEW): Quyết định kiến trúc Content Scoping, quy tắc No-Shadowing giữa Site-specific và Global Content Types, deterministic resolution, Single vs Collection semantics, Translation Group invariants (`translation_group_id` không vượt site/type; duy nhất ngôn ngữ trong group), và Scoped RBAC alignment.
- `HANDOFF.md`, `PROJECT_STATE.md`, `ISSUES.md`: Chuẩn hóa trạng thái M2 (READY_FOR_TEST), M3 (ARCHITECTURE_HARDENING_COMPLETED / PLANNING), và cập nhật các quyết định đã chốt.

**Commands:**
- `git config --global --unset-all safe.directory E:/WebstiteCMS` -> PASS
- `pnpm --filter @platform/database generate` -> PASS (0 schema drift)
- `drizzle index check on clean PostgreSQL 16 DB` -> PASS (`user_role_assignments_unique_idx NULLS NOT DISTINCT` verified)

**Resulting status:**
- M2 overall: `READY_FOR_TEST` (Backend VERIFIED, Admin UI Build PASS, Browser Runtime NOT RUN)
- M3 status: `ARCHITECTURE_HARDENING_COMPLETED` (ADR-0007 & ADR-0008 ACCEPTED; Source Implementation NOT STARTED)
**Next exact task:** M3.1 Minimal Vertical Slice Plan Approval.

---

## 2026-09-07 09:42 — M3.1 CMS Core Vertical Slice Implemented & Verified

**Agent/Role:** Backend / Admin / Security
**Task:** Triển khai hoàn tất Milestone M3.1 CMS Core Vertical Slice (Content Types, CMS Field Schema validation, Bi-directional No-Shadowing với advisory locks, Revision-Pointer Architecture, Singletons, Published Slug routing, Optimistic Concurrency `expectedRevision`, Non-destructive draft edits, Public Content Resolver, Admin UI `/content-types` và `/content`, và 5th Integration Test Suite trên clean PostgreSQL 16 DB).

**Files changed / created:**
- `docs/adr/0007-cms-content-engine-schema.md`: Cập nhật Revision-Pointer Model (`current_revision_id` vs `published_revision_id`), Allow-list 5 field types (`text`, `textarea`, `number`, `boolean`, `select`), Optimistic Concurrency (`expectedRevision` -> 409), Schema Evolution (`schema_version`).
- `docs/adr/0008-content-scoping-and-routing.md`: Cập nhật Bi-directional No-Shadowing, PostgreSQL advisory transaction locks, Singleton partial unique index (`WHERE entry_kind = 'single'`), Published Slug unique routing projection (`WHERE published_slug IS NOT NULL`).
- `packages/database/src/schema.ts`: Thêm `contentTypes`, `contentEntries`, `contentEntryRevisions` tables và indexes.
- `packages/database/src/index.ts`: Export M3 tables và seed permissions `content_types.read`, `content_types.manage`.
- `packages/database/drizzle/0003_flaky_supernaut.sql` (NEW): Generated migration cho M3.1 tables và custom partial unique indexes.
- `packages/database/src/reset-test-db.ts` (NEW) & `packages/database/package.json`: Helper script `reset-db` hỗ trợ test độc lập trên PostgreSQL 16.
- `apps/api/src/content.service.ts` (NEW): Domain service xử lý Content Types (bi-directional no-shadowing + advisory locks, schema validation, safe vs breaking mutation check) và Content Entries (revision-pointer create/update/publish/archive, optimistic concurrency check, slug conflict check, public resolver).
- `apps/api/src/app.ts`: Đăng ký tất cả M3.1 Content Types, Content Entries, và Public Resolver REST endpoints.
- `apps/admin/app/content-types/page.tsx` (NEW): Admin Content Types list, schema viewer, và create modal với 5-field schema builder.
- `apps/admin/app/content/page.tsx` (NEW): Admin Content Entries list, status badges, và Dynamic Form Renderer theo FIELD TYPE.
- `apps/admin/app/page.tsx`, `apps/admin/app/users/page.tsx`, `apps/admin/app/roles/page.tsx`: Cập nhật top nav liên kết `/content-types` và `/content`.
- `packages/database/src/database.integration.test.ts`: Bổ sung test suite thứ 5 kiểm thử toàn diện mọi acceptance criteria của M3.1.

**Commands:**
- `pnpm lint` -> PASS (0 errors, 0 warnings)
- `pnpm typecheck` -> PASS (9 Turbo tasks across all packages)
- `pnpm test` -> PASS (17 unit tests across 3 suites)
- `pnpm build` -> PASS (6 Turbo tasks including `/content-types` and `/content` static prerender)
- `pnpm test:integration` -> PASS (5 full integration suites on dedicated clean PostgreSQL 16 DB `m31_clean_verify_db`)
- `pnpm test:smoke` -> PASS (Production Fastify readiness, unavailable DB 503, web and admin HTTP 200)
- `pnpm db:generate` -> PASS ("No schema changes, nothing to migrate 😴")

**Resulting status:**
- M3.1 Backend & Public Content Resolver: `VERIFIED`
- M3.1 Database Schema & Invariants (0003_flaky_supernaut.sql): `VERIFIED`
- M3.1 Admin UI build: `PASS`
- M3.1 Browser runtime: `NOT RUN / READY_FOR_TEST`
- Milestone M3 overall status: `IN_PROGRESS` (M3.1 Core Slice: `VERIFIED`)
**Next exact task:** M3.1 Invariant Closure.

---

## 2026-09-07 09:50 — M3.1 Invariant Closures & Test Hardening

**Agent/Role:** Backend / Lead Architect / QA
**Task:** Hoàn tất toàn bộ invariant closures của Milestone M3.1 theo yêu cầu:
1. Revision ownership integrity: Đảm bảo `current_revision_id` và `published_revision_id` của Entry A không thể trỏ tới revision thuộc Entry B. Xác minh ranh giới application/transaction boundary trong `publishContentEntry` và bổ sung integration negative test.
2. Immutable Content Type identity: Chốt policy `key`, `scope_kind`, `site_id` immutable sau khi tạo; `kind` immutable khi đã có bất kỳ `ContentEntry` nào tồn tại. Bổ sung rejection logic và negative test.
3. No-shadowing concurrency race test: Bổ sung integration test concurrency thật (`Promise.all`) tạo song song GLOBAL type và SITE type cùng key. Kết quả: chính xác 1 request thành công (201), 1 request nhận xung đột (409 Conflict), không deadlock nhờ PostgreSQL advisory transaction lock (`pg_advisory_xact_lock(hashtext(LOWER(key)))`).
4. Canonical BCP-47 locale validation: Bổ sung hàm validation chuẩn BCP-47 subset (`/^[a-z]{2,3}(-[A-Za-z0-9]{2,4})*$/`) chấp nhận `vi`, `en`, `zh-CN` và từ chối các chuỗi locale không hợp lệ. Đảm bảo `translation_group_id` được server quản lý.

**Files changed:**
- `apps/api/src/content.service.ts`: Thêm `isValidLocale`, `normalizeLocale`, kiểm tra ContentType identity immutability, kiểm tra revision ownership integrity boundary, và áp dụng validation cho entry creation.
- `packages/database/src/database.integration.test.ts`: Bổ sung 4 integration test cases kiểm thử chi tiết các invariants trên.
- `PROJECT_STATE.md`, `PROGRESS.md`, `HANDOFF.md`, `TEST_REPORT.md`: Đồng bộ trạng thái:
  - M3.1 Content Engine DB/API: `VERIFIED`
  - M3.1 Admin UI Build: `PASS`
  - M3.1 Browser Runtime: `NOT RUN / READY_FOR_TEST`
  - M3.1 Overall: `READY_FOR_TEST`

**Commands:**
- `pnpm lint` -> PASS (0 errors, 0 warnings)
- `pnpm typecheck` -> PASS (9 Turbo tasks)
- `pnpm test` -> PASS (17 unit tests)
- `pnpm build` -> PASS (6 Turbo tasks)
- `pnpm test:integration` -> PASS (5 full integration suites on `m31_clean_verify_db`)
- `pnpm test:smoke` -> PASS (HTTP 200/503 tests)
- `pnpm db:generate` -> PASS ("No schema changes, nothing to migrate 😴")

**Resulting status:**
- M3.1 Content Engine DB/API: `VERIFIED`
- M3.1 Admin UI Build: `PASS`
- M3.1 Browser Runtime: `NOT RUN / READY_FOR_TEST`
- M3.1 Overall: `READY_FOR_TEST`
- Milestone M3: `IN_PROGRESS`
**Next exact task:** M3.2 Taxonomy Architecture Checkpoint (Không sinh migration, dừng trước implementation).---

## 2026-09-07 10:10 — M3.2 Taxonomy Engine & Revision-Term Snapshots

**Agent/Role:** Backend / Lead Architect / QA
**Task:** Hoàn tất toàn bộ implementation và verification cho Milestone M3.2:
1. Updated ADR-0009 với tree advisory lock serialization `hashtext('tree:' || taxId || ':' || siteId)` và activation invariant (mọi ancestor phải active).
2. Defined 4 database tables trong `packages/database/src/schema.ts` (`taxonomies`, `taxonomy_terms`, `content_type_taxonomies`, `content_revision_terms`) và generated migration `0004_condemned_invisible_woman.sql` với custom constraints (`CHECK parent_id <> id`, `CHECK depth BETWEEN 0 AND 5`, `CHECK min_terms >= 0`, `NULLS NOT DISTINCT`).
3. Seeded 4 taxonomy permissions: `taxonomies.read`, `taxonomies.manage`, `taxonomy_terms.read`, `taxonomy_terms.manage` cho `system_super_admin`.
4. Implemented `TaxonomyService` trong `apps/api/src/taxonomy.service.ts` với đầy đủ advisory lock serialization, bi-directional no-shadowing, hierarchy creation & recursive CTE cycle detection, subtree move với atomic depth delta recomputation, activation/deactivation cascading invariants, ContentType-Taxonomy bindings (scope compatibility & non-retroactive policy), và public taxonomy term resolver/filter.
5. Implemented `ContentService` revision-term snapshots: snapshotting `taxonomyAssignments` khi tạo revision, copy-forward khi omitted trong PATCH, zero-draft leakage protection, và historical term retention.
6. Implemented Fastify endpoints trong `apps/api/src/app.ts` theo đúng standard conventions (không `/api` prefix).
7. Implemented Admin UI `/taxonomies` trong `apps/admin/app/taxonomies/page.tsx` hỗ trợ list, scope badges, hierarchical tree viewer, add/edit/move modals, và activate/deactivate actions.
8. Created 6th comprehensive integration test suite `Suite 6: M3.2 Taxonomy Engine & Revision-Term Snapshots` trong `packages/database/src/database.integration.test.ts` kiểm thử toàn bộ 22 tiêu chí trong matrix.

**Files changed:**
- `docs/adr/0009-taxonomy-engine-architecture.md`
- `packages/database/src/schema.ts`
- `packages/database/src/index.ts`
- `packages/database/drizzle/0004_condemned_invisible_woman.sql`
- `apps/api/src/taxonomy.service.ts`
- `apps/api/src/content.service.ts`
- `apps/api/src/auth.guard.ts`
- `apps/api/src/app.ts`
- `apps/admin/app/taxonomies/page.tsx`
- `packages/database/src/database.integration.test.ts`
- `PROJECT_STATE.md`, `PROGRESS.md`, `HANDOFF.md`, `TEST_REPORT.md`, `DEV_LOG.md`

**Commands:**
- `pnpm lint` -> PASS (0 errors, 0 warnings)
- `pnpm typecheck` -> PASS (9 Turbo tasks)
- `pnpm test` -> PASS (17 unit tests)
- `pnpm build` -> PASS (6 Turbo tasks)
- `pnpm test:integration` -> PASS (all 6 integration suites on clean `m32_clean_verify_db`)
- `pnpm test:smoke` -> PASS (HTTP liveness/DB status tests)
- `pnpm db:generate` -> PASS ("No schema changes, nothing to migrate 😴")

**Resulting status:**
- M3.2 Taxonomy Engine Backend/DB/API: `VERIFIED`
- M3.2 Admin UI Build: `PASS`
- M3.2 Browser Runtime: `NOT RUN / READY_FOR_TEST`
- Milestone M3 overall status: `IN_PROGRESS` (M3.1 and M3.2 both `READY_FOR_TEST`)
**Next exact task:** User verification / Stop before M4 Media Library.

---

## 2026-09-07 10:40 — M3 Final Closure & M4.1 Architecture Checkpoint

**Agent/Role:** Backend / Admin / QA / Architect
**Task:** Hoàn tất M3 Final Closure và thiết lập kiến trúc M4.1 Media Library & Storage Provider Abstraction:
1. Fixed public taxonomy route scope to site-aware endpoints: `GET /public/sites/:siteId/content-types/:typeKey/taxonomies/:taxKey/terms/:termKey/entries` & alias `/public/sites/:siteId/content/:typeKey/taxonomies/:taxKey/:termSlug`.
2. Verified multi-site deterministic scoping, locale isolation, unknown site 404, cross-site non-fallback, and zero draft leakage.
3. Implemented Admin ContentType Taxonomy Binding UI in `apps/admin/app/content-types/page.tsx` with modal, allowed taxonomy scope filtering, `isRequired`, `minTerms`, `maxTerms`, and `sortOrder`.
4. Implemented dynamic Content Entry Taxonomy controls in `apps/admin/app/content/page.tsx` with hierarchical tree depth indentation, multi-select checkboxes, current revision terms loading, snapshot persistence, and copy-forward preservation.
5. Implemented and verified Taxonomy Archive/Public semantics regression (historical term display preservation, inactive term assignment rejection, inactive taxonomy filtering exclusion, no relation rows deleted).
6. Verified PostgreSQL transaction atomicity on revision creation failure (zero orphaned revisions, current pointer preservation, no partial term rows).
7. Added 7th integration test suite covering all M3 Final Closure criteria on clean PostgreSQL 16 DB (`m3_closure_clean_verify_db`).
8. Verified clean regression across monorepo: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:integration`, `pnpm test:smoke`, `pnpm db:generate`.

**Files changed:**
- `apps/api/src/taxonomy.service.ts`
- `apps/api/src/content.service.ts`
- `apps/api/src/app.ts`
- `apps/admin/app/content-types/page.tsx`
- `apps/admin/app/content/page.tsx`
- `packages/database/src/database.integration.test.ts`
- `PROJECT_STATE.md`, `PROGRESS.md`, `TEST_REPORT.md`, `DEV_LOG.md`, `HANDOFF.md`

**Commands:**
- `pnpm lint` -> PASS (0 errors, 0 warnings)
- `pnpm typecheck` -> PASS (9 Turbo tasks)
- `pnpm test` -> PASS (17 unit tests)
- `pnpm build` -> PASS (6 Turbo tasks)
- `pnpm test:integration` -> PASS (7 full integration suites on clean `m3_closure_clean_verify_db`)
- `pnpm test:smoke` -> PASS (HTTP liveness/DB status tests)
- `pnpm db:generate` -> PASS ("No schema changes, nothing to migrate 😴")

**Resulting status:**
- M3 Content Engine Backend/API = `VERIFIED`
- M3 Taxonomy Backend/API = `VERIFIED`
- M3 Admin UI Build = `PASS`
- M3 Browser Runtime = `NOT RUN / READY_FOR_TEST`
- M3 Overall = `READY_FOR_TEST`
**Next exact task:** M4.1 Media Library & Object Storage Architecture Checkpoint (DO NOT implement M4 before ADR acceptance).

---

## 2026-09-08 07:09 — M3 Audit Remediation Closed

**Agent/Role:** Backend / Admin / QA / Architect

Closed `AUDIT-001` without discarding the pre-existing dirty M3 closure. Unified the Admin API client, removed raw auth tokens, hardened cookie-request provenance, enforced UUIDv7 and mandatory optimistic concurrency, made CMS schema/default/select and optional-field behavior strict, canonicalized locales through one shared service, added composite revision-pointer ownership FKs through forward migration 0005, and added fresh/upgrade drift verification.

Full regression passed: lint; typecheck 9/9; unit 42/42; build 6/6; integration 7/7 on `m3_final_fresh_20260908_0709`; 0004->0005 upgrade and repeat migration on `m3_final_upgrade_20260908_0709`; production smoke; and zero migration drift. Complete browser runtime passed login through create/edit/publish/logout. Independent QA passed with no open P0/P1/P2 finding.

**Resulting status:** M3 `DONE`. Stop before M4 implementation; ADR-0010 remains a Proposed architecture checkpoint.

### ADR-0010 hardening (documentation only)

Hardened the Proposed M4.1 candidate with private byte-preserved source objects, sanitized public display outputs, opaque keys, streaming storage I/O, typed `content_revision_media` FKs, archive-only lifecycle, image-bomb safeguards, JPEG/PNG/WebP scope, and production R2 custom-domain/cache requirements. Cloudflare pricing/limits wording was checked against official documentation on 2026-09-08. No M4 source, dependency or migration was added.

---

## 2026-09-09 — M4.1 Architecture Accepted and M2 Reconciled

Independent source audit #2 passed and approved M3 `DONE`. The final documented M2 browser blocker is satisfied by the real login/session/Users/Roles/logout flow in `TR-20260908-M3-AUDIT`; M2 is reconciled to `DONE` with explicit rationale in `TR-20260909-M2-GOVERNANCE`.

ADR-0010 now fixes M4.1 formats, hard image limits, variant/cache contract, provider contract tests, Local/S3 adapter boundaries, compensation/failure state machine, three-table database scope, revision/media/taxonomy atomicity, archive semantics, public delivery/security headers, permissions, Admin UI and migration verification. Consistency review found no remaining contradiction; ADR status changed to `Accepted`. Implementation remains limited to M4.1.
