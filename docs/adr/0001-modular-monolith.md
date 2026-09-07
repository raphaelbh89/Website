# ADR-0001: Modular Monolith on Monorepo

- Status: Accepted
- Date: 2026-09-07

## Context

Platform có nhiều domain nhưng chưa có bằng chứng cần distributed microservices. Dự án còn phụ thuộc nhiều AI Agent nên boundary rõ nhưng repository thống nhất giúp giảm coordination cost.

## Decision

Dùng Modular Monolith trên pnpm Workspace + Turborepo, với `web`, `admin`, `api` và shared/domain packages.

## Consequences

### Positive

- deploy/debug đơn giản hơn microservices;
- transaction dễ;
- AI Agent dễ đọc cross-domain contracts;
- vẫn có module boundaries để tách service sau này.

### Trade-offs

- cần enforce boundaries để tránh “big ball of mud”;
- một deploy unit backend chính ở giai đoạn đầu.
