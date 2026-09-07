# PRODUCT_REQUIREMENTS.md

## Product

AI-Driven Modular Website Platform.

## Problem

Website doanh nghiệp/trường học/tổ chức thường bị xây theo từng source riêng, hard-code homepage và module, dẫn đến khó đổi giao diện, khó tái sử dụng và khó cho AI Agent tiếp tục công việc dài hạn.

## Product Goals

1. Một platform core dùng lại cho nhiều website.
2. Admin kiểm soát content, pages, menu, modules, theme, forms, settings.
3. Public site data-driven, không hard-code cấu trúc business page.
4. Module presentation generic, gắn được nhiều content source.
5. Tạo Content Type động có schema/validation.
6. Responsive và dễ thay visual/animation.
7. SEO, security, localization ngay trong kiến trúc.
8. Multi-Agent có thể thay phiên nhau mà không mất state.
9. AI có thể phân tích intake và tự đề xuất sitemap/design/content/module plan.
10. Mọi feature phải được test runtime trước khi DONE.

## Primary Actors

- Super Admin.
- Site Admin.
- Content Editor.
- Reviewer/Publisher.
- Form/Admissions Operator.
- Chat Operator.
- Public Visitor.
- AI Agent.

## Functional Areas

### Identity & Access

- accounts;
- roles;
- permissions;
- session management;
- audit.

### CMS

- dynamic content types;
- entries;
- categories/taxonomy;
- media;
- scheduling/publishing.

### Page Builder

- pages;
- sections;
- module type;
- content source;
- style/responsive/animation config;
- preview/publish.

### Modules

Ví dụ:

- hero/slideshow;
- article grid/carousel;
- course/program;
- partner/logo slider;
- staff/team;
- admission/registration;
- achievement/statistics;
- gallery/video;
- FAQ;
- testimonial;
- CTA;
- contact/map;
- rich text;
- tabs/accordion/timeline.

### Forms

- dynamic fields;
- validation;
- submissions;
- export;
- notification/webhook;
- spam protection.

### Navigation

- nested menu;
- mega menu;
- internal/external/content links;
- locale awareness.

### Settings

- name;
- logo/favicons;
- contact information;
- addresses;
- social links;
- theme/branding;
- analytics/integration config.

### Chat

- AI;
- human operator;
- hybrid handoff;
- provider adapter.

### Localization

- locale;
- translation status;
- localized slug;
- menu/SEO translation;
- fallback.

## Non-Functional Requirements

- secure;
- responsive;
- accessible;
- SEO-capable;
- maintainable;
- testable;
- observable;
- deployable from clean environment;
- no critical runtime dependency on a single AI vendor.

## Product Acceptance Scenario

Một Admin tạo website mới từ intake, AI đề xuất cấu trúc, hệ thống dùng modules/page builder để dựng trang, Admin có thể đổi logo/màu/menu/section/content/layout mà không sửa frontend source, và website vẫn pass security/SEO/responsive/runtime tests.
