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
**Next exact task:** M3 — CMS Core (Content Types & Dynamic Content Engine).




