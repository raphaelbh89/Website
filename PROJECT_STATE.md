# PROJECT_STATE.md

> File này mô tả trạng thái kiến trúc hiện tại. Agent phải cập nhật khi kiến trúc thực tế thay đổi.

## Project Status

- Stage: `M2_IN_PROGRESS` (M1 foundation `VERIFIED` with baseline commit `9294b50` pushed to `origin/main`; M2 Auth + RBAC vertical slice M2.1 Identity Schema & Persistence is active).
- Source implementation: M1 foundation verified; ADR-0005 (Auth/Session) and ADR-0006 (Scoped RBAC) accepted; executing M2.1 identity schema, Argon2id, and database migrations.
- Target architecture: `Modular Monolith / Monorepo`
- Multi-Agent workflow: `DEFINED`

## Approved Technical Direction

### Repository

- pnpm Workspaces
- Turborepo
- TypeScript-first
- Node.js 24 / pnpm 11.17.0 / Turborepo 2.10.12 / TypeScript 5.9.3 (ADR-0004).
- Next.js 16.3.4 / React 19.2.8 for web/admin; Fastify 5.12.3 API.
- Drizzle ORM 0.45.2 + Kit 0.31.10 / pg 8.23.0; generated SQL migration for sites and identity schema.
- Vitest 4.0.18, ESLint 10.10.0; GitHub Actions verification workflow prepared.

### Apps

- `apps/web`
- `apps/admin`
- `apps/api`

### Data

- PostgreSQL 16
- relational core entities
- JSONB dynamic configuration
- UUIDv7
- soft delete where justified
- migration-driven schema changes

### Platform Domains

- auth
- users
- roles/permissions
- content types
- content entries
- taxonomy/categories
- pages
- sections
- module registry
- themes
- menus
- forms/submissions
- media
- settings
- localization
- seo
- chat
- audit

### Frontend Principle

Public website is a renderer of CMS/page composition data.

### Page Composition

```text
Content Type
-> Collection/Query
-> Module Type
-> Section
-> Page
-> Template
-> Theme
```

### AI Factory

Multi-Agent orchestration based on persistent repo state. No dependency on a single chat session.

## Decisions Finalized for M2

- **ADR-0005 (Accepted)**: Server-side opaque session, `HttpOnly; Secure; SameSite=Lax` cookies, SHA-256 session token hashing in DB, Argon2id (`@node-rs/argon2`) password hashing with RFC 9106 recommended parameters, generic auth errors, rate limiting on login via `@fastify/rate-limit`, explicit CORS origin check with credentials.
- **ADR-0006 (Accepted)**: Scoped RBAC architecture (`GLOBAL`, `SITE`, `CAMPUS`, `RESOURCE` hierarchy). Separation of User -> RoleAssignment -> Role -> RolePermission -> Permission. Implementation for M2 covers `GLOBAL` and `SITE` scopes with inheritance down to sites, explicit allow-list, deny-by-default, and structured permission names (`users.read`, `content.publish`, etc.).

## Decisions Not Yet Finalized (Deferred to later milestones)

Các mục sau phải tạo ADR trước khi implement nếu chưa được chốt:

- object storage provider (M4);
- cache provider (M9);
- realtime/chat transport;
- queue/background job technology;
- visual editor library (M5);
- e2e test framework;
- deployment target.

## Current Risks

1. Page Builder quá generic có thể gây schema phức tạp.
2. Dynamic Content Type dễ biến database thành EAV/JSON dump nếu không giới hạn.
3. AI-generated modules có nguy cơ tạo code không đồng nhất.
4. Multi-language + localized slug cần thiết kế uniqueness cẩn thận.
5. RBAC scope cần xác định global/site/campus/content scope ngay từ đầu.

## Next Recommended Milestone

Complete `M2 — Auth + RBAC`: currently executing M2.1 Identity Schema & Persistence, followed by M2.2 Auth Vertical Slice, M2.3 Scoped Authorization Guards, and M2.4 Admin User/Role Management. M3 CMS Core will follow.

