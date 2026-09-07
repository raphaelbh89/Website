# DATABASE.md

## Database

PostgreSQL 16.

## Modeling Strategy

### Relational Core

Dùng bảng/constraint rõ ràng cho:

- users;
- roles;
- permissions;
- sites;
- pages;
- menus;
- content type definitions;
- content entries metadata;
- categories/taxonomy;
- media;
- forms;
- submissions metadata;
- translations metadata;
- audit events.

### JSONB

Dùng cho dữ liệu có cấu trúc động nhưng phải có schema/version:

- module props;
- page section configuration;
- theme tokens;
- dynamic content fields;
- form payload/answers;
- integration settings đã sanitize/encrypt khi cần.

Không dùng JSONB để né thiết kế relational cho mọi thứ.

## IDs

Ưu tiên UUIDv7 cho entity mới để có tính unique phân tán và locality tốt hơn random UUIDv4.

## Soft Delete

Áp dụng khi cần restore/audit. Query mặc định loại `deleted_at IS NOT NULL`. Dùng partial unique index để uniqueness chỉ áp dụng record active khi phù hợp.

Ví dụ conceptual:

```sql
CREATE UNIQUE INDEX ... ON ... (site_id, slug)
WHERE deleted_at IS NULL;
```

## Multi-Site / Campus Ready

Core content nên cân nhắc `site_id`. Campus/location là domain entity riêng nếu nghiệp vụ cần.

Không gắn `campus_id` vào mọi bảng nếu không có scope thực tế.

## Content Type

Không dùng EAV thuần cho mọi field nếu có thể tránh. Dynamic fields cần schema definition có:

- key;
- type;
- required;
- validation;
- default;
- localization flag;
- index/search flag hợp lý.

## Transactions

Bắt buộc cho operations nhiều bước như:

- publish page + revision;
- role/permission update;
- delete with dependent relations;
- form state transitions khi có workflow.

## Indexing

Index theo query thật, không index mọi JSON key. Theo dõi slow queries và execution plan trước tối ưu sâu.

## Migration Acceptance

- up migration pass;
- clean database pass;
- seed/bootstrap pass;
- app boot pass;
- rollback strategy hoặc forward-fix documented.
