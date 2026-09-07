# ADR-0008: Content Scoping, Routing, Localization Invariants, and Scoped Permissions

- Status: Accepted
- Date: 2026-09-07
- Owners: Lead Architect / Backend Lead / Security Lead

## Context

Trong hệ thống CMS đa website (Multi-site Platform), quản lý nội dung đòi hỏi việc phân định rõ ràng ranh giới giữa:
1. Định nghĩa loại nội dung toàn hệ thống (Global Content Types) và định nghĩa loại nội dung riêng của từng website (Site-specific Content Types).
2. Sự cô lập dữ liệu tuyệt đối giữa các website (Multi-site Data Isolation).
3. Semantics khác biệt giữa nội dung danh sách (Collection) và nội dung đơn bản (Single / Singleton).
4. Khả năng định tuyến URL (Routing) và tính duy nhất của đường dẫn (Slug Uniqueness).
5. Chuẩn bị cho đa ngôn ngữ (Localization / i18n) với các ràng buộc chặt chẽ.
6. Tích hợp trực tiếp vào hạ tầng phân quyền Scoped RBAC (`docs/adr/0006-rbac-scope-strategy.md`).

## Problem

1. **Namespace Collision & Shadowing**: Nếu một website tự tạo một Content Type trùng `key` với Content Type toàn cục (Global Type), hệ thống sẽ xử lý thế nào khi Module Registry truy vấn? Cần một quy tắc phân giải (Resolution Rule) nhất quán và ngăn chặn hành vi che khuất (Shadowing).
2. **Single vs Collection Invariants**: Làm sao để đảm bảo một Content Type dạng `single` (như cấu hình trang chủ, thông tin liên hệ) chỉ có duy nhất 1 bản ghi trên mỗi website và ngôn ngữ?
3. **Localization Integrity**: Làm sao để gom nhóm các bản dịch mà không để bản dịch bị lẫn lộn giữa các site khác nhau hoặc giữa các Content Type khác nhau?
4. **Authorization Alignment**: Phân định phạm vi quyền hạn giữa quản trị viên hệ sinh thái (Global Admin) và quản trị viên website (Site Admin).

## Decision

### 1. Content Type Namespace & The No-Shadowing Rule

#### A. The No-Shadowing Rule
**Trong M3, Site-specific Content Type TUYỆT ĐỐI KHÔNG ĐƯỢC PHÉP trùng `key` với bất kỳ Global Content Type nào.**
- Ví dụ: Nếu hệ thống toàn cục đã có Global Type `article` hoặc `course`, một site không thể tạo một Custom Type có `key = "article"`.
- **Lý do**: Ngăn chặn sự mập mờ trong Module Registry, bảo vệ các hợp đồng dữ liệu chuẩn hóa, và tránh các lỗi logic phức tạp khi export/import template.

#### B. Unique Constraints cho Content Types
1. **Global Scope**:
   ```sql
   CREATE UNIQUE INDEX "content_types_global_key_idx" 
   ON "content_types" ("key") 
   WHERE "scope_kind" = 'global';
   ```
2. **Site Scope**:
   ```sql
   CREATE UNIQUE INDEX "content_types_site_key_idx" 
   ON "content_types" ("site_id", "key") 
   WHERE "scope_kind" = 'site';
   ```
3. **Application Guard**: Khi tạo Site-specific Type, `AdminService` bắt buộc kiểm tra xem `key` đó đã tồn tại trong danh sách Global Types hay chưa; nếu đã có $\rightarrow$ Trả về **`409 Conflict`** (`{"error":"CONFLICT","message":"Content type key shadows an existing global content type"}`).

#### C. Deterministic Resolution Rule
Khi client gọi API `/sites/:siteId/content/:typeKey`:
1. Tìm trong bảng `content_types` với `key = :typeKey` và `scope_kind = 'global'`. Nếu tìm thấy $\rightarrow$ Sử dụng Global Type này.
2. Nếu không thấy, tìm `key = :typeKey`, `scope_kind = 'site'`, và `site_id = :siteId`. Nếu tìm thấy $\rightarrow$ Sử dụng Site Type này.
3. Nếu vẫn không thấy $\rightarrow$ Trả về **`404 Not Found`** (`Content type not found`).

---

### 2. Multi-Site Isolation Boundary

- Mọi Content Entry **bắt buộc** thuộc về một `site_id` cụ thể (`site_id IS NOT NULL`).
- Global Content Types được chia sẻ về mặt cấu trúc (Schema definition), nhưng **dữ liệu nội dung (Entries) luôn luôn được cô lập 100% theo `site_id`**.
- Quản trị viên của Site A tuyệt đối không thể xem, sửa hoặc xuất bản nội dung của Site B.

---

### 3. Single vs Collection Semantics & Invariants

| Tiêu chí | `kind = 'collection'` (Danh sách) | `kind = 'single'` (Đơn bản / Singleton) |
|---|---|---|
| **Mục đích** | Tin tức, sản phẩm, khóa học, nhân sự | Trang giới thiệu, Cấu hình Header, Hero Section |
| **Số lượng entries** | Không giới hạn entries trên mỗi `(site, locale)` | **Tối đa 1 entry** cho mỗi `(site, locale)` |
| **Yêu cầu Slug** | Bắt buộc có `slug` duy nhất (để routing chi tiết) | `slug = NULL` (không cần routing riêng) |
| **URL Pattern** | `/:locale/:typeKey/:slug` (vd: `/vi/news/bai-1`) | Được nhúng trực tiếp vào Page/Module |

#### Cơ chế bảo vệ Singleton Invariant
1. **Application / Domain Layer**: Kiểm tra trước khi tạo; nếu đã tồn tại entry cho `(site_id, content_type_id, locale)` $\rightarrow$ Từ chối `409 Conflict`.
2. **Transaction Lock**: Bọc trong Transaction khi khởi tạo.
3. **Database Partial Unique Index**:
   ```sql
   CREATE UNIQUE INDEX "content_entries_single_unique_idx" 
   ON "content_entries" ("site_id", "content_type_id", "locale") 
   WHERE "slug" IS NULL;
   ```

---

### 4. Routing & Slug Uniqueness

- **Chuẩn hóa Slug**: Slug được chuyển thành chữ thường (lowercase), loại bỏ ký tự đặc biệt, chuyển dấu tiếng Việt thành ASCII không dấu (URL-safe slug).
- **Ràng buộc duy nhất**:
  ```sql
  CREATE UNIQUE INDEX "content_entry_revisions_slug_idx" 
  ON "content_entry_revisions" ("entry_id", "slug") 
  WHERE "slug" IS NOT NULL;
  ```
  Và application check đảm bảo không có 2 entries khác nhau trong cùng `(site_id, content_type_id, locale)` có cùng `slug` đang ở trạng thái active/published.

---

### 5. Localization / i18n Invariants

Platform áp dụng mô hình **Shared Base Identity với Translation Groups**:
- Mỗi ngôn ngữ là một dòng `content_entries` riêng.
- Các bản dịch của cùng một nội dung được liên kết qua UUID `translation_group_id`.

#### Các bất biến bắt buộc (Invariants)
1. **Không vượt ranh giới Site**: Tất cả entries trong cùng một `translation_group_id` bắt buộc phải có cùng `site_id`.
2. **Không vượt ranh giới Content Type**: Tất cả entries trong cùng một `translation_group_id` bắt buộc phải có cùng `content_type_id`.
3. **Duy nhất ngôn ngữ trong Translation Group**: Một ngôn ngữ chỉ được xuất hiện **tối đa 1 lần** trong cùng một translation group.
   ```sql
   CREATE UNIQUE INDEX "content_entries_translation_locale_unique_idx" 
   ON "content_entries" ("translation_group_id", "locale");
   ```
4. **Normalized Locale Format**: Chuẩn hóa theo định dạng BCP 47 subset (vd: `vi`, `en`, `fr`, `ja`, `zh-CN`). Nền tảng trung lập, không hard-code ngôn ngữ mặc định trong kiến trúc core.

---

### 6. Scoped RBAC Permissions for CMS Core

Tích hợp trực tiếp vào Scoped RBAC (`docs/adr/0006-rbac-scope-strategy.md`):

```text
                               ┌─────────────────────────┐
                               │   Authorization Check   │
                               └────────────┬────────────┘
                                            │
                    ┌───────────────────────┴───────────────────────┐
                    ▼                                               ▼
         GLOBAL Scope Target                             SITE Scope Target
  ┌───────────────────────────────┐               ┌───────────────────────────────┐
  │ - content_types.read (Global) │               │ - content_types.read (Site)   │
  │ - content_types.manage(Global)│               │ - content_types.manage(Site)  │
  └───────────────────────────────┘               │ - content.read                │
                                                  │ - content.create              │
                                                  │ - content.update              │
                                                  │ - content.delete              │
                                                  │ - content.publish             │
                                                  └───────────────────────────────┘
```

- **Quy tắc phân quyền:**
  - `content_types.manage` ở `GLOBAL` scope: Chỉ người có quyền Global mới được tạo/sửa Global Content Types.
  - `content_types.manage` ở `SITE` scope: Quản trị viên site chỉ được tạo/sửa Site-specific Content Types của chính site đó.
  - Mọi thao tác nội dung (`content.*`) luôn yêu cầu quyền ở `SITE` scope tương ứng với `site_id` của entry.

---

### 7. Delete vs Archive Semantics

Để bảo toàn tính toàn vẹn dữ liệu, quan hệ và lịch sử kiểm toán:
1. **Content Type**:
   - `DELETE /content-types/:id`: Đóng vai trò là **Soft-Archive** (đặt trạng thái `is_active = false`).
   - Bị từ chối nếu đang tồn tại Content Entries tham chiếu tới Content Type này.
2. **Content Entry**:
   - Thao tác thông thường là **Archive** (`POST /sites/:siteId/content/:typeKey/:entryId/archive`), chuyển trạng thái `status = 'archived'`.
   - `DELETE /sites/:siteId/content/:typeKey/:entryId`: Chỉ xóa vật lý (hard-delete) nếu entry đang ở trạng thái nháp (`draft`) và chưa từng được xuất bản (`published_revision_id IS NULL`). Nếu đã từng xuất bản, REST DELETE sẽ tự động chuyển thành Archive để bảo vệ lịch sử.

## Consequences

- **Tích cực**:
  - Kiến trúc phân định ranh giới rõ ràng, không có xung đột namespace.
  - Multi-site isolation được đảm bảo ở cả tầng API, Domain Service và Database Index.
  - Tương thích 100% với lộ trình mở rộng đa ngôn ngữ (M7) và Page Builder (M5).
- **Tiêu cực / Trade-offs**:
  - Yêu cầu tầng Domain Service phải thực hiện các kiểm tra tính toàn vẹn (No-shadowing, Single entry check) một cách chặt chẽ bên trong Database Transaction.
