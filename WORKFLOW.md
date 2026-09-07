# WORKFLOW.md

## Workflow tổng quát

```text
INTAKE
  -> ANALYZE
  -> DESIGN
  -> PLAN
  -> IMPLEMENT
  -> SELF-CHECK
  -> READY_FOR_TEST
  -> QA VERIFY
  -> SECURITY/SEO REVIEW (khi cần)
  -> VERIFIED
  -> DONE
```

## 1. INTAKE

Tạo hoặc cập nhật requirement:

- problem statement;
- actor;
- expected outcome;
- scope;
- out of scope;
- acceptance criteria.

## 2. ANALYZE

Kiểm tra:

- domain liên quan;
- data model;
- existing modules;
- permission;
- localization;
- SEO impact;
- migration impact;
- compatibility.

## 3. DESIGN

Nếu thay đổi cross-cutting:

- cập nhật architecture doc;
- tạo ADR;
- xác định API/schema contracts.

## 4. PLAN

Chia vertical slices. Mỗi slice phải càng gần “có thể chạy end-to-end” càng tốt.

Ví dụ Article CRUD:

1. DB + migration.
2. repository/service.
3. API + validation + permission.
4. Admin list/create/edit/delete.
5. Public renderer/query nếu cần.
6. test + evidence.

## 5. IMPLEMENT

- giữ domain boundaries;
- thêm test song song với code;
- không tạo placeholder UI không có action nếu không được ghi rõ là prototype.

## 6. SELF-CHECK

Coding Agent chạy tối thiểu:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Có thể thay command theo repository thực tế nhưng phải ghi command thật.

## 7. READY_FOR_TEST

Agent cập nhật:

- acceptance criteria;
- dữ liệu test;
- route/screen;
- test account/role nếu môi trường cho phép;
- known limitation.

## 8. QA VERIFY

QA chạy:

- happy path;
- invalid input;
- persistence;
- refresh/reload;
- permission;
- direct URL/API bypass;
- mobile/tablet/desktop;
- error state;
- regression liên quan.

## 9. VERIFIED

Chỉ dùng khi test pass và evidence đã được ghi.

## 10. DONE

DONE khi:

- VERIFIED;
- docs/migration/env cập nhật;
- không còn blocker trong scope;
- handoff/state consistent.

## Workflow tạo Website Instance bằng AI

```text
Site Intake
-> Business Analysis
-> Sitemap
-> UX Flow
-> Visual Direction
-> Content Model
-> Module Mapping
-> Page Composition
-> Theme Configuration
-> Content Bootstrap
-> QA
-> SEO
-> Security
-> Release
```

## Workflow tạo Module từ ảnh

```text
Image/Screenshot Input
-> Visual Decomposition
-> Reuse Check
-> Module Contract
-> Props Schema
-> Renderer
-> Admin Config
-> Responsive Rules
-> Preview
-> Tests
-> Visual Verification
-> Registry Approval
```

Không auto-register production module trước verification.
