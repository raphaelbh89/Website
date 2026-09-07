# ADR-0007: CMS Content Engine Schema, Dynamic Fields, and Revision-Pointer Architecture

- Status: Accepted
- Date: 2026-09-07
- Owners: Lead Architect / Backend Lead / Security Lead

## Context

Hệ sinh thái nền tảng yêu cầu một CMS Content Engine mạnh mẽ, linh hoạt và có khả năng phục vụ lâu dài cho:
1. Nhiều website với nhiều ngành nghề khác nhau (giáo dục, y tế, bất động sản, thương mại, tin tức).
2. Các loại nội dung động (dynamic Content Types) do quản trị viên hoặc AI Factory (M8) tạo ra.
3. Kiến trúc Page Builder (M5) và Module Registry (M5) có thể query nội dung động một cách có cấu trúc và hiệu năng cao.
4. Quản lý vòng đời nội dung chuyên nghiệp: Lưu nháp (Draft), Xem trước (Preview), Xuất bản (Publish), Lịch sử phiên bản (Revisions), và Khôi phục (Rollback).
5. Tránh 2 cái bẫy kiến trúc phổ biến:
   - **Bẫy EAV (Entity-Attribute-Value)**: Gây nổ số lượng bản ghi join, làm tê liệt hiệu năng PostgreSQL.
   - **Bẫy Arbitrary JSON Dump**: Biến database thành kho chứa JSON không có schema/kiểu dữ liệu, làm mất tính toàn vẹn quan hệ, phá hủy khả năng index và query có trật tự.

## Problem

Cần thiết kế mô hình dữ liệu cho Content Type và Content Entry đáp ứng:
1. **Schema-driven & Strongly-typed**: Dynamic fields phải được validate chặt chẽ dựa trên một allow-list các Field Type được định nghĩa tường minh.
2. **Tách bạch bản nháp và bản xuất bản (Non-destructive Draft Editing)**: Việc chỉnh sửa bản nháp (Draft) tuyệt đối không được làm biến đổi, làm ẩn hoặc làm rò rỉ nội dung đang được xuất bản ngoài website công khai.
3. **Bất biến lịch sử (Immutable Revisions)**: Mọi lần lưu/xuất bản đều phải tạo snapshot lịch sử, cho phép rollback an toàn mà không viết đè lịch sử.
4. **Optimistic Concurrency Control**: Tránh tình trạng ghi đè mất dữ liệu (lost updates) khi nhiều biên tập viên cùng thao tác.
5. **Khả năng tiến hóa schema (Schema Evolution)**: Quản lý version của schema và phân định rõ ràng giữa Safe Changes và Breaking Changes.

## Constraints

- Database: PostgreSQL 16 quan hệ kết hợp JSONB (`docs/adr/0002-hybrid-postgresql-jsonb.md`).
- Primary Key: UUIDv7.
- API Security: Bảo vệ phân quyền qua Scoped RBAC (`docs/adr/0006-rbac-scope-strategy.md`).
- Validation: Server-side validation tuyệt đối tại API boundary.

## Considered Alternatives

### Alternative A: Mutable Single-Row Model với cột `status` và `version` tăng dần
- **Mô tả**: Bảng `content_entries` chỉ có 1 row duy nhất chứa cột `data JSONB`, `status` ('draft' | 'published'), và `version++`.
- **Nhược điểm**: Khi một bài viết đang `published` được biên tập viên mở ra sửa (lưu nháp), dữ liệu trong cột `data` bị ghi đè thành nội dung nháp chưa hoàn thiện. Nếu website công khai đọc cột `data`, người dùng ngoài internet sẽ thấy nội dung nháp chưa duyệt. Nếu website không đọc, bài viết bị "biến mất" khỏi trang chủ cho đến khi publish lại. Đây là sai lầm kiến trúc nghiêm trọng.

### Alternative B: Tách 2 bảng độc lập `content_drafts` và `content_published`
- **Mô tả**: Dữ liệu nháp nằm ở bảng `content_drafts`, khi publish thì copy sang bảng `content_published`.
- **Nhược điểm**: Gây phân mảnh schema, nhân đôi các bảng và quan hệ khóa ngoại, khó quản lý lịch sử revision và phức tạp hóa query của Module Registry.

### Alternative C: Revision-Pointer Architecture (Lựa chọn)
- **Mô tả**:
  - Bảng `content_entries` đóng vai trò là thực thể định danh (Identity Container), lưu trữ các con trỏ: `current_revision_id` (bản nháp hiện tại) và `published_revision_id` (bản snapshot đang xuất bản).
  - Bảng `content_entry_revisions` lưu trữ các bản ghi snapshot bất biến (Immutable Revisions) với version number tăng dần.
- **Ưu điểm**:
  - Tách biệt hoàn toàn bản nháp và bản xuất bản.
  - Chỉnh sửa bản nháp chỉ cập nhật `current_revision_id` và tạo revision mới; website công khai vẫn đọc từ `published_revision_id` mà không bị gián đoạn hay rò rỉ.
  - Xuất bản (Publish) là một thao tác nguyên tử (atomic pointer update: `published_revision_id = current_revision_id`).
  - Rollback được thực hiện bằng cách tạo một revision mới sao chép từ revision cũ, bảo toàn 100% lịch sử kiểm toán.

## Decision

### 1. Content Type Domain Model

Mỗi Content Type là một định nghĩa cấu trúc nội dung:

```text
Table: content_types
├── id: UUIDv7 (PK)
├── key: VARCHAR(64) (Immutable machine-readable slug, vd: "article", "course")
├── name: VARCHAR(255) (Display label, vd: "Bài viết", "Khóa học")
├── description: TEXT (NULLABLE)
├── kind: VARCHAR(20) ("collection" | "single")
├── scope_kind: VARCHAR(20) ("global" | "site")
├── site_id: UUID (NULLABLE, FK -> sites.id)
├── schema_version: INT (Default 1, tăng dần khi schema thay đổi)
├── is_system: BOOLEAN (Default false, bảo vệ core types)
├── data_schema: JSONB (Định nghĩa kiểu dữ liệu & validation rules)
├── ui_schema: JSONB (Định nghĩa widget & layout hiển thị trong Admin)
├── capabilities: JSONB (Cấu hình: hasDrafts, hasRevisions, hasSlug, taxonomies)
├── created_at: TIMESTAMPTZ (DEFAULT NOW())
└── updated_at: TIMESTAMPTZ (DEFAULT NOW())
```

**Scope Constraints:**
- `scope_kind = 'global'` $\rightarrow$ `site_id IS NULL`.
- `scope_kind = 'site'` $\rightarrow$ `site_id IS NOT NULL` và site phải tồn tại hợp lệ.

---

### 2. Canonical Field Registry & M3.1 Phasing

Để đảm bảo an toàn kiểu dữ liệu và chống injection, platform chỉ chấp nhận các field types nằm trong Allow-list:

#### A. M3.1 Core Field Types (Ưu tiên triển khai)
1. `text`: Chuỗi ký tự ngắn (VARCHAR, constraints: `minLength`, `maxLength`, `regexPattern`).
2. `textarea`: Văn bản thuần nhiều dòng (TEXT, constraints: `minLength`, `maxLength`).
3. `number`: Số nguyên / số thực (NUMERIC, constraints: `min`, `max`, `integerOnly`).
4. `boolean`: Giá trị true/false (BOOLEAN, constraints: `default: false`).
5. `select`: Chọn 1 giá trị từ enum list (STRING, constraints: `options: [{ label, value }]`).

#### B. Reserved & Deferred Field Types (Trì hoãn sang các milestone chuyên biệt)
- `media`: Trì hoãn tới **M4 (Media Library)** để lưu trữ asset ID có kiểm soát quota/MIME thay vì URL tự do.
- `relation`: Trì hoãn tới khi thiết kế bảng quan hệ N-N quan hệ toàn vẹn (`content_entry_relations`), không lưu foreign UUID dangling trong JSONB.
- `richtext`: Trì hoãn tới khi chốt canonical JSON AST format (vd: TipTap/ProseMirror document JSON) và sanitization engine an toàn để chống XSS.
- `repeater`: Trì hoãn tới M3.2/M5 để kiểm soát độ phức tạp lồng nhau.
- `multiSelect`, `date`, `datetime`, `url`, `email`, `color`: Được chuẩn hóa trong schema spec và sẽ kích hoạt sau khi core engine M3.1 chạy ổn định.

#### C. ReDoS Mitigation Policy
Nếu Admin cung cấp `regexPattern` cho field `text`:
- Giới hạn độ dài pattern: `maxLength = 100` ký tự.
- Chặn các cấu trúc nested quantifier nguy hiểm gây catastrophic backtracking (vd: `(a+)+$`).
- Thực thi timeout (<= 50ms) trong quá trình validate.

---

### 3. Data Schema vs UI Schema Separation

Platform sử dụng **Internal CMS Field Schema** chuẩn hóa (không dùng arbitrary JSON Schema mở rộng):

- **`dataSchema`:**
  ```json
  {
    "version": 1,
    "fields": [
      {
        "key": "summary",
        "label": "Tóm tắt bài viết",
        "type": "textarea",
        "required": true,
        "validation": { "maxLength": 500 },
        "default": ""
      },
      {
        "key": "priority",
        "label": "Độ ưu tiên",
        "type": "number",
        "required": false,
        "validation": { "min": 0, "max": 100 },
        "default": 0
      }
    ]
  }
  ```
- **`uiSchema`:**
  ```json
  {
    "version": 1,
    "elements": [
      {
        "fieldKey": "summary",
        "widget": "textarea",
        "placeholder": "Nhập tóm tắt ngắn cho bài viết...",
        "helpText": "Hiển thị ở card xem trước ngoài trang chủ",
        "colSpan": 12,
        "group": "General"
      },
      {
        "fieldKey": "priority",
        "widget": "number_input",
        "colSpan": 6,
        "group": "Settings"
      }
    ]
  }
  ```

---

### 4. Revision-Pointer Content Entry Model

#### A. Table `content_entries` (Identity Container)
```text
Table: content_entries
├── id: UUIDv7 (PK)
├── site_id: UUID (FK -> sites.id, NOT NULL)
├── content_type_id: UUID (FK -> content_types.id, NOT NULL)
├── locale: VARCHAR(10) (NOT NULL, vd: "vi", "en")
├── translation_group_id: UUID (NOT NULL, gom nhóm bản dịch)
├── current_revision_id: UUID (NULLABLE, FK -> content_entry_revisions.id)
├── published_revision_id: UUID (NULLABLE, FK -> content_entry_revisions.id)
├── status: VARCHAR(20) ("draft" | "published" | "archived", NOT NULL, DEFAULT "draft")
├── created_by: UUID (NULLABLE, FK -> users.id)
├── updated_by: UUID (NULLABLE, FK -> users.id)
├── created_at: TIMESTAMPTZ (DEFAULT NOW())
└── updated_at: TIMESTAMPTZ (DEFAULT NOW())
```

#### B. Table `content_entry_revisions` (Immutable Snapshots)
```text
Table: content_entry_revisions
├── id: UUIDv7 (PK)
├── entry_id: UUID (FK -> content_entries.id ON DELETE CASCADE, NOT NULL)
├── version_number: INT (NOT NULL, 1, 2, 3...)
├── schema_version: INT (NOT NULL, version của dataSchema tại thời điểm tạo)
├── title: VARCHAR(255) (NOT NULL)
├── slug: VARCHAR(255) (NULLABLE)
├── data: JSONB (NOT NULL, validated dynamic fields)
├── created_by: UUID (NULLABLE, FK -> users.id)
└── created_at: TIMESTAMPTZ (DEFAULT NOW())
```

**Constraints:**
- `UNIQUE(entry_id, version_number)`
- `published_revision_id` phải trỏ tới một revision thuộc về chính `entry_id` đó.

---

### 5. Optimistic Concurrency & Lifecycle Invariants

#### A. Optimistic Concurrency Control
Khi gửi request cập nhật (`PATCH /sites/:siteId/content/:typeKey/:entryId`), client bắt buộc phải gửi:
```json
{
  "expectedRevision": 5,
  "title": "New Title",
  "data": { ... }
}
```
- Nếu `server.current_revision.version_number !== expectedRevision`:
  $\rightarrow$ Trả về **`409 Conflict`** (`{"error":"CONFLICT","message":"Content has been modified by another user. Current revision is 6"}`).
- Ngăn chặn hoàn toàn việc ghi đè vô tình giữa các quản trị viên.

#### B. Lifecycle State Derivation
- **Draft Only**: `published_revision_id IS NULL` VÀ `status = 'draft'`.
- **Published**: `published_revision_id IS NOT NULL` VÀ `status = 'published'`.
- **Archived**: `status = 'archived'` (ngừng hiển thị công khai dù `published_revision_id` có tồn tại).
- **Invariant**: Tuyệt đối cấm trạng thái `status = 'published'` khi `published_revision_id IS NULL`.

#### C. Rollback Semantics
Khi quản trị viên yêu cầu Rollback về Revision 3 trong khi phiên bản hiện tại là Revision 8:
- Hệ thống **KHÔNG** xóa hay sửa các Revision 4..8.
- Hệ thống tạo một **Revision 9 mới** có nội dung `title`, `slug`, `data` được sao chép nguyên vẹn từ Revision 3.
- Cập nhật `current_revision_id = Revision 9`.

---

### 6. Schema Evolution Strategy

Khi quản trị viên chỉnh sửa `dataSchema` của Content Type:
1. **Safe Mutations (Tự động chấp nhận & tăng `schema_version`):**
   - Thêm field mới với `required: false`.
   - Thêm field mới với `required: true` VÀ có `default` value hợp lệ.
   - Thay đổi nhãn (`label`), `uiSchema`, thứ tự hiển thị.
2. **Breaking Mutations (Bị từ chối nếu đã tồn tại entries):**
   - Thêm field `required: true` mà không có giá trị `default`.
   - Xóa field đang có dữ liệu trong entries hiện có.
   - Thay đổi kiểu dữ liệu của field (vd: `number` $\rightarrow$ `text`).
   - Đổi `key` của field.
3. **Revision Schema Integrity:**
   Mỗi revision lưu giữ `schema_version` tại thời điểm tạo, cho phép renderer và audit trail hiểu đúng cấu trúc dữ liệu lịch sử.

---

### 7. Queryability & Indexing Strategy

1. **Relational B-Tree Compound Indexes:**
   ```sql
   CREATE INDEX "content_entries_site_type_locale_idx" 
   ON "content_entries" ("site_id", "content_type_id", "locale", "status");
   ```
2. **GIN Path Ops Index trên JSONB data của Revisions:**
   ```sql
   CREATE INDEX "content_entry_revisions_data_gin_idx" 
   ON "content_entry_revisions" USING gin ("data" jsonb_path_ops);
   ```
3. **Hard Pagination Cap:**
   Tất cả các API query đều áp dụng giới hạn `limit <= 100` (mặc định 20) để bảo vệ bộ nhớ và database.

## Consequences

- **Tích cực**:
  - Dữ liệu xuất bản công khai tuyệt đối an toàn và độc lập với quá trình soạn thảo nháp.
  - Lịch sử thay đổi minh bạch 100%, hỗ trợ audit và rollback hoàn hảo.
  - Phù hợp với Module Registry và AI Website Factory.
- **Tiêu cực / Trade-offs**:
  - Tốn thêm dung lượng lưu trữ cho các bản ghi revisions (chấp nhận được vì dữ liệu văn bản JSONB nhỏ, có thể prune old revisions định kỳ ở M9).
  - Thao tác ghi đòi hỏi transaction quản lý cả `content_entries` và `content_entry_revisions`.
