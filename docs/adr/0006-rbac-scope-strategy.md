# ADR-0006: Scoped Role-Based Access Control (RBAC) Strategy

- Status: Accepted
- Date: 2026-09-07
- Owners: Lead Architect / Backend Lead / Security Lead

## Context

Platform được thiết kế để phục vụ nhiều tổ chức, thương hiệu và cơ sở (multi-site, multi-campus) trong tương lai. Các trường hợp nghiệp vụ bao gồm:
1. Super Admin: Toàn quyền quản trị nền tảng, tạo website mới, cấu hình hệ thống toàn cục.
2. Site Administrator: Quản trị một website cụ thể (ví dụ site trường đại học A hoặc thương hiệu X), quản lý nội dung và trang thuộc site đó, không can thiệp vào site của trường B.
3. Campus/Department Operator: Quản trị nội dung thuộc một cơ sở / chi nhánh cụ thể của một site.
4. Content Editor: Tạo và chỉnh sửa nội dung bài viết, không có quyền xuất bản hoặc cấu hình hệ thống.
5. Viewer / Auditor: Chỉ đọc nội dung hoặc xem audit logs.

Nếu chỉ thiết kế đơn giản kiểu `users.role = 'admin'` hay `users.is_admin = true`, hệ thống sẽ lập tức bị khóa cứng (hard-coded), không thể mở rộng cho mô hình multi-tenant/multi-site mà không phải viết lại toàn bộ authorization layer.

## Problem

Cần một mô hình phân quyền (Authorization model) đáp ứng:
1. **Phân tách rõ ràng giữa Role và Permission**: Business logic không được kiểm tra theo tên Role (`if (role === 'admin')`) mà phải kiểm tra theo Permission cụ thể (`requirePermission('content.publish', scope)`).
2. **Hỗ trợ phạm vi phân quyền (Scoped Authorization)**: Cho phép một người dùng có quyền ở mức toàn hệ sinh thái (`GLOBAL`), hoặc chỉ có quyền trên một website cụ thể (`SITE`), hoặc một cơ sở (`CAMPUS`), hoặc một tài nguyên cụ thể (`RESOURCE`).
3. **Tránh over-engineering**: Thiết kế kiến trúc đầy đủ cho tương lai nhưng triển khai theo vertical slices thực tế, ưu tiên các scope cần thiết nhất ngay trong M2.
4. **Deny by default**: Mọi hành vi chưa được cấp phép tường minh đều bị từ chối.

## Constraints

- Database: PostgreSQL 16 quan hệ với UUIDv7 và khóa ngoại toàn vẹn.
- R-005: Authorization phải diễn ra ở backend/API layer. UI ẩn nút chỉ là hỗ trợ UX, không phải bảo mật.
- R-016: Không phá vỡ contract âm thầm. Permission naming convention phải nhất quán.

## Considered Alternatives

### Alternative A: Role gắn cứng trong cột `users.role` (Ví dụ enum: 'admin', 'editor', 'user')
- **Ưu điểm**: Triển khai rất nhanh.
- **Nhược điểm**: Hoàn toàn bất khả thi đối với kiến trúc multi-site. Một user làm Admin ở Site 1 nhưng chỉ là Editor ở Site 2 sẽ không thể biểu diễn được. Vi phạm nghiêm trọng kiến trúc đã chốt trong `MASTER_PROMPT.md` và `PROJECT_STATE.md`.

### Alternative B: Phân quyền động ABAC (Attribute-Based Access Control) phức tạp
- **Ưu điểm**: Cực kỳ linh hoạt, cho phép định nghĩa rule dạng JSON DSL (ví dụ: user được sửa bài nếu `article.author_id == user.id AND time < 17:00`).
- **Nhược điểm**: Phức tạp hóa quá mức ở giai đoạn M2, khó index trong DB, query chậm, khó kiểm chứng tính toàn vẹn và vượt quá nhu cầu hiện tại của CMS.

### Alternative C: Scoped RBAC đa cấp độ (Lựa chọn)
- **Ưu điểm**:
  - Tách bạch: `User` -> `RoleAssignment (Role, Scope)` -> `Role` -> `RolePermission` -> `Permission`.
  - Phù hợp hoàn hảo với kiến trúc multi-site và multi-campus.
  - Query quan hệ rõ ràng, index B-Tree hiệu quả cao, audit minh bạch.

## Decision

**CHỌN: Alternative C — Scoped Role-Based Access Control (Scoped RBAC).**

Chi tiết quyết định:

### 1. Phân cấp Scope (Scope Hierarchy) & Kế thừa
Hệ thống định nghĩa 4 cấp độ phạm vi:
1. `GLOBAL`: Phạm vi toàn bộ platform (hệ sinh thái).
2. `SITE`: Phạm vi một website cụ thể (gắn với `site_id`).
3. `CAMPUS`: Phạm vi một cơ sở / chi nhánh cụ thể (gắn với `site_id` + `campus_id`).
4. `RESOURCE`: Phạm vi một đối tượng dữ liệu cụ thể (ví dụ một Content Entry hoặc Category cụ thể).

**Quy tắc triển khai theo Milestone**:
- **Milestone M2 triển khai ngay**: Scope `GLOBAL` và `SITE`.
- **Milestone tương lai (M3-M5) kích hoạt**: Scope `CAMPUS` và `RESOURCE` khi các domain thực thể tương ứng được tạo. Schema database của M2 được thiết kế sẵn sàng để tương thích ngược.

**Quy tắc kế thừa (Hierarchy Inheritance)**:
- Một quyền được cấp ở phạm vi `GLOBAL` **tự động có hiệu lực trên tất cả các `SITE` và `CAMPUS`**. (Ví dụ: Super Admin có quyền `content.publish` ở cấp `GLOBAL` thì có quyền xuất bản trên mọi site).
- Một quyền được cấp ở phạm vi `SITE` (ví dụ Site A) **chỉ có hiệu lực trong phạm vi Site A và các Campus thuộc Site A**, hoàn toàn bị cô lập khỏi Site B.
- Quyền cấp ở `CAMPUS` chỉ có hiệu lực trong cơ sở đó.

### 2. Quy tắc Precedence: Allow-list & Deny-by-default
- Hệ thống áp dụng **Allow-list tường minh**: User chỉ có các quyền được gán thông qua các Role Assignments. Nếu không tìm thấy grant phù hợp, hành động bị từ chối mặc định (`deny-by-default`).
- Không sử dụng cơ chế "Explicit Deny" phức tạp ở giai đoạn này để tránh xung đột ma trận quyền không cần thiết.

### 3. Super Admin Representation
- **Không hard-code `is_super_admin` hay email cụ thể trong code**.
- Super Admin được đại diện bằng một Role hệ thống chuẩn: `system_super_admin`, chứa toàn bộ các quyền của hệ thống (hoặc wildcard grant `*`), được gán cho user với scope `{ kind: 'global' }`.
- Nghiệp vụ bảo vệ: Không cho phép sửa đổi hoặc xóa Role `system_super_admin` mặc định.

### 4. Permission Naming Convention
Đặt tên theo format phân cấp chuẩn: `<resource>.<action>`:
- Quản lý người dùng:
  - `users.read`: Xem danh sách và chi tiết user.
  - `users.create`: Tạo user mới.
  - `users.update`: Cập nhật thông tin user.
  - `users.deactivate`: Khóa / vô hiệu hóa tài khoản user.
- Quản lý phân quyền:
  - `roles.read`: Xem danh sách roles và permissions.
  - `roles.manage`: Tạo, sửa role và gán quyền cho role.
  - `roles.assign`: Gán role cho user theo scope.
- Quản lý Site & Settings:
  - `sites.read`: Xem danh sách và thông tin site.
  - `sites.manage`: Tạo mới và cấu hình site.
  - `settings.manage`: Cập nhật cài đặt site.
- Quản lý Nội dung (CMS Core - sẵn sàng cho M3):
  - `content.read`: Xem nội dung bài viết/dữ liệu.
  - `content.create`: Soạn thảo nội dung mới.
  - `content.update`: Chỉnh sửa nội dung hiện có.
  - `content.publish`: Xuất bản bài viết lên website public.
  - `content.delete`: Xóa nội dung.

### 5. Mô hình Dữ liệu (Entity Relationship)

```text
[ users ] 1 ──< [ user_role_assignments ] >── 1 [ roles ]
                         │                            │
                         │ (scope_kind,               │ 1
                         │  scope_id)                 │
                         │                            └──< [ role_permissions ] >── 1 [ permissions ]
```

1. **`users`**:
   - `id` (UUIDv7, PK)
   - `email` (text, unique, lowercase)
   - `password_hash` (text, argon2id)
   - `name` (text)
   - `is_active` (boolean, default true)
   - `created_at`, `updated_at` (timestamptz)

2. **`roles`**:
   - `id` (UUIDv7, PK)
   - `key` (text, unique - ví dụ: `super_admin`, `site_admin`, `editor`)
   - `name` (text - ví dụ: "Super Administrator", "Site Admin")
   - `description` (text, nullable)
   - `is_system` (boolean, default false - nếu true thì không cho xóa)
   - `created_at`, `updated_at` (timestamptz)

3. **`permissions`**:
   - `id` (UUIDv7, PK)
   - `key` (text, unique - ví dụ: `users.read`, `content.publish`)
   - `name` (text)
   - `module` (text - ví dụ: `users`, `roles`, `sites`, `content`)
   - `description` (text, nullable)
   - `created_at` (timestamptz)

4. **`role_permissions`**:
   - `role_id` (UUIDv7, FK -> roles.id, ON DELETE CASCADE)
   - `permission_id` (UUIDv7, FK -> permissions.id, ON DELETE CASCADE)
   - Primary Key: `(role_id, permission_id)`

5. **`user_role_assignments`**:
   - `id` (UUIDv7, PK)
   - `user_id` (UUIDv7, FK -> users.id, ON DELETE CASCADE)
   - `role_id` (UUIDv7, FK -> roles.id, ON DELETE CASCADE)
   - `scope_kind` (text, not null - enum: `'global'`, `'site'`, `'campus'`, `'resource'`)
   - `scope_id` (text, nullable - ví dụ UUID của site hoặc campus; NULL khi scope_kind là 'global')
   - `created_at` (timestamptz)
   - Unique constraint: `(user_id, role_id, scope_kind, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'))` để ngăn ngừa gán trùng lặp.

### 6. Logic Đánh giá Quyền (Permission Evaluation Engine)

Tại package `@platform/auth`:
```typescript
export type Scope = 
  | { kind: 'global' }
  | { kind: 'site'; siteId: string }
  | { kind: 'campus'; siteId: string; campusId: string };

export type EffectiveGrant = {
  permission: string;
  scopeKind: 'global' | 'site' | 'campus' | 'resource';
  scopeId: string | null;
};

export function hasPermission(
  grants: readonly EffectiveGrant[],
  requiredPermission: string,
  targetScope: Scope = { kind: 'global' }
): boolean {
  return grants.some(grant => {
    // 1. Kiểm tra permission match (hỗ trợ wildcard '*')
    const permMatch = grant.permission === '*' || grant.permission === requiredPermission;
    if (!permMatch) return false;

    // 2. Global grant thỏa mãn mọi scope yêu cầu
    if (grant.scopeKind === 'global') return true;

    // 3. Nếu yêu cầu là site scope: grant site tương ứng match
    if (targetScope.kind === 'site' && grant.scopeKind === 'site' && grant.scopeId === targetScope.siteId) {
      return true;
    }

    // 4. Nếu yêu cầu là campus scope: grant site chứa campus đó hoặc grant chính xác campus đó
    if (targetScope.kind === 'campus') {
      if (grant.scopeKind === 'site' && grant.scopeId === targetScope.siteId) return true;
      if (grant.scopeKind === 'campus' && grant.scopeId === targetScope.campusId) return true;
    }

    return false;
  });
}
```

### 7. Server-Side Guard trong Fastify API

Tạo decorator hoặc preHandler hook:
```typescript
// Fastify Route Definition Example
app.get('/api/admin/users', {
  preHandler: [
    requireAuth(),
    requirePermission('users.read', (req) => ({ kind: 'global' }))
  ]
}, handler);

app.post('/api/admin/sites/:siteId/articles', {
  preHandler: [
    requireAuth(),
    requirePermission('content.create', (req) => ({ kind: 'site', siteId: req.params.siteId }))
  ]
}, handler);
```
Nếu không đạt:
- Chưa authenticate: HTTP 401 Unauthorized.
- Đã authenticate nhưng thiếu quyền: HTTP 403 Forbidden (`{ error: 'FORBIDDEN', message: 'Missing required permission' }`).

## Security Implications

- Ngăn chặn hoàn toàn lỗi IDOR và Privilege Escalation giữa các site khác nhau.
- Backend là ranh giới phòng thủ duy nhất và tuyệt đối; UI frontend chỉ đóng vai trò hiển thị thân thiện (conditional rendering).
- Loại trừ hoàn toàn hard-code roles trong mã nguồn.

## Data Model Impact

- Bổ sung 5 bảng mới: `users`, `roles`, `permissions`, `role_permissions`, `user_role_assignments` vào `@platform/database`.
- Khởi tạo migration sạch và seed hệ thống gồm các quyền cơ bản và role `super_admin` ban đầu.

## API Impact

- Cung cấp API endpoints tra cứu quyền của người dùng tại `GET /auth/me`.
- Cung cấp API quản trị phân quyền (M2.4):
  - `GET /admin/users`
  - `POST /admin/users`
  - `GET /admin/roles`
  - `POST /admin/roles/:roleId/permissions`
  - `POST /admin/users/:userId/roles`

## Operational Impact

- Bảng `user_role_assignments` được join với `role_permissions` và `permissions` khi nạp session hoặc tra cứu profile.
- Truy vấn được index đầy đủ trên `(user_id)` và `(role_id, permission_id)`. Số lượng grants của một user thường < 100 dòng, thời gian query < 2ms.

## Alternatives Rejected

- Hard-code role string: Bị bác bỏ vì chặn đứng khả năng multi-site.
- Complex ABAC engine: Bị bác bỏ vì over-engineering cho giai đoạn hiện tại.

## Consequences

### Positive
- Hỗ trợ hoàn hảo mô hình đa site, đa thương hiệu.
- Đạt chuẩn Clean Architecture và Separation of Concerns.
- Dễ dàng mở rộng cho Scope Campus hoặc Resource ở các milestone sau mà không phá vỡ API/Database schema.

### Negative / Trade-offs
- Cần migration database với các bảng quan hệ nhiều-nhiều.
- Cần viết seed rõ ràng cho các permissions mặc định của hệ thống.

## Risks

- Nếu người dùng được gán quá nhiều role phức tạp dẫn đến ma trận quyền lớn, có thể gây nhầm lẫn khi quản trị. Giảm thiểu: Xây dựng giao diện Admin Role Assignment trực quan và có bảng xem trước (Effective Permissions Matrix) trong tương lai.

## Migration / Future Evolution

- Khi mở rộng domain Campus ở giai đoạn trường học/chuỗi chi nhánh: Bổ sung bảng `campuses` (FK `site_id`), engine phân quyền sẵn sàng xử lý scope `{ kind: 'campus', siteId, campusId }`.

## Acceptance Criteria

1. User không có permission phù hợp bị từ chối với HTTP 403.
2. User có grant `global` được phép thực hiện hành động trên bất kỳ site nào.
3. User có grant `site: siteA` bị từ chối truy cập trên `siteB`.
4. Role và Permission được lưu trong DB quan hệ với khóa ngoại toàn vẹn và cascade an toàn.
5. Không có business logic nào kiểm tra trực tiếp theo tên role string ngoài engine phân quyền.
