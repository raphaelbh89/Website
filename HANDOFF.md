# HANDOFF.md

> Agent rời session phải cập nhật file này. Agent mới đọc file này trước khi sửa code.

## Current Handoff

### Session State

- M3 audit remediation and final closure: `DONE`; exact pre-remediation snapshot remains in `DEV_LOG.md`.
- M3 backend/API, Admin build, browser runtime, clean migration, upgrade migration and independent QA are verified in `TR-20260908-M3-AUDIT`.
- M4 / M5: `NOT STARTED`
- ADR-0010: `Proposed`; do not accept or implement M4 in this task.
- Target Branch: `main`

### Completed

- Fixed Public Taxonomy Filtering Scope to site-aware endpoints: `GET /public/sites/:siteId/content-types/:typeKey/taxonomies/:taxKey/terms/:termKey/entries` (and alias `/public/sites/:siteId/content/:typeKey/taxonomies/:taxKey/:termSlug`).
- Implemented and verified strict multi-site deterministic scoping, locale isolation, unknown site 404 handling, cross-site non-fallback, and draft leakage prevention.
- Implemented Admin ContentType Taxonomy Binding UI in `apps/admin/app/content-types/page.tsx` with modal, allowed taxonomy scope filtering, `isRequired`, `minTerms`, `maxTerms`, and `sortOrder`.
- Implemented dynamic Content Entry Taxonomy controls in `apps/admin/app/content/page.tsx` with hierarchical tree depth indentation, multi-select checkboxes, current revision terms loading, snapshot persistence, and copy-forward preservation.
- Implemented and verified Taxonomy Archive/Public semantics regression (historical term display preservation, inactive term assignment rejection, inactive taxonomy filtering exclusion, no relation rows deleted).
- Verified PostgreSQL transaction atomicity on revision creation failure (zero orphaned revisions, current pointer preservation, no partial term rows).
- Added comprehensive 7th integration test suite covering all M3 Final Closure criteria on clean PostgreSQL 16 DB (`m3_closure_clean_verify_db`).
- Full monorepo verification pipeline: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:integration`, `pnpm test:smoke`, `pnpm db:generate` all PASS. Zero schema drift.
- Audit remediation: one Admin API client, cookie-only browser auth with strict provenance checks, UUIDv7, required `expectedRevision`, strict schema/default handling, locale canonicalization, composite pointer FKs and forward-only 0005 upgrade.
- Complete browser matrix passed through content create, revision 2, publish and logout. Independent QA PASS with no open P0/P1/P2.

### Not Started

- M4 Media Library & Storage abstraction implementation (DO NOT create migrations / install packages before ADR acceptance).
- M5 Page Builder & Module Registry.

### Next Recommended Actions

1. Review the hardened M4.1 architecture candidate in `docs/adr/0010-media-storage-and-processing.md`.
2. Keep it `Proposed`; do not implement M4, install packages, or create migrations until it is explicitly accepted.

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
