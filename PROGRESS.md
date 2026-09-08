# PROGRESS.md

## Status Legend

`TODO` | `IN_PROGRESS` | `BLOCKED` | `READY_FOR_TEST` | `FAILED` | `VERIFIED` | `DONE`

## Milestones

| ID | Milestone | Status | Owner | Evidence |
|---|---|---|---|---|
| M0 | Architecture & Agent Governance | VERIFIED | Architect | Markdown package |
| M1 | Monorepo Foundation | VERIFIED | Orchestrator / Backend / QA | TEST_REPORT.md TR-20260907-M1-RERUN; independent verification passed; baseline commit 9294b50 pushed |
| M2 | Auth + RBAC | DONE | Backend / Architect / QA | API/DB/security/build evidence plus the final browser blocker (login, session persistence, Users, Roles, logout) closed by TR-20260908-M3-AUDIT and independent source audit #2. |
| M3 | CMS Core | DONE | Backend/Admin/QA | Audit remediation and closure verified by full regression, two clean PostgreSQL 16 paths, complete browser runtime, and independent QA; see TR-20260908-M3-AUDIT. |
| M4 | Media + Menu + Forms + Settings | IN_PROGRESS | Backend/Admin/Security/QA | M4.1 Image Media only; ADR-0010 accepted. M4.2/Menu/Forms/Settings remain out of scope. |
| M5 | Page Builder + Module Registry | TODO | Admin/Frontend | - |
| M6 | Theme Engine + Responsive Config | TODO | Frontend/Design | - |
| M7 | i18n + SEO | TODO | Backend/Frontend | - |
| M8 | AI Website Factory | TODO | AI Orchestrator | - |
| M9 | Security/Performance/Observability | TODO | Security/Platform | - |
| M10 | Production Release Verification | TODO | QA | - |

## Feature Tracker

| Feature | Status | Primary Owner | QA | Notes |
|---|---|---|---|---|
| Repository bootstrap | VERIFIED | Orchestrator | QA | Frozen/fresh install, typecheck/build pass; independent verification confirmed |
| PostgreSQL migrations | VERIFIED | Backend | QA | PostgreSQL 16 clean/repeat migration + persistence pass; verified with portable PostgreSQL 16 |
| User authentication | VERIFIED | Backend | Security/QA | HttpOnly cookie login/session/logout, no raw token response, provenance-based CSRF protection; browser runtime verified. |
| Role management | VERIFIED | Backend/Admin | Security/QA | M2.1 schema & seed; M2.4 Role CRUD, Permission assignment matrix, System Role protection VERIFIED (TR-20260907-M2-4) |
| Permission management | VERIFIED | Backend/Admin | Security/QA | M2.1 engine & M2.3 Fastify Scoped Authorization Guards & M2.4 Role Assignment Invariants VERIFIED (TR-20260907-M2-4) |
| Content Type builder | VERIFIED | Backend/Admin | QA | Strict five-type schema/default validation, no-shadowing, configurable Admin API client, browser binding flow; TR-20260908-M3-AUDIT. |
| Content Entry CRUD | VERIFIED | Backend/Admin | QA | Mandatory `expectedRevision`, composite pointer FKs, UUIDv7, locale canonicalization, optional-field semantics, browser create/edit/publish; TR-20260908-M3-AUDIT. |
| Category/Taxonomy | VERIFIED | Backend/Admin | QA | Hybrid scope, hierarchy and revision snapshots preserved; API/DB/browser and independent QA verified; TR-20260908-M3-AUDIT. |
| Media Library | TODO | Backend/Admin | Security/QA | upload validation |
| Menu Builder | TODO | Backend/Admin | QA | nested/mega ready |
| Form Builder | TODO | Backend/Admin | Security/QA | submissions/export |
| Settings | TODO | Backend/Admin | QA | site identity/contact/social |
| Page Builder | TODO | Admin | QA | drag/drop optional library TBD |
| Module Registry | TODO | Frontend/Admin | QA | versioned contracts |
| Public Renderer | TODO | Frontend | QA | no hardcoded homepage |
| Theme Engine | TODO | Frontend/Admin | QA | design tokens |
| Localization | TODO | Backend/Admin | QA | localized slug/SEO |
| SEO Engine | TODO | Backend/Frontend | SEO/QA | sitemap/canonical/schema |
| Chat abstraction | TODO | Backend/Frontend | Security/QA | AI/Human/Hybrid |
| Audit log | TODO | Backend | Security/QA | admin actions |
| AI site generation pipeline | TODO | AI Orchestrator | QA | separate design/QA agents |
| Image-to-module generator | TODO | AI/Frontend | Security/QA | gated registration |

## M1 implementation scope — 2026-09-07

- Owner: Orchestrator / Backend; independent QA required before DONE.
- Scope: stack ADR, workspace/tooling, three app bootstraps, validated environment, PostgreSQL migrations/seed, API live/ready health, CI baseline.
- Files: root configuration, apps/*, packages/config, packages/database, packages/auth, scripts, .github/workflows, docs/adr and state/evidence documents.
- Acceptance: reproducible locked install; lint/typecheck/unit/build pass; API production runtime live/ready checked including unavailable DB; PostgreSQL 16 clean migration + repeat migration + seed persistence; web/admin production boot.
- Auth scope: permission contract skeleton only; login/session implementation remains M2. CMS/page rendering business features remain M3/M5.
- Tests: pnpm lint, pnpm typecheck, pnpm test, pnpm build, pnpm test:integration, production HTTP smoke.
- Environment: Node 24.18.0, pnpm 11.17.0; Git initialized. PostgreSQL 16.14 portable used for real tests because Docker/PostgreSQL service was unavailable. No system service installed.

## Update Rule

Mỗi Agent khi thay status phải thêm link/section evidence vào `TEST_REPORT.md` hoặc ghi blocker vào `ISSUES.md`.
