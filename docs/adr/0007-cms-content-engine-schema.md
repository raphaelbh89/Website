# ADR-0007: CMS Content Engine Schema, Canonical Field Registry, and Revision-Pointer Architecture

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
1. **Schema-driven & Strongly-typed**: Dynamic fields phải được validate chặt chẽ dựa trên một allow-list các Field Type được định nghĩa tường minh theo đặc tả CMS Field Schema.
2. **Tách bạch bản nháp và bản xuất bản (Non-destructive Draft Editing)**: Việc chỉnh sửa bản nháp (Draft) tuyệt đối không được làm biến đổi, làm ẩn hoặc làm rò rỉ nội dung đang được xuất bản ngoài website công khai.
3. **Bất biến lịch sử (Immutable Revisions)**: Mọi lần lưu/xuất bản đều phải tạo snapshot lịch sử, cho phép rollback an toàn mà không viết đè lịch sử.
4. **Optimistic Concurrency Control**: Tránh tình trạng ghi đè mất dữ liệu (lost updates) khi nhiều biên tập viên cùng thao tác (`expectedRevision` $\rightarrow$ `409 Conflict`).
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
  - `content_entries` đóng vai trò là thực thể định danh logic (Logical Identity Container), lưu trữ các con trỏ: `current_revision_id` (bản nháp hiện tại), `published_revision_id` (bản snapshot đang xuất bản), và `published_slug` (relational routing projection).
  - `content_entry_revisions` lưu trữ các bản ghi snapshot bất biến (Immutable Revisions) với version number tăng dần.
- **Ưu điểm**:
  - Tách biệt hoàn toàn bản nháp và bản xuất bản.
  - Chỉnh sửa bản nháp chỉ cập nhật `current_revision_id` và tạo revision mới; website công khai chỉ đọc từ `published_revision_id` mà không bị gián đoạn hay rò rỉ.
  - Xuất bản (Publish) là một thao tác nguyên tử (atomic transaction: `published_revision_id = current_revision_id`, `published_slug = current_revision.slug`).
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
├── data_schema: JSONB (CMS Field Schema định nghĩa kiểu dữ liệu & validation rules)
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

Hệ thống sử dụng **CMS Field Schema** với Allow-list các Field Type được định nghĩa tường minh:

#### A. M3.1 Core Field Types (Kích hoạt chính thức)
1. `text`: Chuỗi ký tự ngắn (VARCHAR, constraints: `required`, `minLength`, `maxLength`, `default`).
2. `textarea`: Văn bản thuần nhiều dòng (TEXT, constraints: `required`, `minLength`, `maxLength`, `default`).
3. `number`: Số nguyên / số thực (NUMERIC, constraints: `required`, `min`, `max`, `integerOnly`, `default`).
4. `boolean`: Giá trị true/false (BOOLEAN, constraints: `required`, `default`).
5. `select`: Chọn 1 giá trị từ enum list (STRING, constraints: `required`, `options: [{ label, value }]`, `default`).

> **Lưu ý về Validation trong M3.1**: Không hỗ trợ arbitrary custom `regexPattern` trong M3.1 để tránh ReDoS và rủi ro native JavaScript RegExp timeout. Tất cả các field definitions phải được validate chặt chẽ (reject unknown field types, duplicate keys, unsupported properties).

#### B. Reserved & Deferred Field Types
- `media`: Trì hoãn tới **M4 (Media Library)** để quản lý asset ID, MIME type, quota.
- `relation`: Trì hoãn tới khi triển khai bảng quan hệ chuẩn hóa (`content_entry_relations`), không lưu foreign UUID dangling trong JSONB.
- `richtext`: Trì hoãn tới khi chuẩn hóa canonical storage format (TipTap document JSON) và XSS sanitizer policy.
- `repeater`: Trì hoãn tới M3.2/M5.
- `multiSelect`, `date`, `datetime`, `url`, `email`, `color`: Được chuẩn hóa trong schema spec và sẽ kích hoạt sau khi M3.1 core engine chạy ổn định.

---

### 3. CMS Field Schema vs UI Schema

- **`dataSchema` (CMS Field Schema):**
  ```json
  {
    "version": 1,
    "fields": [
      {
        "key": "headline",
        "label": "Tiêu đề chính",
        "type": "text",
        "required": true,
        "minLength": 1,
        "maxLength": 200,
        "default": ""
      },
      {
        "key": "views",
        "label": "Lượt xem",
        "type": "number",
        "required": false,
        "min": 0,
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
        "fieldKey": "headline",
        "widget": "text_input",
        "placeholder": "Nhập tiêu đề...",
        "colSpan": 12,
        "group": "General"
      }
    ]
  }
  ```

---

### 4. Revision-Pointer Content Entry Model

#### A. Table `content_entries` (Logical Identity Container)
```text
Table: content_entries
├── id: UUIDv7 (PK)
├── site_id: UUID (FK -> sites.id, NOT NULL)
├── content_type_id: UUID (FK -> content_types.id, NOT NULL)
├── locale: VARCHAR(10) (NOT NULL, vd: "vi", "en")
├── translation_group_id: UUID (NOT NULL, gom nhóm bản dịch)
├── entry_kind: VARCHAR(20) ("single" | "collection", NOT NULL)
├── current_revision_id: UUID (NULLABLE, trỏ revision nháp hiện tại)
├── published_revision_id: UUID (NULLABLE, trỏ snapshot xuất bản)
├── published_slug: VARCHAR(255) (NULLABLE, relational routing projection)
├── lifecycle_state: VARCHAR(20) ("active" | "archived", NOT NULL, DEFAULT "active")
├── created_by: UUID (NULLABLE, FK -> users.id)
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
- **Routing Slug Invariant**: `UNIQUE(site_id, content_type_id, locale, published_slug) WHERE published_slug IS NOT NULL`.
- **Singleton Invariant**: `UNIQUE(site_id, content_type_id, locale) WHERE entry_kind = 'single'`.
- **Revision Ownership Integrity**: `current_revision_id` và `published_revision_id` bắt buộc phải trỏ đến các revision thuộc về chính `entry_id` đó (enforce trong domain service transaction).

---

### 5. Publication State Rules & Public Content Resolver

Trạng thái xuất bản được suy luận hoàn toàn từ các con trỏ:
1. `published_revision_id IS NULL`: Entry chưa từng được xuất bản (Draft only).
2. `published_revision_id == current_revision_id`: Entry đang xuất bản, không có chỉnh sửa nháp mới.
3. `published_revision_id != current_revision_id`: Entry đang xuất bản nhưng có bản nháp mới (`current_revision_id`) đang được chỉnh sửa.
4. `lifecycle_state == 'archived'`: Entry đã bị lưu trữ / ngừng hoạt động.

**Nguyên tắc Public Resolver:**
- Public content resolver **TUYỆT ĐỐI KHÔNG ĐỌC** `current_revision_id`.
- Public content resolver chỉ đọc `published_revision_id` khi `lifecycle_state = 'active'` VÀ `published_revision_id IS NOT NULL`.
- **Bằng chứng kiểm thử bắt buộc:**
  - Published Revision 2 $\rightarrow$ Sửa nháp tạo Revision 3 $\rightarrow$ `current = 3`, `published = 2` $\rightarrow$ Public resolver VẪN TRẢ VỀ Revision 2.

---

### 6. Atomic Transactions

#### A. Entry Create Transaction
```text
BEGIN
  1. Resolve ContentType, validate site access, validate data against CMS Field Schema.
  2. INSERT content_entries (pointers = null, entry_kind = ContentType.kind, lifecycle_state = 'active').
  3. INSERT content_entry_revisions (entry_id = new_entry.id, version_number = 1, schema_version = ContentType.schema_version, title, slug, data).
  4. UPDATE content_entries SET current_revision_id = revision_1.id.
COMMIT
```

#### B. Entry Update Transaction (Optimistic Concurrency)
```text
BEGIN
  1. SELECT entry FOR UPDATE; compare client expectedRevision === current_revision.version_number (nếu không khớp -> 409 Conflict).
  2. Validate payload data against latest ContentType.data_schema.
  3. INSERT content_entry_revisions (version_number = current_revision.version_number + 1, schema_version = ContentType.schema_version, title, slug, data).
  4. UPDATE content_entries SET current_revision_id = new_revision.id, updated_at = NOW().
COMMIT
```

#### C. Entry Publish Transaction
```text
BEGIN
  1. SELECT entry + current_revision FOR UPDATE; verify content.publish permission.
  2. Verify current_revision.slug uniqueness on published_slug for site+type+locale (nếu trùng với entry khác -> 409 Conflict).
  3. UPDATE content_entries SET published_revision_id = current_revision_id, published_slug = current_revision.slug, updated_at = NOW().
COMMIT
```

#### D. Rollback Transaction
- Tạo một Revision mới $N+1$ sao chép `title`, `slug`, `data` từ Revision mục tiêu, đặt `current_revision_id = revision_(N+1).id`. Tuyệt đối không xóa hay viết đè lịch sử.

---

### 7. Schema Evolution Strategy

- **Safe Mutations (Cho phép & tăng `schema_version`):**
  - Thêm field mới `required: false`.
  - Thêm field mới `required: true` kèm `default` value hợp lệ.
  - Sửa nhãn (`label`), `uiSchema`, thứ tự hiển thị.
- **Breaking Mutations (Từ chối nếu đã có entries tồn tại):**
  - Thêm field `required: true` mà không có giá trị `default`.
  - Xóa field đang có dữ liệu trong entries.
  - Thay đổi kiểu dữ liệu của field.
  - Đổi `key` của field.

## Consequences

- **Tích cực**:
  - Dữ liệu xuất bản công khai an toàn 100%, không bị ảnh hưởng bởi bản nháp đang chỉnh sửa.
  - Tránh lost updates qua Optimistic Concurrency Control.
  - Snapshot bất biến phục vụ audit và rollback hoàn hảo.
- **Tiêu cực / Trade-offs**:
  - Tốn thêm dung lượng lưu trữ cho bảng `content_entry_revisions` (có thể thiết lập chính sách lưu trữ / dọn dẹp ở M9).
