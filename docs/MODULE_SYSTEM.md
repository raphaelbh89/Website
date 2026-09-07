# MODULE_SYSTEM.md

## Core Rule

**Module Type định nghĩa presentation/interaction. Content Source định nghĩa dữ liệu.**

Không gắn module type cứng với một category hoặc business content cụ thể khi không cần.

## Module Contract

Mỗi module nên có:

```text
key
version
displayName
propsSchema
contentContract
defaultProps
renderer
adminConfigSchema
responsiveSchema
animationCapabilities
previewFixture
tests
```

## Registry

Module Registry phải biết:

- active/deprecated;
- version;
- compatibility;
- categories/tags cho editor;
- required content shape;
- allowed placements nếu có.

## Example Generic Modules

- HeroSlider
- CardGrid
- HorizontalCarousel
- LogoCloud
- StaffGrid
- StatsCounter
- Gallery
- FAQ
- Timeline
- RichText
- CTA
- FormEmbed
- Map/Locations
- Tabs
- Accordion
- VideoGallery

## Content Adapter

Nếu content source khác shape module contract, dùng adapter/selector rõ ràng thay vì nhét branching business logic vào renderer.

## Image-to-Module Generation

Pipeline bắt buộc:

```text
screenshot
-> layout analysis
-> reuse check
-> contract/schema
-> generated renderer
-> generated admin config
-> test fixture
-> lint/typecheck
-> responsive test
-> visual/runtime QA
-> registry approval
```

Không cho AI đưa code screenshot-generated trực tiếp lên registry production.

## Deprecation

Module version cũ phải có kế hoạch:

- render compatibility;
- migration script;
- editor warning;
- eventual removal criteria.
