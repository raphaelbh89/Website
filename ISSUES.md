# ISSUES.md

## Severity

- `S0`: security/data loss/production outage.
- `S1`: core flow unusable.
- `S2`: significant defect/workaround exists.
- `S3`: minor defect/debt.

## Active Issues

| ID | Severity | Status | Area | Description | Owner |
|---|---|---|---|---|---|
| ARCH-001 | S2 | RESOLVED | Architecture | Framework/ORM pinned in ADR-0004; Auth/Session strategy finalized and accepted in ADR-0005 | Architect/Security |
| ARCH-002 | S2 | RESOLVED | RBAC | Permission scope strategy finalized (GLOBAL/SITE/CAMPUS/RESOURCE) and accepted in ADR-0006 | Architect/Security |
| ARCH-003 | S2 | OPEN | Page Builder | Cần giới hạn dynamic schema để tránh config trở thành untyped JSON dump | Architect |
| ENV-M1-001 | S2 | RESOLVED | QA environment | Resolved locally via portable PostgreSQL 16 on 127.0.0.1:55432; independent verification rerun passed; see TR-20260907-M1-RERUN | Orchestrator/QA |

## Issue Template

### M1 environment notes — 2026-09-07

- Docker CLI/PostgreSQL service absent. Resolved for local verification using PostgreSQL 16.14 portable, loopback-only on port 55432, under Git-ignored .local-postgres. No system service installed.
- Git initialized by sandbox account; elevated Git requires command-scoped `git -c safe.directory=E:/WebstiteCMS ...`. No global safe.directory wildcard configured.
- Sandbox helper intermittently fails after Git initialization; authorized elevated execution and direct apply_patch executable were used. Source edits remain limited to M1 scope.
- CI definition exists but no remote/hosted CI run yet. No CI pass is claimed.
- Initial install blocked esbuild scripts; allowBuilds explicitly allows only esbuild. Deprecated transitive @esbuild-kit dependencies remain in drizzle-kit (not application runtime).

```md
### ISSUE-XXX — Title

- Severity:
- Status: OPEN / IN_PROGRESS / FIXED / VERIFIED / WONT_FIX
- Reproduction:
- Expected:
- Actual:
- Root cause:
- Fix:
- Regression tests:
- Evidence:
```
