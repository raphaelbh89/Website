# THEME_ENGINE.md

## Goal

Cho phép thay đổi visual identity sâu mà không sửa toàn bộ component code.

## Design Tokens

Tối thiểu:

- colors;
- typography;
- spacing;
- radii;
- shadows;
- containers;
- breakpoints;
- buttons;
- cards;
- transitions;
- motion duration/easing.

## Theme Levels

Có thể hỗ trợ:

```text
Platform Defaults
-> Theme
-> Site Overrides
-> Page Overrides (limited)
-> Module Overrides (guarded)
```

## Avoid Raw CSS Everywhere

Admin không nên có ô nhập CSS tùy ý làm cơ chế chính. Ưu tiên token controls, enum và safe value constraints.

## Responsive Tokens

Module có thể override layout theo breakpoint qua schema an toàn.

## Animation

Animation config nên declarative:

- type;
- duration;
- delay;
- easing;
- trigger;
- reduced-motion behavior.

Không chạy animation nặng làm hỏng Core Web Vitals hoặc accessibility.

## AI Visual Direction

Design Agent tạo Design DNA bao gồm:

- mood;
- visual motifs;
- section rhythm;
- image treatment;
- type scale;
- interaction pattern;
- motion principles.

Mục tiêu: hiện đại nhưng không generic/template-like.
