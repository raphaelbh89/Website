# ARCHITECTURE.md

## Architectural Style

**Modular Monolith in a Monorepo**.

Lý do:

- domain lớn nhưng chưa cần distributed-system complexity;
- transaction và consistency đơn giản hơn;
- AI Agent dễ theo dõi boundaries;
- có thể tách service sau khi có evidence về scaling/ownership.

## Logical Layers

```text
Public Web / Admin UI
        |
      API
        |
Application Services
        |
Domain Modules
        |
Repositories / Infrastructure
        |
PostgreSQL / Cache / Object Storage / Providers
```

## App Boundaries

### `apps/web`

- public rendering;
- SSR/SSG strategy tùy stack;
- page/module renderer;
- SEO output;
- public forms/chat UI.

### `apps/admin`

- CMS;
- page builder;
- theme/module config;
- users/roles;
- forms/submissions;
- menus/settings.

### `apps/api`

- authentication;
- authorization;
- domain logic;
- persistence;
- APIs;
- audit;
- integrations.

## Package Boundaries

Shared package không được trở thành dumping ground. Domain package chỉ expose public contract cần thiết.

## Data Flow: Public Page

```text
Request URL
-> Resolve site/locale/page
-> Fetch published page composition
-> Resolve module contracts/content sources
-> Fetch content
-> Render modules
-> SEO metadata/structured data
-> Cache response where valid
```

## Data Flow: Admin Publishing

```text
Admin edit
-> validate config/schema
-> authorization
-> save draft/version
-> preview
-> publish
-> invalidate relevant cache
-> audit event
```

## Publish Model

Nên hỗ trợ tối thiểu:

- draft;
- published;
- optional scheduled publish;
- version/revision strategy ở page/config quan trọng.

## Cross-Cutting Concerns

- auth/RBAC;
- validation;
- audit;
- i18n;
- SEO;
- logging;
- rate limiting;
- caching;
- file security.

## Scaling Strategy

Chỉ tách microservice khi có ít nhất một lý do rõ:

- independent scaling;
- independent deploy cadence;
- data/transaction isolation;
- team ownership;
- high-load subsystem như media processing/search/chat.

Không tách service vì “microservice hiện đại hơn”.
