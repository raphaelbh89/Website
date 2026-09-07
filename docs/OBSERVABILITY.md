# OBSERVABILITY.md

## Goal

Production phải trả lời được: lỗi gì, ở request nào, user/action nào, subsystem nào.

## Logging

Structured logs nên có:

- timestamp;
- level;
- service/app;
- request/correlation ID;
- actor ID khi an toàn;
- route/action;
- error code.

Không log password/token/private secrets.

## Health

Tối thiểu:

- `/health/live`
- `/health/ready`

Readiness kiểm tra dependency quan trọng phù hợp, không thực hiện query nặng.

## Metrics

Theo dõi:

- request latency/error rate;
- DB pool/query latency;
- cache hit;
- form/chat abuse rate;
- publish failures;
- media processing failures.

## Audit vs App Log

Audit log là business/security record, không thay thế bằng application log và ngược lại.

## Error Tracking

Production nên tích hợp error tracking/APM provider qua adapter/config, không khóa domain logic vào một vendor.
