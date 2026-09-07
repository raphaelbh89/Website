# AI-Driven Modular Website Platform

## M1 — chạy nền tảng

Yêu cầu Node.js 24, pnpm 11.17.0 và PostgreSQL 16 (hoặc Docker Compose).
Web/admin hiện là màn hình foundation, chưa phải CMS/website nghiệp vụ; authentication thuộc M2.

```powershell
pnpm install --frozen-lockfile
Copy-Item .env.example .env # Chỉ khi chưa có .env; không ghi đè cấu hình hiện có
docker compose up -d postgres
pnpm typecheck
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Nếu dùng PostgreSQL có sẵn, bỏ bước Docker và điền DATABASE_URL của database dành riêng cho dự án.
Commands đọc `.env` tại root và không ghi đè biến môi trường đã đặt. Seed chỉ tạo site `development`, không tạo tài khoản.
Web: http://localhost:3000; Admin: http://localhost:3001; API: http://127.0.0.1:4000.
`/health/live` xác nhận process đang sống; `/health/ready` chỉ trả 200 khi kết nối DB và schema `sites` đã sẵn sàng, ngược lại 503.

```powershell
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:smoke
```

Production: sau build, chạy `pnpm --filter @platform/api start`, `pnpm --filter @platform/web start`,
`pnpm --filter @platform/admin start` ở ba terminal. API dùng cùng env validation như development.
Smoke tự khởi động rồi dừng các server trên cổng 13000, 13001, 14000 (và 14001 nếu có TEST_DATABASE_URL).

Integration test yêu cầu một **database PostgreSQL 16 trống, riêng cho mỗi lần chạy**:

```powershell
$env:TEST_DATABASE_URL = 'postgresql://user:password@localhost:5432/fresh_test_db'
pnpm test:integration
pnpm test:smoke
```

Test từ chối DB đã có bảng `sites`, không drop/reset dữ liệu. Nó kiểm tra clean/repeated migration,
seed idempotent, UUIDv7, uniqueness, persistence qua kết nối mới và readiness. Smoke với TEST_DATABASE_URL
còn kiểm tra API production đọc được DB đã migrate. CI tự cung cấp PostgreSQL 16 mới cho mỗi job.
Tạo migration mới bằng `pnpm db:generate` sau khi sửa schema; review SQL trước `pnpm db:migrate`.
Không sửa migration đã release; rollback dùng backup hoặc forward migration đã review.

Trong phiên M1, PostgreSQL portable dùng riêng cho QA được lưu tại `.local-postgres/` (Git-ignored),
không cài service hệ thống và dừng sau kiểm thử. Đây không phải dependency production.
Hướng dẫn dùng lại môi trường này: [docs/M1_LOCAL_POSTGRES.md](docs/M1_LOCAL_POSTGRES.md).

## Mục tiêu

Repository này định nghĩa kiến trúc, quy tắc và quy trình để xây dựng một **Website Platform / Headless CMS + Visual Page Builder + AI Website Factory** có thể tái sử dụng cho nhiều lĩnh vực và nhiều thương hiệu.

Công thức sản phẩm:

```text
Platform Core + Configuration + Content + Theme + Modules = Website Instance
```

Frontend không được hard-code cấu trúc trang hoặc nội dung nghiệp vụ. Admin/CMS phải là nguồn dữ liệu và cấu hình chính cho trang public.

## Kiến trúc được chốt

- Modular Monolith trên Monorepo.
- pnpm Workspaces + Turborepo.
- 3 ứng dụng chính: `apps/web`, `apps/admin`, `apps/api`.
- PostgreSQL 16.
- Relational model cho core domain + JSONB cho cấu hình động.
- UUIDv7 cho primary key mới.
- Soft Delete với partial indexes ở các bảng cần phục hồi/audit.
- Schema-driven configuration, ưu tiên Zod/JSON Schema để Admin tự sinh form cấu hình.
- Page Builder data-driven.
- Module Registry tách **Module Type** khỏi **Content Source**.
- Theme Engine dựa trên Design Tokens.
- i18n theo translation layer, không copy toàn bộ record một cách tùy tiện.
- Security-by-design, SEO-by-design, observability, audit log.
- Multi-Agent có persistent project memory bằng Markdown + Git + ADR + test evidence.

## Thứ tự đọc bắt buộc của Agent

1. `AGENTS.md`
2. `RULES.md`
3. `WORKFLOW.md`
4. `PROJECT_STATE.md`
5. `PROGRESS.md`
6. `HANDOFF.md`
7. Tài liệu domain liên quan trong `docs/`
8. ADR liên quan trong `docs/adr/`

Không Agent nào được bắt đầu sửa code trước khi đọc tối thiểu các file trên.

## Tài liệu chính

- `MASTER_PROMPT.md`: prompt điều phối toàn dự án.
- `AGENTS.md`: luật vận hành của Agent.
- `ROLES.md`: vai trò và trách nhiệm.
- `RULES.md`: luật kỹ thuật bắt buộc.
- `WORKFLOW.md`: workflow từ phân tích đến verified done.
- `PROJECT_STATE.md`: trạng thái kiến trúc hiện tại.
- `PROGRESS.md`: bảng tiến độ feature/task.
- `HANDOFF.md`: bàn giao giữa các Agent/session.
- `TESTING.md`: chiến lược test.
- `TEST_REPORT.md`: bằng chứng test runtime.
- `DEFINITION_OF_DONE.md`: điều kiện DONE.
- `ISSUES.md`: lỗi/blocked/debt.

## Tài liệu kiến trúc

Trong `docs/`:

- `PRODUCT_REQUIREMENTS.md`
- `ARCHITECTURE.md`
- `DATABASE.md`
- `API_CONVENTIONS.md`
- `CMS_ARCHITECTURE.md`
- `PAGE_BUILDER.md`
- `MODULE_SYSTEM.md`
- `THEME_ENGINE.md`
- `AI_WORKFLOW.md`
- `SECURITY.md`
- `SEO.md`
- `I18N.md`
- `OBSERVABILITY.md`

## Quy tắc cốt lõi

```text
Implementation != Working
Build Success != Feature Success
Feature Success = Verified Runtime Behavior
```

Không được đánh dấu DONE chỉ vì code compile hoặc giao diện trông đúng.

## Cấu trúc source code mục tiêu

```text
apps/
├── web/
├── admin/
└── api/

packages/
├── ui/
├── database/
├── auth/
├── cms/
├── page-builder/
├── module-engine/
├── theme-engine/
├── forms/
├── media/
├── seo/
├── i18n/
├── validation/
├── config/
└── shared/
```

## Ba giai đoạn triển khai

### Phase 1 — Platform Core

Auth, RBAC, database, CMS, media, taxonomy, menu, forms, settings, i18n, SEO, audit.

### Phase 2 — Composition Engine

Page Builder, Module Registry, renderer, Theme Engine, responsive config, animation, preview.

### Phase 3 — AI Website Factory

Business analysis -> sitemap -> UX -> visual direction -> content model -> module plan -> implementation -> QA -> security -> SEO -> release.

## Nguyên tắc khi khởi tạo dự án thật

Agent đầu tiên phải cập nhật `PROJECT_STATE.md` và `PROGRESS.md`, tạo ADR cho mọi quyết định kiến trúc chưa được chốt, sau đó mới tạo source code.
