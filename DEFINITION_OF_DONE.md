# DEFINITION_OF_DONE.md

Một feature chỉ được đánh dấu `DONE` khi tất cả điều kiện áp dụng đã đạt.

## Code Quality

- [ ] Code nằm đúng module/domain.
- [ ] Không còn placeholder logic trong scope.
- [ ] Lint pass.
- [ ] Typecheck pass.
- [ ] Production build pass.

## Functional

- [ ] Happy path chạy thật.
- [ ] Invalid input được xử lý.
- [ ] Empty/loading/error states phù hợp.
- [ ] Data persistence được xác minh nếu có DB.
- [ ] Reload/restart không làm mất dữ liệu cần lưu.

## Integration

- [ ] Admin -> API -> DB -> Public flow chạy nếu feature liên quan.
- [ ] API contract đúng.
- [ ] Không có hard-coded fallback che mất lỗi tích hợp.

## Security

- [ ] Authentication đúng.
- [ ] Authorization kiểm tra server-side.
- [ ] Unauthorized direct URL/API request bị chặn.
- [ ] Input validation có test.
- [ ] Upload/security controls được áp dụng nếu liên quan.

## Responsive / UX

- [ ] Mobile.
- [ ] Tablet.
- [ ] Desktop.
- [ ] Long content.
- [ ] Empty data.
- [ ] Error/loading.
- [ ] Keyboard/focus cơ bản.

## Data / Migration

- [ ] Migration tồn tại.
- [ ] Migration chạy trên clean DB.
- [ ] Upgrade path được test khi cần.
- [ ] Index/constraints hợp lý.

## SEO / i18n

- [ ] Metadata/canonical/schema nếu page public.
- [ ] Locale fallback nếu localized.
- [ ] Localized URL/slug nếu áp dụng.

## Evidence

- [ ] Command thực tế được ghi.
- [ ] Test result được ghi trong `TEST_REPORT.md`.
- [ ] Acceptance criteria có PASS/FAIL rõ ràng.

Nếu một mục bắt buộc chưa thể test vì môi trường thiếu dependency/service, trạng thái là `BLOCKED` hoặc `READY_FOR_TEST`, không phải DONE.
