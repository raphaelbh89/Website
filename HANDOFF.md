# HANDOFF.md

> Agent rời session phải cập nhật file này. Agent mới đọc file này trước khi sửa code.

## Current Handoff

### Session State

- Current milestone: M1 VERIFIED; independent verification tests (install, lint, typecheck, unit, build, PostgreSQL integration, production smoke) re-run and passed in this session.
- Current active task: establishing Git baseline commit, pushing to origin if permitted, then creating M2 ADRs (0005 & 0006).
- Working tree: Git remote `origin` set to `https://github.com/raphaelbh89/Website.git`. Ready for baseline commit.

### Completed

- ADR-0004 accepted: Node 24, pnpm/Turbo, Next web/admin, Fastify API, Drizzle/PostgreSQL.
- Workspace packages/config, database and auth contract skeleton; apps/web, admin, api.
- Validated environment, live/ready endpoints, SQL migration, idempotent development-site seed.
- CI workflow, frozen lockfile and documented local/production commands.
- Independent verification rerun passed completely with real PostgreSQL 16 portable (evidence: `TEST_REPORT.md` TR-20260907-M1-RERUN).

### Not Started

- M2 authentication/session, persisted roles/permission management and protected business endpoints.
- CMS content and page rendering business flows.
- Hosted CI execution (workflow exists; remote configured; baseline commit pending).

### Next Recommended Actions

1. Commit M1 baseline to Git (`feat: establish M1 platform foundation`) and attempt push to `origin/main`.
2. Formulate ADR-0005 (Auth & Session Strategy) and ADR-0006 (Scoped RBAC Strategy).
3. Deliver M2 Architecture Checkpoint report before commencing code implementation.

### Files changed / commands / limitations

- Added: root workspace/tooling/env/Compose/CI configuration, apps/*, packages/*, scripts/smoke.mjs, ADR-0004 and local database instructions.
- Updated: README, PROJECT_STATE, PROGRESS, TEST_REPORT, ISSUES, HANDOFF, DEV_LOG.
- PASS commands and actual DB evidence: TEST_REPORT.md TR-20260907-M1. No product login/publish behavior is claimed.
- Local PostgreSQL and fresh-install copy under .local-postgres are ignored, retained (not deleted), and must not be committed.
- PostgreSQL portable was stopped successfully with pg_ctl; all smoke servers were stopped by the script. Data remains available for later QA.
- Sandbox helper failed intermittently; edits used apply_patch directly through an authorized elevated process. Elevated Git needs command-scoped `-c safe.directory=E:/WebstiteCMS` due to sandbox account ownership; no global exception added.

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
