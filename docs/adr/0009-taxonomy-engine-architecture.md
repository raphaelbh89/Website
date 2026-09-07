# ADR-0009: Taxonomy Engine Architecture, Scoping, Hierarchical Subtree Semantics, and Revision-Term Association

- Status: Accepted
- Date: 2026-09-07
- Owners: Lead Architect / Backend Lead / Security Lead

## Context

Trong hệ sinh thái CMS đa website (Multi-site Platform), phân loại nội dung (Taxonomy) là một năng lực nền tảng phục vụ:
1. Phân loại cấu trúc phân cấp (Hierarchical Taxonomies) như: Danh mục tin tức (Categories), Phòng ban (Departments), Nhóm ngành đào tạo (Program Groups).
2. Phân loại phẳng (Flat Taxonomies) như: Thẻ từ khóa (Tags), Chủ đề (Topics), Nhóm tuổi (Age Groups), Địa điểm (Locations).
3. Tái sử dụng hợp đồng phân loại giữa các website thông qua Module Registry (M5) và AI Website Factory (M8) mà không hard-code cấu trúc riêng lẻ như `article.category_id`.
4. Quản lý vòng đời và phiên bản nội dung (Content Revision Lifecycle) được chốt tại ADR-0007 mà không làm rò rỉ trạng thái phân loại nháp (Zero Draft Leakage) ra website công khai.
5. Kiểm soát phân quyền phân cấp dựa trên Scoped RBAC (`docs/adr/0006-rbac-scope-strategy.md`).

## Problem & Architectural Invariants

Cần giải quyết 8 thách thức kiến trúc cốt lõi:
1. **Taxonomy Definition vs. Terms Scoping**: Cần cho phép Global Taxonomy Definition (ví dụ `category`, `tag`) để các module chuẩn hóa có thể tái sử dụng contract trên toàn hệ thống, nhưng dữ liệu terms cụ thể (ví dụ "Tuyển sinh", "Khoa CNTT") của từng trường/tổ chức phải tuyệt đối cô lập theo từng site.
2. **Namespace Collision & Bi-directional No-Shadowing**: Ngăn chặn sự mập mờ (ambiguity) khi query bằng DSL: Không cho phép Site Taxonomy trùng key với Global Taxonomy và ngược lại.
3. **Hierarchy Depth & Transaction-Safe Subtree Move**: Ngăn ngừa đệ quy vô hạn (cycles) và hiện tượng cây phân cấp quá sâu gây treo hệ thống. Khi di chuyển một nút nhánh (branch move), toàn bộ độ sâu của cây con (descendants) phải được tính toán và cập nhật nguyên tử.
4. **Draft Leakage in Revision Lifecycle**: Tránh lưu quan hệ taxonomy trực tiếp trên thực thể `content_entries` vì điều này sẽ làm thay đổi danh mục công khai ngay khi biên tập viên mới chỉ lưu một bản nháp (draft).
5. **Evolution of ContentType ↔ Taxonomy Bindings**: Việc thay đổi cấu hình ràng buộc (`required`, `min_terms`, `max_terms`) không được làm mất tính toàn vẹn của các revision lịch sử bất biến đã lưu trước đó.
6. **Machine Identity Immutability**: Định danh máy (`key`, `scope_kind`, `site_id`, `taxonomy_id`) phải bất biến, tách biệt khỏi các nhãn hiển thị có thể thay đổi (`name`, `description`).
7. **Safe Archive / Non-destructive Lifecycle**: Không hard-delete các terms đã được gắn vào các revision lịch sử để bảo toàn audit trail.
8. **Relational Index-Friendly Querying**: Không đưa quan hệ phân loại vào JSONB; đảm bảo Module Registry có thể lọc danh mục bằng index scans trên PostgreSQL.

---

## Decision

### 1. Hybrid Taxonomy Definition & Site-Bound Terms Model

Hệ thống chốt mô hình **Hybrid Global/Site Taxonomy Definition + Site-Bound Terms**:

```
                       ┌─────────────────────────────────────┐
                       │              TAXONOMY               │
                       │ (scope_kind: GLOBAL / SITE, key)    │
                       └──────────────────┬──────────────────┘
                                          │ 1:N
                                          ▼
                       ┌─────────────────────────────────────┐
                       │            TAXONOMY_TERM            │
                       │ (ALWAYS site_id NOT NULL, slug)     │
                       └──────────────────┬──────────────────┘
                                          │ N:M
                                          ▼
 ┌─────────────────────────┐   ┌───────────────────────────────┐
 │   CONTENT_TYPE_TAXONOMY │   │    CONTENT_REVISION_TERM      │
 │ (Which types use which  │   │  (Snapshot per revision:      │
 │  taxonomies & limits)   │   │   Zero draft leakage)         │
 └─────────────────────────┘   └───────────────────────────────┘
```

1. **Taxonomy Definition (`taxonomies`)**:
   - `scope_kind = 'global'`: `site_id IS NULL`. Định nghĩa dùng chung toàn hệ sinh thái (như `category`, `tag`). Phục vụ AI Factory (M8) và Module Registry (M5).
   - `scope_kind = 'site'`: `site_id IS NOT NULL`. Định nghĩa riêng biệt cho một website cụ thể (như `campus-department`).
2. **Taxonomy Terms (`taxonomy_terms`)**:
   - **`site_id` LUÔN LUÔN BẮT BUỘC (`site_id NOT NULL`)**: Bất kể Taxonomy Definition là Global hay Site-specific, các giá trị Term thực tế luôn thuộc sở hữu của một Site cụ thể.
   - Không cho phép gán chéo (cross-site): Term thuộc Site A không bao giờ có thể gắn vào Content Entry hay Revision của Site B.

---

### 2. Bi-directional No-Shadowing & Concurrency Serialization

Áp dụng quy tắc No-Shadowing hai chiều tương tự như `ContentType` trong ADR-0008:
1. **Site $\rightarrow$ Global**: Không thể tạo Site Taxonomy có `key` trùng với bất kỳ Global Taxonomy nào đã tồn tại.
2. **Global $\rightarrow$ Site**: Không thể tạo Global Taxonomy có `key` trùng với bất kỳ Site Taxonomy nào đã tồn tại trên bất kỳ site nào trong hệ thống.
3. **Concurrency Serialization**:
   - Khi tạo hoặc kiểm tra Taxonomy: Bắt buộc dùng PostgreSQL advisory transaction lock:
     ```sql
     SELECT pg_advisory_xact_lock(hashtext(LOWER('tax:' || :key)));
     ```
   - Đảm bảo 2 request tạo đồng thời (1 Global, 1 Site) được xếp hàng tuần tự; chính xác 1 request thành công (`201`), 1 request nhận xung đột (`409 Conflict`), không deadlock.

---

### 3. Machine Identity Immutability

Phân định ranh giới giữa định danh máy (machine identity) và nhãn hiển thị (presentation):

- **Bất biến tuyệt đối (`Immutable`)**:
  - `Taxonomy.key`
  - `Taxonomy.scope_kind`
  - `Taxonomy.site_id`
  - `TaxonomyTerm.key` (định danh slug máy trong taxonomy)
  - `TaxonomyTerm.taxonomy_id`
  - `TaxonomyTerm.site_id`
- **Có thể cập nhật (`Mutable`)**:
  - `Taxonomy.name`, `Taxonomy.description`, `Taxonomy.is_active`
  - `TaxonomyTerm.name`, `TaxonomyTerm.description`, `TaxonomyTerm.sort_order`, `TaxonomyTerm.parent_id`, `TaxonomyTerm.is_active`

> [!NOTE]
> `TaxonomyTerm.key` là định danh máy chuẩn hóa (lowercase alphanumeric hyphen-delimited), không phải localized slug. Khi hỗ trợ đa ngôn ngữ trong M7, nhãn hiển thị và slug đa ngôn ngữ sẽ được lưu tại bảng translation riêng biệt.

---

### 4. Term Key Uniqueness

- Ràng buộc duy nhất trên bảng `taxonomy_terms`:
  ```sql
  UNIQUE (site_id, taxonomy_id, key)
  ```
- **Lý do**:
  - Đảm bảo trong cùng một site và một taxonomy, mỗi key là duy nhất toàn cục (global within taxonomy/site).
  - Không đưa `parent_id` vào unique constraint ở M3.2. Điều này giúp URL routing và Query DSL giải quyết O(1) deterministic term lookup mà không phụ thuộc vào vị trí di chuyển trong cây phân cấp.
  - Cột `name` không cần unique (các nhánh khác nhau có thể có cùng tên hiển thị nếu người dùng mong muốn).

---

### 5. Hierarchical Taxonomy, Max Depth, & Subtree Move Semantics

1. **Hierarchy Invariants**:
   - Chỉ Taxonomy có `is_hierarchical = true` mới được phép có `parent_id IS NOT NULL`.
   - Nếu `is_hierarchical = false`: DB check constraint hoặc API từ chối mọi giá trị `parent_id IS NOT NULL`.
2. **Fixed Hierarchy Depth**:
   - Root terms: `depth = 0`.
   - Giới hạn cứng: **`maxDepth = 5`** (tối đa từ cấp 0 đến cấp 5, tương đương 6 tầng phân cấp).
3. **Transaction-Safe Subtree Move Algorithm**:
   Khi di chuyển một Term `B` sang nút cha mới `newParent` (hoặc chuyển thành root):
   - **Bước 1**: Bắt đầu Database Transaction (`BEGIN`).
   - **Bước 2**: Khóa term `B` và `newParent` (`SELECT ... FOR UPDATE`).
   - **Bước 3**: Kiểm tra toàn vẹn cùng taxonomy và cùng site:
     - `B.site_id === newParent.site_id`
     - `B.taxonomy_id === newParent.taxonomy_id`
   - **Bước 4**: Kiểm tra chống chu trình trực tiếp (Self-parent):
     - `B.id !== newParent.id` (Từ chối `CHECK (parent_id <> id)`).
   - **Bước 5**: Kiểm tra chống chu trình gián tiếp (Indirect cycle) bằng Recursive CTE:
     - Duyệt ngược từ `newParent` lên root: Nếu gặp `B.id` nằm trong danh sách tổ tiên của `newParent` $\rightarrow$ Từ chối với `400 Bad Request` ("Cannot move term inside its own descendant subtree").
   - **Bước 6**: Tính chiều cao lớn nhất của cây con bên dưới `B` (`subtreeHeight`):
     - Dùng CTE tính `max(descendant.depth) - B.depth`.
   - **Bước 7**: Xác minh giới hạn độ sâu:
     ```text
     newParentDepth = newParent ? newParent.depth : -1;
     targetDepth = newParentDepth + 1;
     if (targetDepth + subtreeHeight > 5) {
       REJECT ("Move exceeds maximum hierarchy depth of 5");
     }
     ```
   - **Bước 8**: Cập nhật nguyên tử:
     - Cập nhật `B.parent_id = newParent ? newParent.id : NULL`.
     - Cập nhật lại `depth` cho `B` và toàn bộ các descendants bên dưới bằng hiệu số chênh lệch `depthDelta = targetDepth - B.depth`:
       ```sql
       UPDATE taxonomy_terms 
       SET depth = depth + :depthDelta, updated_at = NOW() 
       WHERE id IN (SELECT id FROM descendant_ids);
       ```
   - **Bước 9**: `COMMIT` transaction. Nếu có bất kỳ lỗi nào $\rightarrow$ `ROLLBACK` toàn bộ.

---

### 6. Revision-Term Snapshot Architecture (Zero Draft Leakage)

Để đảm bảo việc chỉnh sửa bản nháp không làm rò rỉ hoặc biến đổi danh mục của bài viết đã xuất bản ngoài website công khai:
- Quan hệ phân loại được gắn trực tiếp vào **`content_entry_revisions`**, KHÔNG gắn vào `content_entries`:
  ```text
  content_revision_terms
  ├── revision_id: uuid NOT NULL REFERENCES content_entry_revisions(id) ON DELETE CASCADE
  ├── taxonomy_term_id: uuid NOT NULL REFERENCES taxonomy_terms(id) ON DELETE RESTRICT
  ├── sort_order: integer NOT NULL DEFAULT 0
  └── PRIMARY KEY (revision_id, taxonomy_term_id)
  ```
- **Độc lập tuyệt đối giữa Public và Editor**:
  - **Public Resolver**: Truy vấn `content_revision_terms` theo `entry.published_revision_id`.
  - **Admin Editor**: Truy vấn `content_revision_terms` theo `entry.current_revision_id`.
  - Khi lưu bản nháp mới (Draft): Tạo revision $N+1$ với danh sách terms mới, cập nhật `current_revision_id = N+1`. Website công khai vẫn nhìn thấy `published_revision_id` với các terms của revision cũ.
  - Khi xuất bản (Publish): Cập nhật `published_revision_id = current_revision_id`. Lúc này toàn bộ nội dung và phân loại mới cùng xuất hiện đồng thời ngoài public.

---

### 7. Atomic Revision + Terms Save Lifecycle

Khi tạo hoặc cập nhật một Revision cho Content Entry:
1. Mở transaction `BEGIN`.
2. Tạo bản ghi `content_entry_revisions` bất biến.
3. Kiểm tra tính hợp lệ của taxonomy bindings:
   - Các Taxonomy gửi lên phải được phép bởi `content_type_taxonomies` của Content Type đó.
   - Thỏa mãn các quy tắc `is_required`, `min_terms`, `max_terms` cho từng taxonomy.
4. Kiểm tra từng Term ID gửi lên:
   - Term phải tồn tại trong DB.
   - `is_active === true` (Không cho phép gán mới term đã bị inactive).
   - `term.site_id === entry.site_id` (Đúng site context).
   - `term.taxonomy_id` khớp với taxonomy hợp lệ.
5. Chèn danh sách bản ghi vào `content_revision_terms`.
6. Cập nhật con trỏ `content_entries.current_revision_id` trỏ tới revision vừa tạo.
7. `COMMIT` transaction.
8. Nếu có bất kỳ validation hoặc DB query nào thất bại: `ROLLBACK` toàn bộ. Không bao giờ để lại revision mồ côi (orphan revision) hoặc làm lệch con trỏ `current_revision_id`.

---

### 8. ContentType ↔ Taxonomy Association & Evolution Policy

Mối quan hệ giữa Content Type và Taxonomy được lưu trong bảng cấu hình tường minh:
```text
content_type_taxonomies
├── content_type_id: uuid NOT NULL REFERENCES content_types(id) ON DELETE CASCADE
├── taxonomy_id: uuid NOT NULL REFERENCES taxonomies(id) ON DELETE CASCADE
├── is_required: boolean NOT NULL DEFAULT false
├── min_terms: smallint NOT NULL DEFAULT 0
├── max_terms: smallint NULL
├── sort_order: smallint NOT NULL DEFAULT 0
└── PRIMARY KEY (content_type_id, taxonomy_id)
```

1. **Ràng buộc cấu hình (`Constraint Invariants`)**:
   - `0 <= min_terms`.
   - `max_terms IS NULL OR max_terms >= min_terms`.
   - Nếu `is_required = true`, thì `effective_min >= 1` (Nếu client đặt `min_terms = 0` thì tự động nâng lên 1, hoặc báo lỗi mâu thuẫn cấu hình).
2. **Quy tắc gán Scope (Binding Scope Policy)**:
   - **GLOBAL ContentType**: Chỉ được phép gắn với **GLOBAL Taxonomies**. Không cho phép gắn Site-specific Taxonomy vào Global Content Type để tránh rò rỉ khóa ngoại của tenant vào định nghĩa dùng chung.
   - **SITE ContentType (Site A)**: Được phép gắn với:
     - Bất kỳ GLOBAL Taxonomy nào.
     - SITE Taxonomy thuộc quyền sở hữu của chính Site A (`taxonomy.site_id === siteA.id`).
     - Tuyệt đối cấm gắn SITE Taxonomy của Site B.
3. **Tiến hóa cấu hình (Evolution Policy)**:
   - Cấu hình `content_type_taxonomies` chỉ có hiệu lực áp dụng cho các **FUTURE revisions**.
   - Việc thắt chặt luật (ví dụ giảm `max_terms` từ 5 xuống 1, hoặc bật `is_required = true`) **không làm vô hiệu hóa các revision lịch sử đã tồn tại**. Revision cũ vẫn giữ nguyên tính bất biến. Khi người dùng tạo revision mới cho entry đó, revision mới bắt buộc phải tuân thủ luật mới.
   - Khi gỡ bỏ một taxonomy binding (`DELETE FROM content_type_taxonomies`):
     - Các bản ghi `content_revision_terms` của các revision lịch sử **vẫn được giữ nguyên** (Không cascade delete lịch sử).
     - Các revision mới trong tương lai sẽ không còn được phép chọn terms của taxonomy bị gỡ này nữa.

---

### 9. Archive & Deactivation Semantics

1. **Không Hard-Delete sau khi đã sử dụng**:
   - Khóa ngoại `content_revision_terms.taxonomy_term_id` sử dụng **`ON DELETE RESTRICT`**.
   - Quản trị viên chỉ có thể vô hiệu hóa: `is_active = false`.
2. **Hành vi khi Term bị Deactivate (`is_active = false`)**:
   - **Admin Entry Editor**: Term bị ẩn khỏi danh sách lựa chọn cho các bài viết hoặc bản nháp mới.
   - **New Revision Creation**: Từ chối nếu client cố tình truyền term ID đã inactive vào payload của revision mới.
   - **Historical Revisions**: Quan hệ trong `content_revision_terms` vẫn nguyên vẹn; kiểm toán và lịch sử phiên bản vẫn đọc được định danh của term.
   - **Published Content Detail**: Website công khai khi xem chi tiết bài viết lịch sử vẫn hiển thị được nhãn của term đã gắn tại thời điểm publish.
   - **Taxonomy Navigation & Module Query**: Term inactive bị loại bỏ khỏi danh sách cây danh mục điều hướng công khai và không phải là mục tiêu filter mặc định của Module Query.
3. **Parent Deactivation Policy**:
   - Áp dụng nguyên tắc dứt khoát: **Từ chối vô hiệu hóa Term cha nếu còn tồn tại Term con đang active** (`Reject deactivation of parent while active descendants exist`).
   - Quản trị viên phải vô hiệu hóa hoặc chuyển nhánh (reparent) toàn bộ các con trước khi vô hiệu hóa term cha.
4. **Taxonomy Deactivation**:
   - Sử dụng `taxonomies.is_active = false`. Không hard-delete taxonomy nếu đã có terms hoặc content binding đang tham chiếu.

---

### 10. Taxonomy Term Metadata Is Not Revisioned (Design Trade-off)

- **Nguyên tắc**: Trong M3.2, Revision snapshot chính xác **danh sách các Term IDs** (`taxonomy_term_id`) được gắn với bản sửa đổi đó.
- Các thuộc tính metadata của Term bao gồm:
  - `name` (nhãn hiển thị)
  - `description`
  - `parent_id` (vị trí cây phân cấp)
  là dữ liệu trực tiếp của bảng `taxonomy_terms` và **không được snapshot riêng cho từng revision**.
- **Hệ quả chủ đích (Intentional Trade-off)**:
  - Nếu biên tập viên đổi tên Term từ "Tin nội bộ" thành "Tin tức hoạt động", nhãn hiển thị của các bài viết đã xuất bản trong quá khứ liên kết với Term ID đó sẽ ngay lập tức phản ánh tên mới.
  - Điều này hoàn toàn phù hợp với thực tế vận hành CMS (khi đổi tên danh mục thì toàn bộ bài viết thuộc danh mục đó được cập nhật nhãn mới đồng bộ).
  - Định danh máy `key` của Term vẫn bất biến tuyệt đối.

---

### 11. Relational Index-Friendly Query Strategy

Thiết kế phục vụ tối ưu cho Module Query DSL (M5):
```sql
SELECT e.id, e.site_id, r.title, r.slug, r.data, tt.key as term_key, tt.name as term_name
FROM content_entries e
JOIN content_entry_revisions r 
  ON r.id = e.published_revision_id
JOIN content_revision_terms crt 
  ON crt.revision_id = r.id
JOIN taxonomy_terms tt 
  ON tt.id = crt.taxonomy_term_id
WHERE e.site_id = :siteId
  AND e.content_type_id = :contentTypeId
  AND e.lifecycle_state = 'active'
  AND tt.key = :termSlug
  AND tt.is_active = true
ORDER BY r.created_at DESC
LIMIT 6;
```

- **Các chỉ mục bắt buộc (Required Indexes)**:
  - `content_revision_terms(revision_id)`
  - `content_revision_terms(taxonomy_term_id)`
  - `taxonomy_terms(site_id, taxonomy_id, key) UNIQUE`
  - `taxonomy_terms(parent_id) WHERE parent_id IS NOT NULL`
  - `taxonomy_terms(taxonomy_id, site_id) WHERE is_active = true`
- **Kế hoạch thực thi (Query Plan)**: Đảm bảo toàn bộ câu truy vấn sử dụng Index Scan / Index Only Scan trên các khóa chính và khóa ngoại quan hệ, không yêu cầu quét toàn bảng (Seq Scan) và không parse chuỗi JSONB.

---

### 12. Scoped RBAC Permissions

Tích hợp trực tiếp vào hạ tầng phân quyền Scoped Guards (ADR-0006):

| Permission | Scope Type | Rationale |
|---|---|---|
| `taxonomies.read` | `GLOBAL` / `SITE` | Cho phép xem định nghĩa taxonomy (Global hoặc của Site). |
| `taxonomies.manage` | `GLOBAL` / `SITE` | Quản lý định nghĩa taxonomy. Role Global quản lý Global Taxonomies; Role Site quản lý Site Taxonomies. |
| `taxonomy_terms.read` | `SITE` | Đọc danh sách terms trong phạm vi một site. |
| `taxonomy_terms.manage` | `SITE` | Thêm, sửa, re-parent, activate/deactivate terms của một site. |

- **Quy tắc phân quyền Term**: Terms luôn gắn với một Site cụ thể (`site_id`), do đó thao tác quản lý terms luôn yêu cầu Scope `SITE` đối với `site_id` mục tiêu. Global Admin thao tác được với terms của site thông qua cơ chế Global Grant / Scope Inheritance của ADR-0006.

---

### 13. REST API Contract

Tuân thủ nghiêm ngặt quy ước API không có tiền tố thừa (`API_CONVENTIONS.md`):

#### A. Taxonomy Definition Management
```text
GET    /taxonomies
       Query: ?scopeKind=global|site&siteId=:siteId
       Response: 200 OK [Taxonomy]

POST   /taxonomies
       Body: { key, name, description?, scopeKind, siteId?, isHierarchical }
       Response: 201 Created { taxonomy } | 409 Conflict

GET    /taxonomies/:id
       Response: 200 OK { taxonomy } | 404 Not Found

PATCH  /taxonomies/:id
       Body: { name?, description?, isActive? }
       Response: 200 OK { taxonomy } (key, scopeKind, siteId are immutable)
```

#### B. Taxonomy Terms Management
```text
GET    /sites/:siteId/taxonomies/:taxKey/terms
       Query: ?tree=true|false&activeOnly=true|false
       Response: 200 OK [TermTree | TermFlat]

POST   /sites/:siteId/taxonomies/:taxKey/terms
       Body: { key, name, description?, parentId?, sortOrder? }
       Response: 201 Created { term } | 409 Conflict | 400 Bad Request

PATCH  /sites/:siteId/taxonomies/:taxKey/terms/:termId
       Body: { name?, description?, parentId?, sortOrder? }
       Response: 200 OK { term } (Triggers transaction-safe subtree move if parentId changed)

POST   /sites/:siteId/taxonomies/:taxKey/terms/:termId/deactivate
       Response: 200 OK { term } | 400 Bad Request (if active children exist)

POST   /sites/:siteId/taxonomies/:taxKey/terms/:termId/activate
       Response: 200 OK { term }
```

#### C. ContentType ↔ Taxonomy Bindings
```text
GET    /content-types/:contentTypeId/taxonomies
       Response: 200 OK [ContentTypeTaxonomyBinding]

PUT    /content-types/:contentTypeId/taxonomies
       Body: {
         taxonomies: [
           { taxonomyId, isRequired, minTerms, maxTerms, sortOrder }
         ]
       }
       Response: 200 OK [ContentTypeTaxonomyBinding] | 400 Bad Request
```

---

## M3.1 Publish API Consistency Verification Result

- **Kiểm tra hiện trạng**: Phương thức `publishContentEntry(siteId, typeKey, entryId)` trong [content.service.ts](file:///e:/WebstiteCMS/apps/api/src/content.service.ts) và route `POST /sites/:siteId/content/:typeKey/:entryId/publish` trong [app.ts](file:///e:/WebstiteCMS/apps/api/src/app.ts) **hoàn toàn KHÔNG cho phép client truyền `revisionId` tùy ý**.
- **Cơ chế thực tế**: Endpoint chỉ nhận `entryId` trên URL và thực hiện publish chính xác `entry.current_revision_id`:
  ```sql
  UPDATE content_entries 
  SET published_revision_id = current_revision_id, published_slug = $1, updated_at = NOW() 
  WHERE id = $2
  ```
- **Kết luận**: Hợp đồng M3.1 đã chuẩn chỉnh 100%, bảo vệ tuyệt đối chống việc client tự ý publish revision bất kỳ hoặc revision của entry khác. Quy trình khôi phục bản cũ (Rollback/Restore) sau này sẽ tạo Revision mới $N+1$, trỏ `current_revision_id = N+1` rồi mới gọi lệnh publish.

---

## Proposed Database Tables for M3.2

```sql
-- 1. Taxonomy Definitions
CREATE TABLE taxonomies (
  id uuid PRIMARY KEY,
  key varchar(64) NOT NULL,
  name varchar(128) NOT NULL,
  description text,
  scope_kind varchar(16) NOT NULL, -- 'global' | 'site'
  site_id uuid REFERENCES sites(id) ON DELETE CASCADE,
  is_hierarchical boolean NOT NULL DEFAULT false,
  is_system boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Taxonomy Terms (Always Site-bound)
CREATE TABLE taxonomy_terms (
  id uuid PRIMARY KEY,
  taxonomy_id uuid NOT NULL REFERENCES taxonomies(id) ON DELETE RESTRICT,
  site_id uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES taxonomy_terms(id) ON DELETE RESTRICT,
  depth smallint NOT NULL DEFAULT 0,
  key varchar(128) NOT NULL,
  name varchar(255) NOT NULL,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_term_no_self_parent CHECK (parent_id <> id),
  CONSTRAINT chk_term_depth_cap CHECK (depth >= 0 AND depth <= 5)
);

-- 3. Content Type Taxonomy Bindings
CREATE TABLE content_type_taxonomies (
  content_type_id uuid NOT NULL REFERENCES content_types(id) ON DELETE CASCADE,
  taxonomy_id uuid NOT NULL REFERENCES taxonomies(id) ON DELETE CASCADE,
  is_required boolean NOT NULL DEFAULT false,
  min_terms smallint NOT NULL DEFAULT 0,
  max_terms smallint,
  sort_order smallint NOT NULL DEFAULT 0,
  PRIMARY KEY (content_type_id, taxonomy_id),
  CONSTRAINT chk_ct_tax_terms_range CHECK (
    min_terms >= 0 AND (max_terms IS NULL OR max_terms >= min_terms)
  )
);

-- 4. Content Revision Terms (Revision-Pointer Snapshots)
CREATE TABLE content_revision_terms (
  revision_id uuid NOT NULL REFERENCES content_entry_revisions(id) ON DELETE CASCADE,
  taxonomy_term_id uuid NOT NULL REFERENCES taxonomy_terms(id) ON DELETE RESTRICT,
  sort_order integer NOT NULL DEFAULT 0,
  PRIMARY KEY (revision_id, taxonomy_term_id)
);
```

---

## Consequences

### Positive
- Tách bạch hoàn toàn giữa định nghĩa dùng chung (`GLOBAL`) và dữ liệu thực thể của từng trường/tổ chức (`SITE`), hỗ trợ hoàn hảo cho AI Website Factory (M8).
- Không bao giờ bị rò rỉ phân loại nháp ra ngoài website công khai (Zero Draft Leakage) nhờ liên kết snapshot ở cấp `content_entry_revisions`.
- Cây phân cấp được bảo vệ an toàn tuyệt đối với thuật toán di chuyển nhánh nguyên tử, chặn chu trình đệ quy và khóa cứng độ sâu `maxDepth = 5`.
- Hiệu năng truy vấn của Module Registry đạt mức tối ưu nhờ các quan hệ relational thuần túy có chỉ mục, không phụ thuộc vào JSONB.

### Negative / Trade-offs
- Việc đổi tên `TaxonomyTerm.name` sẽ phản ánh trực tiếp lên các bài viết lịch sử đã publish mà không tạo revision mới (đã được chấp nhận có chủ đích).
- Thao tác di chuyển nhánh cây phân cấp (Subtree move) yêu cầu thuật toán kiểm tra CTE và khóa transaction kỹ lưỡng hơn so với danh mục phẳng.
