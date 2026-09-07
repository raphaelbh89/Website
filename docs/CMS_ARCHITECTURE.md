# CMS_ARCHITECTURE.md

## CMS Goal

Admin phải quản trị dữ liệu mà frontend public sử dụng, không chỉ là dashboard phụ.

## Core CMS Domains

- Content Type Definition.
- Content Entry.
- Taxonomy/Category.
- Media.
- Publishing.
- Translation.
- Revision/Audit.

## Schema-Driven Content Type

Ví dụ Admin tạo `Staff` với fields:

```text
name: text required localized
avatar: media required
position: text localized
bio: richtext localized
order: number
```

Hệ thống tự tạo:

- admin form;
- validation;
- CRUD contract;
- storage mapping;
- filtering/sorting theo field được phép.

## Field Types Baseline

- text;
- textarea;
- rich text;
- number;
- boolean;
- date/datetime;
- select/multiselect;
- media;
- relation;
- repeater/group;
- URL;
- email/phone;
- location khi cần.

## Publishing

Entry nên có state rõ ràng thay vì boolean mơ hồ.

Ví dụ:

```text
DRAFT -> REVIEW -> PUBLISHED -> ARCHIVED
```

Workflow có thể đơn giản hóa ở MVP nhưng contract nên không khóa đường phát triển.

## Content Source

Module nhận `contentSource` có thể là:

- manual selection;
- taxonomy query;
- latest/pinned;
- relation;
- static config nhỏ;
- external adapter nếu được cho phép.

Query config phải validated, không cho arbitrary query execution.
