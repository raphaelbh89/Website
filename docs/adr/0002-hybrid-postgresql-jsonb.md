# ADR-0002: PostgreSQL Relational Core + JSONB Dynamic Configuration

- Status: Accepted
- Date: 2026-09-07

## Context

CMS/Page Builder cần flexibility, nhưng dùng JSON cho toàn bộ dữ liệu sẽ làm mất relational integrity và queryability.

## Decision

Dùng PostgreSQL 16. Core domain relational; JSONB chỉ cho dynamic/config payload có schema/version. UUIDv7 cho entity mới; soft delete + partial indexes khi hợp lý.

## Consequences

- cân bằng integrity và flexibility;
- cần schema validation cho JSONB;
- dynamic fields/search cần design index có chọn lọc.
