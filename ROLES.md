# ROLES.md

## 1. Orchestrator / Lead Architect

**Trách nhiệm**

- giữ kiến trúc tổng thể;
- phân task theo domain;
- kiểm soát dependency/order;
- quyết định khi nào cần ADR;
- tổng hợp trạng thái.

**Không được**

- tự đánh dấu mọi phần DONE khi chưa có evidence;
- thay đổi architecture chỉ để giải quyết nhanh một task.

## 2. Business Analyst Agent

Đầu ra:

- goals;
- actors;
- use cases;
- functional requirements;
- non-functional requirements;
- acceptance criteria;
- risks/assumptions.

Artifact: `docs/PRODUCT_REQUIREMENTS.md` hoặc spec theo feature.

## 3. Information Architecture Agent

Đầu ra:

- sitemap;
- page taxonomy;
- navigation model;
- page types;
- URL structure.

## 4. UX Agent

Đầu ra:

- key user flows;
- information hierarchy;
- conversion flow;
- empty/loading/error behavior;
- accessibility considerations.

## 5. UI / Design Agent

Đầu ra:

- visual direction;
- design tokens;
- typography/spacing;
- component states;
- responsive intent;
- animation intent.

Không clone nguyên một website mẫu.

## 6. Content Architect Agent

Đầu ra:

- content types;
- fields;
- relations;
- taxonomies;
- localization requirements;
- validation.

## 7. Module Planner Agent

Đầu ra:

- module registry mapping;
- module reuse plan;
- modules cần customize;
- modules cần tạo mới;
- content source contract.

## 8. Backend Agent

Phụ trách:

- API;
- domain services;
- persistence;
- auth/RBAC;
- validation;
- audit;
- transactions;
- integrations.

## 9. Admin/CMS Agent

Phụ trách:

- CMS CRUD;
- page builder;
- dynamic forms;
- menus;
- media;
- settings;
- module configuration;
- permission-aware admin UI.

## 10. Frontend Renderer Agent

Phụ trách:

- public page renderer;
- module renderers;
- responsive behavior;
- SEO markup;
- accessibility;
- performance.

## 11. QA Agent

Phụ trách:

- unit/integration/e2e execution;
- runtime test;
- permission test;
- responsive test;
- regression;
- test evidence.

QA không sửa code trước khi ghi lại lỗi và reproduction rõ ràng, trừ khi được giao role kép có chủ đích.

## 12. Security Agent

Phụ trách:

- threat review;
- auth/session;
- authorization bypass;
- injection/XSS/CSRF;
- file upload;
- rate limiting;
- secrets;
- dependency risk.

## 13. SEO/Performance Agent

Phụ trách:

- metadata;
- structured data;
- sitemap/robots;
- canonical/hreflang;
- Core Web Vitals;
- asset optimization;
- caching.

## Ownership Rule

Mỗi task phải có:

- Primary Owner;
- Reviewer/QA nếu cần;
- Acceptance Criteria;
- Evidence location.
