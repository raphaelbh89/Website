# API_CONVENTIONS.md

## Principles

- resource-oriented where practical;
- explicit domain actions when CRUD không đủ;
- validation at boundary;
- auth/permission server-side;
- consistent errors;
- pagination/filter/sort contracts stable.

## Response Shape

Chọn một convention và giữ nhất quán. Không để mỗi module tự tạo format khác nhau.

## Error Shape

Nên chứa:

- machine-readable code;
- human-readable message;
- field errors nếu validation;
- request/correlation ID;
- không leak stack trace production.

## Pagination

Định nghĩa rõ cursor hoặc offset strategy theo use case. Collection lớn ưu tiên cursor khi hợp lý.

## Filtering

Không cho client truyền arbitrary SQL/field path. Filter phải whitelist theo resource/schema.

## Versioning

Breaking change phải:

- version endpoint/contract;
- hoặc migration window có backward compatibility.

## Authorization

API phải xác định:

- actor;
- action;
- resource;
- scope/site;
- optional ownership/campus/content rule.

## Public API

Chỉ trả published content và fields public. Không serialize internal config/secrets/admin metadata tùy tiện.

## Admin API

- authenticated;
- authorized;
- audited cho operations quan trọng;
- rate limit phù hợp;
- CSRF protection nếu cookie/session architecture yêu cầu.
