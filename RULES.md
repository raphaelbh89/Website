# RULES.md — Luật bắt buộc

## R-001 — Không giả định chạy được

Không được dùng các câu kiểu “đã hoàn tất”, “đã hoạt động”, “đã fix” nếu chưa có bằng chứng thực thi phù hợp.

## R-002 — Không mock để đánh dấu DONE

Mock/stub có thể dùng trong unit test hoặc prototype, nhưng không thay thế feature production nếu acceptance criteria yêu cầu tích hợp thật.

## R-003 — Frontend data-driven

Nội dung, menu, section order, source của module và phần cấu hình phải đến từ Admin/API khi thiết kế yêu cầu quản trị động.

## R-004 — Module Type != Content Source

Không tạo module `NewsModule`, `CourseModule`, `AchievementModule` chỉ vì dữ liệu khác nhau nếu chúng chia sẻ cùng presentation pattern. Ưu tiên module trình bày generic + content contract.

## R-005 — Authorization server-side

Mọi permission quan trọng phải kiểm tra ở API/domain layer. UI chỉ là lớp hỗ trợ trải nghiệm.

## R-006 — Validation ở boundary

Validate input từ API, form, config JSON, upload, query params. Schema động cũng phải versioned và validated.

## R-007 — Migration bắt buộc

Thay đổi database schema phải có migration có thể chạy từ clean database và upgrade database hiện tại.

## R-008 — Không sửa migration lịch sử đã release

Tạo migration mới trừ khi dự án vẫn ở giai đoạn pre-release và có quyết định rõ ràng.

## R-009 — Error states là feature

Loading, empty, validation error, permission denied, not found và backend failure phải được thiết kế và test.

## R-010 — Responsive là acceptance criterion

Không coi desktop screenshot đúng là feature hoàn chỉnh.

## R-011 — Accessibility mặc định

Semantic HTML, keyboard navigation, focus state, label, contrast và alt text phải được xem xét ở component/module level.

## R-012 — SEO không hard-code toàn cục

Page/content SEO phải có khả năng override qua CMS với fallback hợp lý.

## R-013 — Secrets

Không commit token, password, private key, production credentials.

## R-014 — File Upload

Bắt buộc kiểm tra size, MIME/type, extension policy, storage path/key, authorization và safe filename/object key.

## R-015 — Audit

Các thao tác quản trị quan trọng phải có audit trail: ai, làm gì, đối tượng nào, thời gian, trước/sau khi phù hợp.

## R-016 — Không phá contract im lặng

API/schema/module contract thay đổi breaking phải có version/migration/ADR.

## R-017 — Git-friendly AI collaboration

Mỗi Agent phải hạn chế thay đổi lan rộng không cần thiết và ghi rõ files changed trong handoff.

## R-018 — Evidence bắt buộc

Mọi VERIFIED/DONE phải trỏ đến test/evidence trong `TEST_REPORT.md` hoặc CI artifact tương ứng.

## R-019 — Production build

Feature có ảnh hưởng build/deploy phải được test trên production build path trước DONE.

## R-020 — Fresh install

Các milestone lớn phải xác minh project có thể bootstrap từ README + env example + migration/seed tối thiểu.
