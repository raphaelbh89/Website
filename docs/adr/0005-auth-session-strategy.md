# ADR-0005: Authentication and Session Strategy

- Status: Accepted
- Date: 2026-09-07
- Owners: Lead Architect / Backend Lead / Security Lead

## Context

Platform hiện đang phát triển Milestone M2 (Auth + RBAC). Hệ thống gồm:
1. `apps/admin`: Next.js 16 (App Router) cho quản trị viên CMS và Content Operators.
2. `apps/api`: Fastify 5 backend REST API cho toàn bộ domain logic, dữ liệu và phân quyền.
3. `apps/web`: Next.js 16 SSR renderer cho website public (sẽ tiêu thụ API và CMS trong tương lai).

Deployment topology:
- Giai đoạn phát triển/staging: Admin chạy ở `localhost:3001`, API chạy ở `127.0.0.1:4000` (khác origin/port).
- Giai đoạn production: Admin và API có thể triển khai trên subdomain chung (ví dụ `admin.platform.example.com` và `api.platform.example.com`) hoặc qua Reverse Proxy / API Gateway định tuyến chung một origin (`example.com/admin` và `example.com/api`).
- Tương lai: Có thể phục vụ public website user, mobile apps hoặc third-party API clients.

## Problem

Cần một chiến lược Authentication & Session quản lý định danh người dùng đảm bảo:
1. Độ an toàn cao trước các lỗ hổng web phổ biến (XSS, CSRF, Session Fixation, Session Hijacking, Timing attacks).
2. Khả năng thu hồi (revocation) tức thì khi người dùng đăng xuất, bị vô hiệu hóa tài khoản, đổi mật khẩu, hoặc quản trị viên can thiệp.
3. Tương thích liền mạch giữa Fastify API và Next.js Admin.
4. Tránh lưu trữ credentials nhạy cảm trong client-accessible storage (`localStorage`/`sessionStorage`).

## Constraints

- Runtime: Node.js 24 LTS, TypeScript 5.9.
- Không tự xây dựng thuật toán mã hóa (No homegrown cryptography).
- R-005 (Authorization server-side): Mọi quyết định xác thực và phân quyền phải được kiểm tra và thực thi tại API boundary.
- R-013 (Secrets): Không commit secret, signing keys, hoặc hard-code credential.
- Không dùng mock authentication để pass acceptance criteria.

## Considered Alternatives

### Alternative A: Server-side Opaque Session với Cookie HttpOnly (Lựa chọn)
- **Cơ chế**: Client gửi credential đăng nhập (email + password). Sau khi xác thực, API tạo một cryptographically random session token (256-bit entropy qua `node:crypto.randomBytes(32)`), băm token bằng SHA-256 (`token_hash`) để lưu vào PostgreSQL bảng `sessions`, và gửi cookie `session_id` với cờ `HttpOnly; Secure; SameSite=Lax` về cho client.
- **Security**: Token thô không bao giờ nằm trong DB (phòng ngừa leak database dump), JavaScript trong trình duyệt không thể đọc cookie (miễn nhiễm XSS đánh cắp token qua `document.cookie`).
- **Revocation**: Tức thời (Instant revocation). Xóa hoặc đánh dấu `revoked_at` dòng session trong database là vô hiệu hóa ngay mọi request tiếp theo.
- **Complexity**: Thấp đến trung bình. Không cần Redis ở giai đoạn đầu; Drizzle ORM query trực tiếp bảng `sessions` với primary index.
- **CSRF**: Cookie tự động đính kèm trên request nên mọi mutation (`POST`/`PUT`/`DELETE`/`PATCH`) dùng cookie phải có `Origin`/`Referer` nằm trong allow-list. `SameSite=Lax`, explicit CORS, JSON hoặc `X-Requested-With` là các lớp phòng vệ bổ sung; transport Bearer-only không dùng cookie được xử lý riêng.

### Alternative B: Signed / Encrypted Stateless Session (Iron-session / Signed Cookie)
- **Cơ chế**: Dữ liệu session được serialize, mã hóa và ký bằng secret key rồi lưu hoàn toàn trong cookie.
- **Pros**: Không tốn truy vấn DB khi xác thực session.
- **Cons**: Không thể thu hồi session tức thời trừ khi duy trì blacklist trong DB (khi đó lại thành stateful); payload cookie bị phình to; rủi ro rò rỉ khi key xoay vòng phức tạp.

### Alternative C: JWT Access Token + Refresh Token (Trong LocalStorage hoặc Cookie)
- **Cơ chế**: Access Token (thời hạn ngắn: 5-15 phút) + Refresh Token (lưu DB hoặc HttpOnly cookie).
- **Pros**: Tiện cho mobile app hoặc microservices phân tán không chung DB.
- **Cons**:
  - Nếu lưu Access Token trong `localStorage`: Rất dễ bị đánh cắp bởi XSS.
  - Access Token không thể thu hồi ngay lập tức cho đến khi hết hạn (trừ khi duy trì revocation list trong Redis/DB, làm mất đi tính chất stateless của JWT).
  - Phức tạp hóa luồng refresh token handling ở frontend Next.js mà không mang lại lợi ích rõ rệt cho một Modular Monolith chung DB PostgreSQL.

## Decision

**CHỌN: Alternative A — Server-Side Opaque Session với Cookie HttpOnly kết hợp SHA-256 Token Hashing trong Database.**

Chi tiết các quyết định thành phần:

1. **Session Architecture**:
   - Khởi tạo session token: Chuỗi ngẫu nhiên 32 bytes an toàn bằng `crypto.randomBytes(32).toString('hex')` (64 ký tự hex).
   - Lưu trữ Database: Bảng `sessions` lưu `id` (UUIDv7), `user_id` (FK), `token_hash` (`sha256(session_token)`), `created_at`, `expires_at`, `last_active_at`, `ip_address`, `user_agent`.
   - Tra cứu session: Khi nhận cookie hoặc header `Authorization: Bearer <token>`, API băm SHA-256 token và truy vấn bản ghi còn hiệu lực (`expires_at > NOW() AND revoked_at IS NULL`).

2. **Cookie Strategy & Attributes**:
   - Tên cookie: `__Host-platform_session` (ở môi trường HTTPS production) hoặc `platform_session` (ở môi trường HTTP development).
   - `HttpOnly: true` (Ngăn chặn hoàn toàn JavaScript đọc cookie).
   - `Secure: true` (Bắt buộc trong production; tự động bypass khi `NODE_ENV === 'development'`).
   - `SameSite: 'Lax'` cho luồng điều hướng mượt mà, nhưng các API state-changing bắt buộc origin check.
   - `Path: /`.

3. **Session Lifecycle & Timeouts**:
   - **Absolute Expiration**: 7 ngày kể từ thời điểm đăng nhập (`now + 7 days`). Sau 7 ngày, bắt buộc đăng nhập lại.
   - **Idle Timeout (Rolling)**: 24 giờ. Mỗi khi request hợp lệ cách lần cập nhật trước > 15 phút, `last_active_at` và `expires_at` được gia hạn (nhưng không vượt quá 7 ngày absolute timeout).
   - **Session Fixation Defense**: Khi đăng nhập thành công, luôn luôn khởi tạo một session ID mới; hủy bỏ hoàn toàn bất kỳ session ẩn danh nào trước đó.
   - **Session Revocation**:
     - Khi gọi `POST /auth/logout`: Xóa bản ghi session hiện tại khỏi DB và xóa cookie trên client.
     - Khi đổi mật khẩu: Xóa tất cả các session đang hoạt động của user đó (`DELETE FROM sessions WHERE user_id = :id`).
     - Khi tài khoản bị vô hiệu hóa (`is_active = false`): Toàn bộ session của user bị từ chối ngay lập tức ở lần request tiếp theo vì câu query session luôn JOIN kiểm tra `users.is_active = true`.

4. **Password Hashing Strategy**:
   - Thuật toán được chọn: **Argon2id** (chuẩn RFC 9106, chuẩn chiến thắng Password Hashing Competition, chống cả GPU brute-force và side-channel timing attack).
   - Thư viện: `@node-rs/argon2` (Rust-based native binding, hiệu năng cao, zero dependency phức tạp, hỗ trợ Node 24).
   - Tham số:
     - Memory cost: 65536 KiB (64 MB)
     - Time cost: 3 iterations
     - Parallelism: 4 threads
     - Output length: 32 bytes
   - Verification: Dùng hàm `verify` của thư viện có cơ chế constant-time timing-safe comparison.
   - Re-hash migration: Khi cấu hình chi phí băm thay đổi trong tương lai, kiểm tra `needsRehash(hash)` lúc user đăng nhập thành công; nếu true, âm thầm băm lại mật khẩu với tham số mới và cập nhật DB.

5. **Login Security & Rate Limiting**:
   - **Generic Authentication Error**: Khi đăng nhập sai email hoặc sai mật khẩu, luôn trả về cùng một thông điệp lỗi chung: `"Invalid email or password"` với HTTP 401. Không tiết lộ tài khoản có tồn tại hay không (Account Enumeration Prevention).
   - **Inactive Account**: Nếu tài khoản tồn tại nhưng `is_active === false`, từ chối với HTTP 403: `"Account is deactivated"`.
   - **Rate Limiting**:
     - Sử dụng `@fastify/rate-limit` trên endpoint `POST /auth/login`.
     - Giới hạn: Tối đa 5 lần thử thất bại trong vòng 1 phút trên mỗi cặp `IP + email`. Khi vượt ngưỡng, trả về HTTP 429 `"Too many requests, please try again later"`.

6. **CSRF & Transport Security Protection Strategy**:
   - **Transport-Aware Protection**:
     - Khi request sử dụng xác thực qua Cookie (Cookie-authenticated mutating requests: `POST`, `PUT`, `PATCH`, `DELETE`), Fastify API bắt buộc phải có header `Origin` hoặc `Referer` thuộc danh sách trusted origins được cấu hình trong `CORS_ORIGIN` (ví dụ `http://localhost:3000,http://localhost:3001`). Mọi request có Cookie nhưng thiếu `Origin`/`Referer` hoặc mang foreign origin/referer đều bị từ chối với HTTP 403 Forbidden.
     - Yêu cầu cấu trúc header: Đối với mutating endpoints có payload, bắt buộc `Content-Type: application/json` hoặc `X-Requested-With: XMLHttpRequest` để ngăn chặn HTML form submission CSRF.
     - Phân định Bearer API client: Đối với client máy khách thuần túy không dùng cookie trình duyệt (`Authorization: Bearer <token>`), request không bắt buộc phải có browser `Origin` header nhưng vẫn phải tuân thủ token verification và MIME constraints.
   - **Zero Raw Token Exposure**:
     - Luồng Browser login (`POST /auth/login`) chỉ set token vào `HttpOnly; Secure; SameSite=Lax` cookie và trả về body `{ "user": { ... } }`. Tuyệt đối không trả về `token` trong JSON payload nhằm triệt tiêu nguy cơ XSS trích xuất token từ bộ nhớ JavaScript.

7. **Next.js Admin Integration**:
   - `apps/admin` giao tiếp với `apps/api` thông qua client chuẩn hóa `apiFetch` với `credentials: 'include'` và `X-Requested-With: XMLHttpRequest`.
   - Fastify API cấu hình `@fastify/cors` với `credentials: true` và explicit `origin` (không dùng wildcard `*`).

## Security Implications

- XSS Attackers không thể lấy được session token vì cookie mang thuộc tính `HttpOnly`.
- Database compromise (nếu DB bị leak read-only) không làm lộ session token thực tế của người dùng vì chỉ có `token_hash` (SHA-256) được lưu trong DB.
- Mật khẩu được bảo vệ an toàn bằng Argon2id.

## Data Model Impact

Cần các bảng mới trong PostgreSQL (định nghĩa chi tiết ở ADR-0006 và schema Drizzle):
- Bảng `users`: `id`, `email`, `password_hash`, `name`, `is_active`, `created_at`, `updated_at`.
- Bảng `sessions`: `id`, `user_id`, `token_hash`, `expires_at`, `created_at`, `last_active_at`, `ip_address`, `user_agent`.

## API Impact

Bổ sung các endpoints tại `apps/api`:
- `POST /auth/login`: Nhận `{ email, password }`, set session cookie, trả về profile tóm tắt.
- `POST /auth/logout`: Xóa session trong DB, clear cookie, trả về `{ status: 'ok' }`.
- `GET /auth/me`: Trả về thông tin user hiện tại và danh sách permissions/grants.

## Operational Impact

- Truy vấn session diễn ra trên mỗi authenticated request: Cần tạo index B-Tree trên cột `sessions.token_hash` và partial index trên `expires_at`. Do kết nối DB qua connection pool nội bộ PostgreSQL 16 (thời gian truy vấn < 1ms), chi phí này hoàn toàn tối ưu và đảm bảo tính nhất quán tuyệt đối.
- Có thể bổ sung scheduled task / cron định kỳ dọn dẹp các session đã hết hạn (`DELETE FROM sessions WHERE expires_at < NOW()`).

## Alternatives Rejected

- **JWT thuần trong Cookie/Header**: Bị bác bỏ do không thể thu hồi tức thì khi tài khoản bị khóa hoặc đăng xuất, và rủi ro nếu lưu trong localStorage.
- **Bcrypt**: Bị bác bỏ vì Argon2id vượt trội hơn về khả năng kháng GPU/ASIC cracking và chống side-channel attacks.
- **Node built-in scrypt**: Tốt nhưng thiếu native standard format string ($argon2id$v=...$) và thiếu tính năng tự động phát hiện `needsRehash` so với Argon2id.

## Consequences

### Positive
- Hệ thống bảo mật cao, đạt chuẩn OWASP Session Management Cheat Sheet.
- Quản lý session tập trung, thu hồi tức thời.
- Dễ dàng audit và theo dõi các phiên đăng nhập đang hoạt động của người dùng.

### Negative / Trade-offs
- Mỗi request có trạng thái cần một truy vấn DB nhanh vào bảng `sessions` (có thể thêm caching Redis ở M9 nếu scale yêu cầu).
- Cần cấu hình CORS cẩn thận giữa Admin và API khi chạy khác origin.

## Risks

- Nếu clock giữa database server và application server bị lệch quá lớn, tính toán `expires_at` có thể bị ảnh hưởng. Giảm thiểu: Đồng bộ NTP và luôn tính toán dựa trên `CURRENT_TIMESTAMP` của PostgreSQL hoặc offset chuẩn hóa.

## Migration / Future Evolution

- Khi mở rộng sang Mobile Apps: API đã sẵn sàng hỗ trợ header `Authorization: Bearer <session_token>` song song với cookie.
- Khi tải hệ thống tăng cao ở M9: Có thể bổ sung Redis làm cache read-through cho bảng `sessions` mà không làm thay đổi API contract.

## Acceptance Criteria

1. Đăng nhập đúng trả về HTTP 200, tạo session trong DB, set cookie `HttpOnly`.
2. Token lưu trong DB là SHA-256 hash, không phải plain token.
3. Đăng nhập sai trả về HTTP 401 với thông điệp chung `Invalid email or password`.
4. Tài khoản `is_active = false` bị từ chối đăng nhập với HTTP 403.
5. Gọi `GET /auth/me` với cookie hợp lệ trả về thông tin user; không có cookie hoặc cookie hết hạn trả về 401.
6. Gọi `POST /auth/logout` xóa session trong DB và vô hiệu hóa cookie; các request sau đó bằng session này bị 401.
7. Mật khẩu được mã hóa an toàn bằng Argon2id.
