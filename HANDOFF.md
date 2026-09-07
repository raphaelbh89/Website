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
- M3.2 Taxonomy Engine DB/API: `VERIFIED`
- M3.2 Admin UI Build: `PASS`
- M3.2 Browser Runtime: `NOT RUN / READY_FOR_TEST`
- M3.2 Overall: `READY_FOR_TEST`
- M4 / M5: `NOT STARTED`
- Target Branch: `main`

### Completed

- `docs/adr/0009-taxonomy-engine-architecture.md` created, hardened, and accepted.
- Database migration `0004_condemned_invisible_woman.sql` generated and verified with 0 schema drift via `pnpm db:generate`.
- Implemented `TaxonomyService` in `apps/api/src/taxonomy.service.ts` covering:
  - Hybrid scoping (GLOBAL / SITE taxonomies, always site-bound terms).
  - Bi-directional no-shadowing with PostgreSQL advisory transaction lock (`pg_advisory_xact_lock(hashtext('tax:' || key))`).
  - Hierarchical subtree move with CTE cycle detection, tree advisory lock (`pg_advisory_xact_lock(hashtext('tree:' || taxId || ':' || siteId))`), depth delta cascade, and maxDepth=5 cap.
  - Activation/deactivation invariants (parent deactivation blocked if active descendants exist; child activation requires all ancestors active).
  - ContentType ↔ Taxonomy bindings with scope validation (Global ContentType only binds Global Taxonomies; Site ContentType binds Global or own Site Taxonomies).
  - Public proof of filtering by taxonomy & term.
- Updated `ContentService` to handle immutable revision-term snapshotting (`content_revision_terms`), copy-forward snapshotting on draft updates when `taxonomyAssignments` is omitted, validation of required/min/max binding rules, and public content resolver loading published terms.
- Fastify REST endpoints in `apps/api/src/app.ts` for taxonomies (`/taxonomies`), terms (`/sites/:siteId/taxonomies/:taxKey/terms`), deactivation/activation, ContentType bindings (`/content-types/:contentTypeId/taxonomies`), and public term query (`/public/sites/:siteId/content/:typeKey/taxonomies/:taxKey/:termSlug`).
- Implemented Admin UI in `apps/admin/app/taxonomies/page.tsx` for taxonomy management, hierarchical tree viewer, add/edit/move terms, and activation toggling.
- Added comprehensive 6th integration test suite covering all M3.2 acceptance criteria on clean PostgreSQL 16 DB (`m32_clean_verify_db`).
- Full monorepo verification pipeline: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:integration`, `pnpm test:smoke` all PASS. Zero schema drift.

### Not Started

- M4 Media Library & Storage abstraction.
- M5 Page Builder & Module Registry.
- Browser automation flow verification (Playwright runner binary download unavailable in local environment).

### Next Recommended Actions

1. Review M3.2 Checkpoint & Verification Evidence.
2. Architecture Checkpoint for Milestone M4 (Media Library & Storage Abstraction).

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
