# HANDOFF.md

> Agent rời session phải cập nhật file này. Agent mới đọc file này trước khi sửa code.

## Current Handoff

### Session State

- Current milestone: M2 COMPLETED (Backend VERIFIED; Admin UI Build PASS; Browser Runtime NOT RUN). Overall M2 is `READY_FOR_TEST` per `DEFINITION_OF_DONE.md`.
- Next milestone: **`M3 — CMS Core (Content Types & Dynamic Content Engine)`**.
- Working tree: Full M2.4 User Management, Role Management, and Role Assignment APIs, Invariants, Last Super Admin Protection, Next.js Admin UI, and PostgreSQL 16 clean DB integration tests verified.

### Completed

- Baseline commit `9294b50`, M2.1 commit `a7b5a2d`, M2.2 hardening commit `37382a0`, and M2.3 commit `d0a7782` pushed to `origin/main`.
- Vertical slice M2.4 Admin User & Role Management:
  - Database unique index migration `0002_cultured_loki.sql` on `user_role_assignments(user_id, role_id, scope_kind, scope_id) NULLS NOT DISTINCT`.
  - Implemented `AdminService` in `apps/api/src/admin.service.ts` handling Users CRUD, Roles CRUD, Permissions catalog, Sites catalog, Role assignments, and Last Active Global Super Admin protection.
  - Implemented 14 REST API endpoints in Fastify (`apps/api/src/app.ts`) protected by Scoped RBAC preHandlers (`users.read`, `users.create`, `users.update`, `users.deactivate`, `roles.read`, `roles.manage`, `roles.assign`, `sites.read`).
  - Enforced business invariants:
    - GLOBAL scope requires `scope_id = NULL` (rejects non-null).
    - SITE scope requires valid existing site UUID from `sites` table.
    - Duplicate role assignment prevention via DB index and application validation (409 Conflict).
    - Last Active Global Super Admin Protection: rejects self-deactivation (400) and rejects deleting last super admin role assignment (400).
    - User password change or deactivation revokes all active sessions for that user immediately in DB.
    - System role `system_super_admin` protected from being stripped of system permissions.
  - Implemented Admin UI in Next.js (`apps/admin`):
    - `/users`: paginated user table, search, status badge, create user modal, deactivate action, and manage role assignments modal with scope selector and real site dropdown from DB.
    - `/roles`: role list, system role badge, create custom role modal, permission matrix modal grouped by module.
    - Top navigation links (`Dashboard`, `Users`, `Roles`).
  - Added test suite 4 to `packages/database/src/database.integration.test.ts` verifying all 14 REST endpoints, invariants, session invalidation, and protections against real PostgreSQL 16 clean database.

### Not Started

- M3: CMS Core (Content types schema engine, dynamic fields, entries, versioning, revisions).
- Hosted CI execution on GitHub Actions.
- Browser automation flow verification (Playwright binary download returned 404 in current environment).

### Next Recommended Actions

1. Commit M2.4 changes:
   - `feat(identity): implement M2.4 admin user role management and invariants`
2. Push commits to `origin/main`.
3. Proceed to milestone **`M3 — CMS Core`**.

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
