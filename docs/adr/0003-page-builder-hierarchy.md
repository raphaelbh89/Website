# ADR-0003: Data-Driven Page Builder Hierarchy

- Status: Accepted
- Date: 2026-09-07

## Decision

Adopt conceptual hierarchy:

```text
Content Type -> Content Source -> Module -> Section -> Page -> Template -> Theme
```

Public frontend render từ published configuration thay vì hard-code homepage/page composition theo từng site.

## Consequences

- cho phép đổi trang từ Admin;
- module reusable;
- config contracts phải versioned và validated;
- preview/publish workflow trở thành critical infrastructure.
