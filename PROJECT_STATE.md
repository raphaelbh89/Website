# PROJECT_STATE.md

> File này mô tả trạng thái kiến trúc hiện tại. Agent phải cập nhật khi kiến trúc thực tế thay đổi.

## Project Status

- Stage: `FOUNDATION_VERIFIED` (M1 implementation and independent verification passed; baseline commit being established; no business CMS/auth feature implemented yet).
- Source implementation: M1 source exists and all verification checks pass (frozen install, lint, typecheck, unit, build, PostgreSQL 16 migration/seed integration, smoke). Hosted CI execution pending.
- Target architecture: `Modular Monolith / Monorepo`
- Multi-Agent workflow: `DEFINED`

## Approved Technical Direction

### Repository

- pnpm Workspaces
- Turborepo
- TypeScript-first
- Node.js 24 / pnpm 11.17.0 / Turborepo 2.10.12 / TypeScript 5.9.3 (ADR-0004).
- Next.js 16.3.4 / React 19.2.8 for web/admin; Fastify 5.12.3 API.
- Drizzle ORM 0.45.2 + Kit 0.31.10 / pg 8.23.0; generated SQL migration for sites.
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

## Decisions Not Yet Finalized

Các mục sau phải tạo ADR trước khi implement nếu chưa được chốt:

- auth/session library;
- object storage provider;
- cache provider;
- realtime/chat transport;
- queue/background job technology;
- visual editor library;
- e2e test framework;
- deployment target.

## Current Risks

1. Page Builder quá generic có thể gây schema phức tạp.
2. Dynamic Content Type dễ biến database thành EAV/JSON dump nếu không giới hạn.
3. AI-generated modules có nguy cơ tạo code không đồng nhất.
4. Multi-language + localized slug cần thiết kế uniqueness cẩn thận.
5. RBAC scope cần xác định global/site/campus/content scope ngay từ đầu.

## Next Recommended Milestone

Finish independent M1 verification, then `M2 — Auth + RBAC`: auth/session ADR, permission scope ADR, schema/API/admin login vertical slice.
M1 has a deny-by-default global/site permission function only; it does not provide authentication or wire privileged APIs.
