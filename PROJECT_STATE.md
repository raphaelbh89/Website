# PROJECT_STATE.md

> File này mô tả trạng thái kiến trúc hiện tại. Agent phải cập nhật khi kiến trúc thực tế thay đổi.

## Project Status

- Stage: `M4_1_IMPLEMENTATION_IN_PROGRESS` (M2 and M3 `DONE`; ADR-0010 accepted after final limits/provider/compensation/schema consistency review).
- Source implementation: M3 CMS Core is `DONE`. The closure includes site-aware public taxonomy routing, deterministic multi-site/locale isolation, taxonomy archive semantics, atomic revision-term behavior, strict CMS schemas/defaults, mandatory optimistic concurrency, UUIDv7 business IDs, relational revision-pointer ownership, cookie-safe auth/CSRF transport, one configurable Admin API client, and the complete Admin content/taxonomy workflow. Browser runtime verified login/session, dashboard, users, roles, content types, taxonomy bindings, taxonomies, content create/edit/publish and logout.
- Target architecture: `Modular Monolith / Monorepo`
- Multi-Agent workflow: `DEFINED`

## Approved Technical Direction

### Repository

- pnpm Workspaces
- Turborepo
- TypeScript-first
- Node.js 24 / pnpm 11.17.0 / Turborepo 2.10.12 / TypeScript 5.9.3 (ADR-0004).
- Next.js 16.3.4 / React 19.2.8 for web/admin; Fastify 5.12.3 API.
- Drizzle ORM 0.45.2 + Kit 0.31.10 / pg 8.23.0; generated SQL migrations through `0005_worried_starjammers.sql`, including relational ownership constraints for entry revision pointers.
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

## Decisions Finalized for M2 & M3

- **ADR-0005 (Accepted)**: Server-side opaque session, `HttpOnly; Secure; SameSite=Lax` cookies, SHA-256 session token hashing in DB, Argon2id (`@node-rs/argon2`) password hashing with RFC 9106 recommended parameters, generic auth errors, rate limiting on login via `@fastify/rate-limit`, explicit CORS origin check with credentials.
- **ADR-0006 (Accepted)**: Scoped RBAC architecture (`GLOBAL`, `SITE`, `CAMPUS`, `RESOURCE` hierarchy). Separation of User -> RoleAssignment -> Role -> RolePermission -> Permission. Implementation covers `GLOBAL` and `SITE` scopes with inheritance down to sites, explicit allow-list, deny-by-default, and structured permission names (`users.read`, `content.publish`, etc.).
- **ADR-0007 (Accepted)**: CMS Content Engine Schema, Canonical Field Registry (M3.1 core: text, textarea, number, boolean, select; deferred media/relation/richtext/repeater), Internal CMS Field Schema (dataSchema vs uiSchema), and Revision-Pointer Model (`content_entries` with `current_revision_id` & `published_revision_id` pointers + `content_entry_revisions` immutable snapshots) with optimistic concurrency control (`expectedRevision` / 409 Conflict) and schema evolution policy.
- **ADR-0008 (Accepted)**: Content Scoping, Routing, Localization Invariants, and Scoped Permissions. Enforces Bi-directional No-Shadowing rule between Site-specific and Global Content Types with PostgreSQL advisory transaction lock serialization (`pg_advisory_xact_lock(hashtext(LOWER(key)))`), deterministic type resolution, strict Multi-Site isolation, Singleton partial unique indexes (`WHERE entry_kind = 'single'`), Published Slug unique routing projection (`WHERE published_slug IS NOT NULL`), Translation Group invariants (`translation_group_id`), and Scoped RBAC alignment (`content_types.*` global/site, `content.*` site-scoped).
- **ADR-0009 (Accepted)**: Taxonomy Engine Architecture, Scoping, Hierarchical Subtree Semantics, and Revision-Term Association. Enforces Hybrid Global/Site taxonomy definitions with strictly Site-bound Terms, Bi-directional No-Shadowing via PostgreSQL advisory locks (`pg_advisory_xact_lock(hashtext(LOWER('tax:' || key)))`), immutable machine identities (`Taxonomy.key`, `TaxonomyTerm.key`), transaction-safe hierarchical subtree move with cycle detection and rigid depth cap (`depth <= 5`), Revision-Term snapshot architecture (`content_revision_terms` per revision, zero draft leakage), non-retroactive ContentType binding evolution, parent deactivation constraints (must deactivate descendants first), and index-friendly relational query plans.

## Decisions Not Yet Finalized (Deferred to later milestones)

Các mục sau phải tạo ADR trước khi implement nếu chưa được chốt:

- provider deployment choice beyond the configurable Local/S3-compatible contract and post-M4.1 media capabilities;
- visual editor library / Page Builder canvas (M5);
- theme tokens & design system engine (M6);
- localization routing & translation UI (M7);
- cache provider (M9);
- realtime/chat transport;
- queue/background job technology;
- e2e browser test harness;
- deployment target.

## Current Risks

1. Page Builder quá generic có thể gây schema phức tạp.
2. Dynamic Content Type dễ biến database thành EAV/JSON dump nếu không giới hạn (đã chặn bằng ADR-0007 allow-list và revision-pointer model).
3. AI-generated modules có nguy cơ tạo code không đồng nhất.
4. Multi-language + localized slug cần thiết kế uniqueness cẩn thận (đã đặc tả trong ADR-0008).
5. RBAC scope cần xác định global/site/campus/content scope ngay từ đầu (đã đặc tả trong ADR-0006 và ADR-0008).

## Next Recommended Milestone
 
Implement and verify only **M4.1 Image Media** under accepted ADR-0010. Stop before M4.2, Menu, Forms, Settings or Page Builder.
