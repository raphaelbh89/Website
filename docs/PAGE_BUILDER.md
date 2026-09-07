# PAGE_BUILDER.md

## Goal

Tạo trang public từ dữ liệu cấu hình. Frontend là renderer.

## Conceptual Hierarchy

```text
Content Type
-> Content Source / Collection
-> Module
-> Section
-> Page
-> Template
-> Theme
```

## Page

Fields tối thiểu:

- id;
- site;
- locale/translation relation;
- title;
- slug/path;
- status;
- template;
- SEO overrides;
- sections;
- revision/version.

## Section

Section không nên chứa component code. Nó tham chiếu:

- module type/version;
- content source;
- module props;
- layout/container;
- responsive rules;
- animation;
- visibility;
- scheduling nếu có.

## Editor Capabilities

- add/remove/reorder;
- duplicate;
- hide;
- configure;
- preview;
- desktop/tablet/mobile preview;
- draft/publish;
- validation before publish.

## Guardrails

Không cho mọi CSS raw injection mặc định. Dùng token/config whitelisted để giữ consistency và security.

## Preview

Preview phải render cùng engine với production càng nhiều càng tốt để tránh “admin preview đúng nhưng public sai”.

## Versioning

Cấu hình module cần version. Khi renderer schema thay đổi, phải có migration/adaptor hoặc backward compatible parser.

## Acceptance Tests

- create page;
- add 3 module types;
- reorder;
- change content source;
- publish;
- public render đúng;
- refresh đúng;
- invalid module config không publish;
- deleted source có fallback/error state có kiểm soát.
