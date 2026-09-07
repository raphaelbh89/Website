# ADR-0008: Content Scoping, Bi-directional No-Shadowing, Routing, and Scoped Permissions

- Status: Accepted
- Date: 2026-09-07
- Owners: Lead Architect / Backend Lead / Security Lead

## Context

Trong hệ thống CMS đa website (Multi-site Platform), quản lý nội dung đòi hỏi việc phân định rõ ràng ranh giới giữa:
1. Định nghĩa loại nội dung toàn hệ thống (Global Content Types) và định nghĩa loại nội dung riêng của từng website (Site-specific Content Types).
2. Sự cô lập dữ liệu tuyệt đối giữa các website (Multi-site Data Isolation).
3. Semantics khác biệt giữa nội dung danh sách (Collection) và nội dung đơn bản (Single / Singleton).
4. Khả năng định tuyến URL (Routing) và tính duy nhất của đường dẫn xuất bản (`published_slug`).
5. Chuẩn bị cho đa ngôn ngữ (Localization / i18n) với các ràng buộc chặt chẽ.
6. Tích hợp trực tiếp vào hạ tầng phân quyền Scoped RBAC (`docs/adr/0006-rbac-scope-strategy.md`).

## Problem

1. **Bi-directional Namespace Collision & Shadowing**:
   - Nếu Site A tạo Content Type `article`, trong khi Global Type `article` đã tồn tại $\rightarrow$ Xung đột.
   - Ngược lại: Nếu Site A đã có Site-specific Type `doctor`, sau đó Global Admin tạo Global Type `doctor` $\rightarrow$ Xung đột ngược với Site A.
   - Cần quy tắc **No-Shadowing hai chiều (Bi-directional No-Shadowing)** và cơ chế khóa chống race condition (`pg_advisory_xact_lock`).
2. **Singleton Invariants**: Đảm bảo Content Type dạng `single` chỉ có duy nhất 1 bản ghi trên mỗi `(site, locale)` dựa trên trường `entry_kind = 'single'`.
3. **Localization Integrity**: Gom nhóm các bản dịch qua `translation_group_id` do server kiểm soát, không để bản dịch bị lẫn lộn giữa các site khác nhau hoặc giữa các Content Type khác nhau.
4. **Authorization Alignment**: Phân định phạm vi quyền hạn giữa quản trị viên hệ sinh thái (Global Admin) và quản trị viên website (Site Admin).

## Decision

### 1. Bi-directional No-Shadowing & Concurrency Serialization

#### A. The Bi-directional No-Shadowing Rule
1. **Chiều 1 (Site $\rightarrow$ Global)**: Không cho phép tạo bất kỳ Site-specific Content Type nào có `key` trùng với một Global Content Type đã tồn tại.
2. **Chiều 2 (Global $\rightarrow$ Site)**: Không cho phép tạo bất kỳ Global Content Type nào có `key` trùng với bất kỳ Site-specific Content Type nào đã tồn tại trên bất kỳ website nào của nền tảng.

#### B. Race Condition Prevention with PostgreSQL Advisory Locks
Khi tạo Content Type (cả Global và Site-specific), hệ thống bọc trong Database Transaction với Advisory Transaction Lock:
```sql
SELECT pg_advisory_xact_lock(hashtext(LOWER(:key)));
```
Sau đó mới thực hiện `SELECT` kiểm tra tồn tại và `INSERT`. Khóa này tự động giải phóng khi transaction kết thúc, ngăn chặn hoàn toàn tình huống 2 requests đồng thời (1 tạo Global, 1 tạo Site) cùng thành công và che khuất nhau.

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

Mỗi Content Entry được snapshot thuộc tính `entry_kind` từ `ContentType.kind` tại thời điểm tạo:

| Tiêu chí | `entry_kind = 'collection'` (Danh sách) | `entry_kind = 'single'` (Đơn bản / Singleton) |
|---|---|---|
| **Mục đích** | Tin tức, sản phẩm, khóa học, nhân sự | Trang giới thiệu, Cấu hình Header, Hero Section |
| **Số lượng entries** | Không giới hạn entries trên mỗi `(site, locale)` | **Tối đa 1 entry** cho mỗi `(site, locale)` |
| **Yêu cầu Slug** | Bắt buộc có `slug` khi publish để routing | `published_slug = NULL` (không routing riêng) |
| **URL Pattern** | `/public/sites/:siteId/content/:typeKey/:slug` | Nhúng trực tiếp vào Page/Module |

#### Database Singleton Invariant
```sql
CREATE UNIQUE INDEX "content_entries_single_unique_idx" 
ON "content_entries" ("site_id", "content_type_id", "locale") 
WHERE "entry_kind" = 'single';
```
*(Bảo vệ chặt chẽ ở tầng DB, không suy diễn dựa trên slug IS NULL)*.

---

### 4. Routing & Published Slug Uniqueness

- **Relational Routing Projection**: Cột `published_slug` trên bảng `content_entries` đóng vai trò là projection định tuyến duy nhất khi bài viết được xuất bản.
- **Ràng buộc duy nhất**:
  ```sql
  CREATE UNIQUE INDEX "content_entries_published_slug_unique_idx" 
  ON "content_entries" ("site_id", "content_type_id", "locale", "published_slug") 
  WHERE "published_slug" IS NOT NULL;
  ```
- **Xung đột khi Xuất bản (Publish Conflict)**:
  Các bản nháp (`content_entry_revisions.slug`) có thể trùng slug tạm thời, nhưng khi thực hiện giao dịch Xuất bản (Publish Transaction), nếu `current_revision.slug` trùng với `published_slug` của một entry khác $\rightarrow$ Giao dịch bị từ chối với **`409 Conflict`** (`{"error":"CONFLICT","message":"Published slug is already in use by another entry"}`).

---

### 5. Localization Invariants (M3.1 Boundary)

- **Translation Group Container**: Bảng `content_entries` chứa `translation_group_id` (UUIDv7 do server sinh tự động).
- **Ràng buộc bất biến**:
  1. Tất cả entries trong cùng một `translation_group_id` bắt buộc phải có cùng `site_id` và `content_type_id`.
  2. Một ngôn ngữ chỉ xuất hiện tối đa 1 lần trong một translation group:
     ```sql
     CREATE UNIQUE INDEX "content_entries_translation_locale_unique_idx" 
     ON "content_entries" ("translation_group_id", "locale");
     ```
  3. Locale được chuẩn hóa theo định dạng BCP 47 subset (vd: `vi`, `en`, `fr`, `ja`, `zh-CN`).
  4. Trong M3.1, client không tự ý gán arbitrary `translation_group_id`; server hoàn toàn kiểm soát việc tạo translation group mới.

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
  - `content_types.manage` ở `SITE` scope: Quản trị viên site chỉ được tạo/sửa Site-specific Content Types của chính site đó; tuyệt đối không thể sửa Global Types.
  - Mọi thao tác nội dung (`content.*`) luôn yêu cầu quyền ở `SITE` scope tương ứng với `site_id` của entry.

---

### 7. Delete vs Archive Semantics

- **Content Type**:
  - `DELETE /content-types/:id`: Đóng vai trò là Soft-Archive (`is_active = false`), từ chối nếu có Content Entries đang hoạt động.
- **Content Entry**:
  - `POST .../archive`: Chuyển `lifecycle_state = 'archived'`. Public resolver lập tức loại bỏ khỏi kết quả tìm kiếm. Lịch sử revisions được bảo toàn nguyên vẹn.
  - `DELETE ...`: Chỉ cho phép xóa vật lý (hard-delete) nếu entry đang là bản nháp thuần túy và **chưa từng được xuất bản** (`published_revision_id IS NULL`).

## Consequences

- **Tích cực**:
  - No-Shadowing 2 chiều và advisory locks loại bỏ hoàn toàn nguy cơ xung đột schema giữa Global và Site.
  - Public routing nhanh vượt trội nhờ `published_slug` projection và index độc lập.
  - Tương thích 100% với hạ tầng Scoped RBAC M2.
