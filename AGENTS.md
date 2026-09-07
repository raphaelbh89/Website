# AGENTS.md

## Mục đích

File này là hợp đồng vận hành giữa tất cả AI Agent làm việc trên repository. Mọi Agent, bất kể model/provider, phải tuân thủ.

## Startup Protocol

Mỗi Agent bắt đầu session phải:

1. Đọc `RULES.md`.
2. Đọc `WORKFLOW.md`.
3. Đọc `PROJECT_STATE.md`.
4. Đọc `PROGRESS.md`.
5. Đọc `HANDOFF.md`.
6. Xác định task hiện tại và owner role trong `ROLES.md`.
7. Đọc tài liệu domain + ADR liên quan.
8. Kiểm tra working tree trước khi sửa code.

## Agent Contract

Agent phải:

- Làm theo architecture đã được chốt.
- Tạo thay đổi nhỏ, có thể kiểm chứng.
- Không phá API contract đang dùng nếu không có migration plan.
- Không suy đoán test đã pass.
- Không làm mất dữ liệu hoặc xóa migration tùy tiện.
- Không đánh dấu task hoàn tất nếu chưa đạt DoD.
- Ghi lại mọi quyết định ảnh hưởng cross-module.
- Cập nhật trạng thái trước khi rời session.

## Persistent Memory

Không dùng lịch sử hội thoại như nguồn sự thật duy nhất.

Nguồn sự thật theo thứ tự ưu tiên:

1. Source code + migration đang tồn tại.
2. ADR đã Accepted.
3. `PROJECT_STATE.md`.
4. Domain docs.
5. `PROGRESS.md` / `HANDOFF.md`.
6. Chat context.

Nếu tài liệu mâu thuẫn code, Agent phải điều tra và ghi issue; không tự chọn bên thuận tiện.

## Scope Discipline

Agent chỉ sửa những gì cần cho task hiện tại, trừ khi phát hiện blocker trực tiếp.

Mọi refactor lớn phải:

- có lý do;
- có acceptance criteria;
- có test regression;
- có ADR nếu ảnh hưởng kiến trúc.

## Change Protocol

Trước sửa:

- ghi task `IN_PROGRESS`;
- xác định files/modules dự kiến ảnh hưởng;
- xác định test cần chạy.

Sau sửa:

- chạy test;
- ghi evidence;
- cập nhật `PROGRESS.md`;
- cập nhật `HANDOFF.md` nếu chưa DONE;
- cập nhật docs/ADR nếu contract thay đổi.

## Status Vocabulary

Chỉ dùng:

- `TODO`
- `IN_PROGRESS`
- `BLOCKED`
- `READY_FOR_TEST`
- `FAILED`
- `VERIFIED`
- `DONE`

`DONE` chỉ xuất hiện sau verification độc lập hoặc evidence đầy đủ theo DoD.

## Handoff Trigger

Bắt buộc handoff khi:

- sắp hết context/token;
- user đổi Agent/model;
- task bị blocked;
- có thay đổi kiến trúc lớn;
- kết thúc phiên chưa DONE.

## QA Independence

Coding Agent không được coi chính mình là nguồn QA cuối cùng cho feature có độ rủi ro trung bình/cao.

QA Agent phải tự:

- đọc acceptance criteria;
- chạy app/test;
- thử negative paths;
- xác minh persistence và permission;
- ghi bằng chứng.
