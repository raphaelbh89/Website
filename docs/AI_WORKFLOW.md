# AI_WORKFLOW.md

## AI Website Factory

AI không được “nhảy thẳng vào code” từ một mô tả ngắn.

## Intake Schema

Tối thiểu thu thập:

- site/business name;
- industry;
- audience;
- business goals;
- desired actions/conversions;
- logo;
- brand colors;
- visual references;
- required functionality;
- content availability;
- languages;
- locations/campuses nếu có;
- integrations;
- compliance constraints.

## Agent Pipeline

### 1. Business Analyst

Output:

- goals;
- personas/actors;
- feature requirements;
- content needs;
- risk/assumptions.

### 2. Information Architect

Output:

- sitemap;
- page types;
- navigation;
- URL model.

### 3. UX Agent

Output:

- user journeys;
- conversion paths;
- information hierarchy.

### 4. Design Agent

Output:

- Design DNA;
- theme tokens;
- section patterns;
- responsive/motion intent.

### 5. Content Architect

Output:

- content types;
- fields;
- relations;
- taxonomies;
- localization.

### 6. Module Planner

Output:

- reuse existing modules;
- configure variants;
- create new modules only where necessary.

### 7. Implementation Agents

Backend/Admin/Frontend work theo vertical slices và contract đã chốt.

### 8. QA Agent

Độc lập xác minh runtime.

### 9. Security + SEO Agents

Review theo risk/scope trước release.

## Agent Output Contract

Mỗi Agent phải viết artifact ra file, không chỉ trả trong chat.

## Token/Context Recovery

Khi Agent sắp hết context:

- cập nhật `HANDOFF.md`;
- cập nhật `PROGRESS.md`;
- ghi files changed;
- ghi command/test;
- ghi exact next step;
- không để kiến thức quan trọng chỉ nằm trong chat.

## Site Generation Principle

AI phải ưu tiên **configure/reuse framework** hơn là generate bespoke code.

Thứ tự ưu tiên:

1. Existing module + config.
2. Existing module variant.
3. Composite section.
4. New generic module.
5. Bespoke code chỉ khi business requirement thật sự đặc thù.
