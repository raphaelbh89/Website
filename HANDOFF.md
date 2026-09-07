# HANDOFF.md

> Agent rời session phải cập nhật file này. Agent mới đọc file này trước khi sửa code.

## Current Handoff

### Session State

- M2 overall: `READY_FOR_TEST` (Backend/RBAC `VERIFIED`, Admin UI build `PASS`, Browser E2E `NOT RUN`)
- M3 overall: `IN_PROGRESS`
- M3.1 Content Engine DB/API: `VERIFIED`
- M3.1 Admin UI Build: `PASS`
- M3.1 Browser Runtime: `NOT RUN / READY_FOR_TEST`
- M3.1 Overall: `READY_FOR_TEST`
- M3.2 / M4: `NOT STARTED`
- Target Branch: `main`

### Completed

- `docs/adr/0007-cms-content-engine-schema.md` & `docs/adr/0008-content-scoping-and-routing.md` finalized and accepted.
- Database migration `0003_flaky_supernaut.sql` created and verified with 0 schema drift via `pnpm db:generate`.
- Implemented `ContentService` in `apps/api/src/content.service.ts` handling Content Types (bi-directional no-shadowing + PostgreSQL advisory transaction locks, schema validation, safe vs breaking mutation check) and Content Entries (revision-pointer create/update/publish/archive, optimistic concurrency check, slug conflict check, public resolver).
- Fastify REST endpoints in `apps/api/src/app.ts` for Content Types (`/content-types`), Content Entries (`/sites/:siteId/content/:typeKey`), Publishing (`/publish`), Archiving (`/archive`), and Public Content Resolver (`/public/sites/:siteId/content/:typeKey/:slug`).
- Implemented Admin UI in `apps/admin/app/content-types/page.tsx` and `apps/admin/app/content/page.tsx` featuring Dynamic Form Renderer keyed by FIELD TYPE (`text`, `textarea`, `number`, `boolean`, `select`).
- Added comprehensive 5th integration test suite covering all M3.1 acceptance criteria on clean PostgreSQL 16 DB (`m31_clean_verify_db`).
- Full monorepo verification pipeline: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:integration`, `pnpm test:smoke` all PASS.

### Not Started

- M3.2 Advanced CMS features (Taxonomy/Categories, Relations, Repeaters, Media fields).
- M4 Media Library & Storage abstraction.
- Browser automation flow verification (Playwright runner binary download unavailable in local environment).

### Next Recommended Actions

1. Review M3.1 Architecture & Implementation Checkpoint.
2. Formulate Architecture Checkpoint & Plan for M3.2 (Taxonomy/Categories) or M4 (Media Library).

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
