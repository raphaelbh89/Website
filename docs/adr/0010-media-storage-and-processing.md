# ADR-0010: Media Library, Storage Abstraction, and Secure Image Processing

- Status: Proposed (Architecture Checkpoint for M4.1)
- Date: 2026-09-08
- Owners: Lead Architect / Backend Lead / Security Lead

## 1. Context

M4.1 cần một Media Library đa site, an toàn, không phụ thuộc local disk và có thể dùng cùng domain contract với local development, S3, Cloudflare R2 hoặc MinIO. Media phải tích hợp với immutable content revisions mà không làm rò rỉ draft, phá lịch sử đã publish hoặc tạo tham chiếu cross-site.

ADR này chỉ là architecture checkpoint. Khi còn `Proposed`, không được cài package, sinh migration hay triển khai source M4.

## 2. Decision Summary

Nếu ADR được chấp nhận, M4.1 sẽ:

1. Chỉ nhận ảnh JPEG, PNG và WebP.
2. Giữ **raw source** byte-for-byte, private và immutable; không bao giờ cấp public URL trực tiếp.
3. Tạo một **sanitized display original** public, đã normalize orientation và loại EXIF/GPS, cùng ba derived variants `thumbnail`, `medium`, `large` dạng WebP.
4. Lưu object bằng opaque server-generated keys, tuyệt đối không chứa original filename.
5. Dùng `StorageProvider` với streaming I/O, không có contract Buffer-only.
6. Theo dõi media của content revisions bằng bảng quan hệ thật `content_revision_media`; JSON có thể giữ asset UUID để phục vụ snapshot nhưng không thay thế FK bền vững.
7. Chỉ hỗ trợ archive trong M4.1. Physical deletion/garbage collection được hoãn cho đến khi có lifecycle và compensation design đủ mạnh.
8. Dùng custom domain và cache policy ở production; `r2.dev` chỉ dành cho development/test.

## 3. Storage Provider Decision

Domain không phụ thuộc SDK của vendor. Hai adapter dự kiến là:

- `LocalStorageProvider` cho local/CI, lưu ngoài code tree và public web directory.
- `S3CompatibleStorageProvider` cho production/staging; endpoint/config quyết định AWS S3, Cloudflare R2 hoặc MinIO.

Cloudflare R2 là production candidate, không phải lựa chọn hard-coded. Theo tài liệu Cloudflare cập nhật ngày 2026-08-07, egress trực tiếp từ R2 không bị tính data-transfer charge; storage, Class A/B operations và retrieval của Infrequent Access vẫn có thể phát sinh phí. Giá phải được kiểm tra lại tại thời điểm implementation: [R2 pricing](https://developers.cloudflare.com/r2/pricing/).

R2 là S3-compatible object storage, không phải bản sao đầy đủ mọi hành vi AWS S3. Adapter phải được contract-test với provider được chọn.

`r2.dev` có rate limit biến thiên, không dành cho production và không cung cấp cache/WAF/bot-management tương đương custom domain. Production phải dùng custom domain do hệ thống kiểm soát và cache rules rõ ràng: [R2 public bucket limits](https://developers.cloudflare.com/r2/platform/limits/), [R2 public buckets](https://developers.cloudflare.com/r2/buckets/public-buckets/).

## 4. Streaming Contract Candidate

Contract phải truyền stream end-to-end và áp dụng backpressure. Buffer nhỏ có thể là implementation detail, không được là yêu cầu của interface.

```typescript
import type { Readable } from 'node:stream';

export type ByteSource = Readable | AsyncIterable<Uint8Array>;

export interface PutObjectOptions {
  key: string;
  body: ByteSource;
  mimeType: string;
  sizeBytes: number;
  metadata?: Record<string, string>;
  cacheControl?: string;
}

export interface StorageObjectMetadata {
  key: string;
  mimeType: string;
  sizeBytes: number;
  etag?: string;
  lastModified?: Date;
}

export interface StorageReadResult extends StorageObjectMetadata {
  body: ByteSource;
}

export interface StorageProvider {
  putObject(options: PutObjectOptions): Promise<{ key: string; etag?: string }>;
  getObject(key: string): Promise<StorageReadResult>;
  objectExists(key: string): Promise<boolean>;
  getMetadata(key: string): Promise<StorageObjectMetadata | null>;

  // Internal compensation/lifecycle primitive; not a public M4.1 hard-delete feature.
  deleteObject(key: string): Promise<void>;

  getPublicUrl(key: string): string;
  getSignedDownloadUrl?(key: string, expiresInSeconds: number): Promise<string>;
}
```

`getPublicUrl` chỉ hợp lệ với sanitized/derived objects. Raw source phải ở private namespace và chỉ được đọc qua authenticated authorization path hoặc signed URL ngắn hạn khi một use case sau này được chấp nhận.

## 5. Object Classes and Immutable Keys

Một upload thành công tạo hai lớp object.

### 5.1 Private raw source

- Byte-for-byte giống payload hợp lệ đã upload.
- Private, immutable, không có direct public URL và không dùng để render website.
- Dùng để audit hoặc reprocess có kiểm soát.
- Key:

```text
sites/{siteId}/assets/{assetId}/source/{checksum}.{ext}
```

### 5.2 Public sanitized outputs

- `display-original`: orientation được normalize, EXIF/GPS và metadata không cần thiết bị loại bỏ.
- `thumbnail`: WebP, 300px, crop/cover theo contract UI.
- `medium`: WebP, tối đa 800px, giữ aspect ratio.
- `large`: WebP, tối đa 1600px, giữ aspect ratio.
- Keys bất biến, content-addressed theo checksum output:

```text
sites/{siteId}/assets/{assetId}/variants/display-original-{checksum}.{ext}
sites/{siteId}/assets/{assetId}/variants/thumbnail-{checksum}.webp
sites/{siteId}/assets/{assetId}/variants/medium-{checksum}.webp
sites/{siteId}/assets/{assetId}/variants/large-{checksum}.webp
```

`original_filename` chỉ là sanitized display metadata trong DB. Nó không được xuất hiện trong storage key, filesystem path hay public URL.

Public variants dùng immutable cache headers. Metadata records phải lưu checksum, MIME, width, height, size và processing version để việc reprocess tạo key mới thay vì overwrite object đang được cache.

## 6. Relational Domain Model Candidate

### 6.1 `media_assets`

- `id` UUIDv7 PK.
- `site_id` FK `sites.id`.
- `folder_id` nullable FK `media_folders.id`.
- `original_filename` display metadata only.
- `source_storage_key`, `source_mime_type`, `source_size_bytes`, `source_checksum_sha256`.
- `media_kind = 'image'` trong M4.1.
- `lifecycle_state`: `processing | active | archived | failed`.
- title, default alt text, caption, created_by, timestamps.

### 6.2 `media_variants`

- `id` UUIDv7 PK.
- `asset_id` FK `media_assets.id`.
- `variant_key`: `display_original | thumbnail | medium | large`.
- storage key, checksum, MIME, width, height, size, processing version, created_at.
- Unique `(asset_id, variant_key, processing_version)`.

### 6.3 `media_folders`

Virtual metadata hierarchy only. Moving a folder never moves or renames physical objects.

### 6.4 `content_revision_media`

Đây là durable usage relation bắt buộc, không dùng polymorphic `owner_kind/owner_id` cho content revisions:

- `revision_id` FK `content_entry_revisions.id` `ON DELETE CASCADE`.
- `asset_id` FK `media_assets.id` với delete bị hạn chế bởi lifecycle policy.
- `field_key` varchar, phải tồn tại trong schema version của revision.
- `position` integer cho field đơn hoặc collection ordering.
- PK/unique candidate: `(revision_id, field_key, position)`.
- Index `(asset_id)` để truy usage và ngăn lifecycle action sai.

Content revision JSON có thể chứa asset UUID và contextual alt override để giữ snapshot semantics. Service phải ghi JSON snapshot và `content_revision_media` trong cùng transaction, validate asset cùng site, `active`, đúng media kind và đúng field contract. Bảng quan hệ là nguồn đảm bảo referential integrity; JSON không phải FK.

Các owner domain tương lai như page sections, settings hoặc themes phải có junction table typed riêng hoặc ADR mở rộng; không đưa polymorphic pseudo-FK vào M4.1.

## 7. Upload Security and Image-Bomb Controls

M4.1 allow-list duy nhất:

- `image/jpeg`
- `image/png`
- `image/webp`

GIF, PDF, SVG, video, audio và mọi định dạng khác được defer. SVG vẫn bị cấm vì active-content/XSS risk. Không quảng bá document/video/audio support trong UI hoặc API M4.1.

Pipeline bắt buộc:

1. Stream upload với request byte limit; không tin filename, extension hoặc client `Content-Type`.
2. Sniff magic bytes bằng allow-list và chọn extension từ server-verified format.
3. Hash SHA-256 khi stream; không dùng filename để tạo key.
4. Đọc metadata bằng decoder trong chế độ hạn chế trước khi decode/transform đầy đủ.
5. Từ chối trước expensive processing nếu width/height, total pixels, page/frame count hoặc estimated decompressed memory vượt policy.
6. Giới hạn đồng thời, CPU/time và decoder allocation. File nhỏ theo byte vẫn có thể là image bomb nên byte limit không đủ.
7. Decode một lần theo pipeline có kiểm soát, normalize orientation, strip metadata, tạo outputs.
8. Chỉ đánh dấu asset `active` sau khi DB rows và toàn bộ required outputs nhất quán.

Candidate limits phải được benchmark rồi chốt ở implementation plan; baseline review values là upload <= 10 MiB, mỗi chiều <= 8000 px, total pixels <= 40 megapixels và chỉ một frame/page. Không bắt đầu transform nếu metadata probe vi phạm giới hạn.

## 8. Lifecycle and Failure Semantics

M4.1 chỉ có archive:

- `active`: có thể gán vào revision mới.
- `archived`: không thể gán mới nhưng mọi historical/published revision vẫn resolve được sanitized variants.
- `processing` và `failed`: không thể gán hoặc public-resolve như asset hợp lệ.

Không có public hard-delete endpoint trong M4.1. Physical deletion và garbage collection được defer vì DB transaction không thể atomic với object storage. `deleteObject` chỉ được dùng nội bộ để compensation cho object mới tạo trong một upload chưa commit; failure phải được ghi nhận và có reconciliation path. Không xóa raw source hoặc variant của asset từng được tham chiếu chỉ dựa trên current-reference count.

## 9. CMS Media Field Contract

Sau khi ADR được accept, Canonical Field Registry có thể thêm:

```typescript
{
  key: 'heroImage',
  label: 'Hero Banner',
  type: 'media',
  required: true,
  allowedKinds: ['image']
}
```

Revision JSON candidate:

```json
{
  "heroImage": {
    "assetId": "01900000-0000-7000-8000-000000000001",
    "alt": "Contextual alt override"
  }
}
```

Public resolver chỉ trả sanitized `displayOriginal` và derived variant URLs từ configured public media origin. Nó không trả `source_storage_key`, raw-source URL, original filename hay provider credentials.

Draft revision mới không thay đổi media đang public cho đến khi publish. Archive không làm hỏng published/historical output.

## 10. RBAC and Multi-Site Isolation

Candidate permissions theo SITE scope:

- `media.read`
- `media.upload`
- `media.update`
- `media.archive`

Không thêm `media.delete` trong M4.1 vì physical delete bị defer. Mọi list/detail/upload/update/archive và revision attachment đều phải filter/validate `site_id` server-side. Cross-site asset IDs bị từ chối kể cả khi caller biết UUID.

## 11. Candidate API Surface

```text
GET    /sites/:siteId/media
POST   /sites/:siteId/media
GET    /sites/:siteId/media/:assetId
PATCH  /sites/:siteId/media/:assetId
POST   /sites/:siteId/media/:assetId/archive

GET    /public/sites/:siteId/media/:assetId/display-original
GET    /public/sites/:siteId/media/:assetId/variants/:variantKey
```

Không có public raw-source endpoint và không có `DELETE` endpoint trong M4.1.

## 12. M4.1 Vertical Slice Acceptance Candidate

1. JPEG/PNG/WebP upload được stream, size-limited, magic-byte verified và image-bomb checked.
2. Raw source được giữ private/immutable; display original và ba variants được sanitized và lưu bằng opaque keys.
3. Local adapter và production S3-compatible adapter vượt cùng contract tests.
4. DB ghi asset/variants nhất quán; partial failure có compensation/reconciliation evidence.
5. Admin Media Library list/upload/archive hoạt động với SITE-scoped permission.
6. `media` field tạo revision cùng `content_revision_media` transactionally; optional/required và cross-site failures có negative tests.
7. Revision 2 draft không rò media mới; publish chuyển pointer; archived historical asset vẫn render.
8. Fresh migration, forward upgrade, repeat migration, drift, unit/integration/build/smoke và browser flow đều PASS trước khi M4.1 được đánh dấu hoàn tất.

## 13. Deferred Decisions

- GIF/animation, PDF/documents, SVG sanitization, video/audio/transcoding.
- Background queue/provider và retry orchestration.
- Physical garbage collection, retention windows, legal hold và restore.
- Cross-site physical deduplication.
- AVIF generation and dynamic on-demand transformations.
- Private download product requirements and signed URL policy.

## 14. Consequences and Open Checkpoint

Ưu điểm: raw evidence được bảo toàn; public delivery không rò metadata; storage portable; references có FK thật; URLs cache-safe; M4.1 có scope nhỏ và kiểm chứng được.

Chi phí: mỗi ảnh cần nhiều object, processing và storage; dual-write DB/object storage cần compensation/reconciliation; production cache/domain configuration là phần bắt buộc của deployment.

ADR vẫn là `Proposed`. Trước khi accept cần review ít nhất: exact pixel/memory limits, variant dimensions/quality, adapter contract tests, compensation state machine, custom-domain cache policy và migration design.
