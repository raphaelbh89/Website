# ADR-0010: Media Library, Storage Abstraction, and Secure Image Processing

- Status: Accepted
- Date: 2026-09-09
- Owners: Lead Architect / Backend Lead / Security Lead

## 1. Context and Scope

M4.1 cần một Media Library đa site, an toàn, không phụ thuộc local disk và có thể dùng cùng domain contract với local development, S3, Cloudflare R2 hoặc MinIO. Media phải tích hợp với immutable content revisions mà không làm rò rỉ draft, phá lịch sử đã publish hoặc tạo tham chiếu cross-site.

ADR này chốt duy nhất M4.1 Image Media vertical slice. M4.2, Menu, Forms, Settings, Page Builder, queue/background processing và physical garbage collection nằm ngoài phạm vi.

## 2. Supported Formats

M4.1 chỉ nhận:

- `image/jpeg`
- `image/png`
- `image/webp`

GIF, SVG, PDF, video, audio và AVIF input được defer. SVG vẫn bị cấm vì active-content/XSS risk. UI và API không quảng bá các định dạng bị defer.

## 3. Hard Upload and Processing Limits

Các giới hạn bắt buộc:

```text
maxUploadBytes = 10 MiB
maxWidth = 8000
maxHeight = 8000
maxInputPixels = 40,000,000
maxFrames = 1
processingConcurrency = 2 image jobs per API process
```

Sharp phải được cấu hình tương đương `limitInputPixels = 40_000_000`. Pipeline phải metadata-probe và từ chối file vượt byte, width, height, pixel hoặc frame policy trước khi decode/transform tốn tài nguyên. Byte limit không thay thế image-bomb protection.

Concurrency ban đầu là hai image jobs trên mỗi API process. M9 sẽ benchmark memory/CPU/latency và có thể điều chỉnh nhưng không được thay đổi âm thầm security limits.

## 4. Raw Source and Variant Contract

### 4.1 Raw source

- Private.
- Byte-for-byte immutable.
- Không bao giờ có public URL hay public delivery route.
- Chỉ dùng cho audit/reprocess được authorization rõ ràng.

### 4.2 Processing version

`processing_version = 1`.

### 4.3 Required sanitized outputs

| Variant | Geometry | Fit | Enlargement | Format | Quality | Processing |
|---|---|---|---|---|---|---|
| `display_original` | Full source dimensions after orientation normalization | inside | Never upscale | WebP | 88 | Normalize orientation; strip metadata/EXIF/GPS |
| `thumbnail` | 300 × 300 | cover | Do not upscale source | WebP | 80 | Normalize orientation; strip metadata |
| `medium` | max 800 × 800 | inside | `withoutEnlargement = true` | WebP | 82 | Normalize orientation; strip metadata |
| `large` | max 1600 × 1600 | inside | `withoutEnlargement = true` | WebP | 84 | Normalize orientation; strip metadata |

Mọi upload hợp lệ phải tạo đủ bốn outputs. Không output nào được giữ EXIF/GPS. `display_original` là public-safe rendering representation, không phải raw source.

## 5. Immutable Object Keys and Cache Policy

Original filename chỉ là sanitized display metadata trong DB, không được dùng làm path/key.

```text
sites/{siteId}/assets/{assetId}/source/{rawChecksum}.{ext}
sites/{siteId}/assets/{assetId}/variants/v1/display-original-{outputChecksum}.webp
sites/{siteId}/assets/{assetId}/variants/v1/thumbnail-{outputChecksum}.webp
sites/{siteId}/assets/{assetId}/variants/v1/medium-{outputChecksum}.webp
sites/{siteId}/assets/{assetId}/variants/v1/large-{outputChecksum}.webp
```

Sanitized outputs dùng content-addressed immutable keys và trả:

```http
Cache-Control: public, max-age=31536000, immutable
```

Không overwrite public object key đã tồn tại. Reprocess hoặc processing-version change tạo key mới. Raw source private không có public cache/delivery contract.

## 6. Storage Provider and Production Delivery

Media domain chỉ phụ thuộc `StorageProvider`, không phụ thuộc vendor SDK. Provider được chọn bằng configuration.

- `LocalStorageProvider`: local/CI, lưu dưới `.local-media/` hoặc configured equivalent ngoài app/public source tree.
- `S3CompatibleStorageProvider`: production/staging, dùng `@aws-sdk/client-s3` và hỗ trợ endpoint, region, bucket, credentials, path-style cùng public asset origin bằng config.

Cloudflare R2 là production candidate, không bị hard-code. R2 S3-compatible nhưng không đồng nhất mọi AWS S3 feature, nên adapter phải được contract-test. Theo Cloudflare tại thời điểm ADR, direct R2 egress không có bandwidth transfer charge; storage/operations vẫn billable và Infrequent Access có thể có retrieval cost. Giá phải được kiểm tra lại khi triển khai/vận hành: [R2 pricing](https://developers.cloudflare.com/r2/pricing/).

Production delivery candidate:

```text
assets.<site-or-platform-domain>
  -> Cloudflare R2 Custom Domain
```

Không dùng `r2.dev` ở production. Custom Domain bắt buộc để có production caching/WAF/bot-management behavior; `r2.dev` chỉ dành cho test/development và có rate limit: [R2 limits](https://developers.cloudflare.com/r2/platform/limits/), [R2 public buckets](https://developers.cloudflare.com/r2/buckets/public-buckets/).

## 7. Stream-Capable Provider Contract

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
  public: boolean;
}

export interface StorageObjectMetadata {
  key: string;
  mimeType: string;
  sizeBytes: number;
  etag?: string;
  lastModified?: Date;
  public: boolean;
}

export interface StorageReadResult extends StorageObjectMetadata {
  body: ByteSource;
}

export interface StorageProvider {
  putObject(options: PutObjectOptions): Promise<{ key: string; etag?: string }>;
  getObject(key: string): Promise<StorageReadResult>;
  objectExists(key: string): Promise<boolean>;
  getMetadata(key: string): Promise<StorageObjectMetadata | null>;
  deleteObject(key: string): Promise<void>; // compensation only in M4.1
  getPublicUrl(key: string): string;
}
```

Contract dùng streaming I/O và backpressure, không Buffer-only. `getPublicUrl` phải từ chối private raw keys.

Một reusable provider contract-test suite bắt buộc kiểm tra byte identity, streamed payload, MIME metadata, exact size, missing key, delete compensation và non-public raw behavior. Local provider phải PASS local/integration. S3 adapter dùng injected/mock client cho unit tests.

Live S3-compatible contract chỉ chạy khi có `TEST_S3_ENDPOINT`, `TEST_S3_BUCKET` và related test credentials. Nếu không có endpoint thật, báo chính xác: `S3 adapter implementation/build/unit = PASS`; `S3 live provider integration = NOT RUN / READY_FOR_TEST`.

## 8. Compensation and Failure State Machine

Upload lifecycle bắt buộc:

```text
1. Receive bounded upload stream.
2. Write to secure temporary workspace.
3. Verify magic bytes, format, byte limit, dimensions, pixel count and single frame.
4. Generate all sanitized outputs locally.
5. Compute raw/output SHA-256, dimensions, size, MIME and deterministic keys.
6. Create MediaAsset(status=processing) and planned MediaVariant rows in DB.
7. Upload raw source, display_original, thumbnail, medium and large.
8. If every object succeeds, transactionally set MediaAsset=active.
9. If any upload fails, set MediaAsset=failed and best-effort delete every newly uploaded object.
10. If cleanup fails, retain known storage keys/rows and reconciliation-needed evidence.
```

Không asset nào được `active` trước khi đủ năm objects tồn tại. Asset `failed` không thể được chọn, gắn vào revision hoặc public-resolve. M4.1 có thể cung cấp explicit service/CLI reconciliation; background queue được defer. Temporary workspace luôn được cleanup trong `finally`, kể cả validation, processing, DB hoặc upload failure.

## 9. Database Scope

M4.1 chỉ thêm `media_assets`, `media_variants`, `content_revision_media`. `media_folders` và generic `media_references` được defer.

### 9.1 `media_assets`

```text
id UUIDv7 PK
site_id UUID FK sites.id NOT NULL
original_filename TEXT NOT NULL
source_storage_key TEXT NOT NULL UNIQUE
source_mime_type TEXT NOT NULL
source_size_bytes BIGINT NOT NULL
source_checksum_sha256 CHAR(64) NOT NULL
media_kind TEXT NOT NULL = image
lifecycle_state TEXT NOT NULL = processing|active|archived|failed
reconciliation_needed BOOLEAN NOT NULL DEFAULT false
title TEXT NULL
default_alt_text TEXT NULL
caption TEXT NULL
created_by UUID FK users.id ON DELETE SET NULL
created_at TIMESTAMPTZ NOT NULL
updated_at TIMESTAMPTZ NOT NULL
```

Indexes: `(site_id)`, `(site_id, lifecycle_state)`, `(site_id, created_at)`, optional non-unique `(site_id, source_checksum_sha256)`. Không cross-site logical deduplication; duplicate detection chỉ có thể cảnh báo/tái sử dụng trong cùng site khi có policy sau này.

### 9.2 `media_variants`

```text
id UUIDv7 PK
asset_id UUID FK media_assets.id NOT NULL ON DELETE RESTRICT
variant_key TEXT NOT NULL
processing_version INTEGER NOT NULL
storage_key TEXT NOT NULL UNIQUE
checksum_sha256 CHAR(64) NOT NULL
mime_type TEXT NOT NULL
width INTEGER NOT NULL
height INTEGER NOT NULL
size_bytes BIGINT NOT NULL
created_at TIMESTAMPTZ NOT NULL
UNIQUE(asset_id, variant_key, processing_version)
```

### 9.3 `content_revision_media`

```text
revision_id UUID FK content_entry_revisions.id ON DELETE CASCADE
asset_id UUID FK media_assets.id ON DELETE RESTRICT
field_key TEXT NOT NULL
position INTEGER NOT NULL DEFAULT 0
PRIMARY KEY(revision_id, field_key, position)
INDEX(asset_id)
```

JSON revision giữ asset UUID/contextual alt snapshot nhưng không thay thế relational FK.

## 10. CMS Media Field

Canonical Field Registry thêm `media` với single image asset only; gallery/multi-media và default asset bị defer.

```json
{
  "key": "heroImage",
  "label": "Hero Image",
  "type": "media",
  "required": false,
  "allowedKinds": ["image"]
}
```

Chỉ property `allowedKinds: ["image"]` được phép cho media. `default` bị từ chối trong M4.1.

Revision JSON:

```json
{
  "heroImage": {
    "assetId": "01900000-0000-7000-8000-000000000001",
    "alt": "Context-specific alt"
  }
}
```

Khi tạo revision mới, server kiểm tra asset tồn tại, cùng `site_id`, `active`, `media_kind` nằm trong `allowedKinds`. Contextual `alt` là revision snapshot; `default_alt_text` chỉ là fallback khi contextual alt trống/không có.

Nếu media field bị omitted trong ordinary partial edit, merged revision data phải giữ giá trị hiện tại và tạo lại đúng relation, không làm mất media hoặc taxonomy relation.

## 11. Revision, Media and Taxonomy Atomicity

```text
BEGIN
  validate current revision and expectedRevision
  merge and validate CMS data
  validate media assets
  validate/provide taxonomy snapshot
  INSERT immutable revision
  INSERT content_revision_media rows
  INSERT/copy content_revision_terms rows
  UPDATE current_revision_id
COMMIT
```

Bất kỳ media/taxonomy relation failure nào phải rollback: không orphan revision, không partial media refs, không taxonomy loss, pointer không đổi.

## 12. Zero Draft Leakage

Test bắt buộc:

1. Revision 1 publish với Asset A.
2. Revision 2 draft đổi sang Asset B.
3. Public vẫn trả Asset A và relation Revision 1 không đổi.
4. Publish Revision 2 thì public đổi nguyên tử sang Asset B.

Public resolver chỉ đọc `published_revision_id`, không đọc current draft.

## 13. Archive Semantics

Archive chỉ đổi `lifecycle_state = archived`.

- New revision không được newly select/attach asset archived.
- Historical/published revisions tiếp tục resolve sanitized variants của asset archived.
- Admin picker ẩn archived mặc định; Media Library có explicit archived filter.
- Không có `DELETE` endpoint hoặc physical garbage collection trong M4.1.

`deleteObject` chỉ dành cho upload compensation. Không xóa raw/variant của asset từng được tham chiếu dựa trên current-reference count.

## 14. Public Media Projection and Delivery

Public content resolver trả projection an toàn:

```json
{
  "assetId": "...",
  "alt": "contextual or default fallback",
  "displayOriginal": {
    "url": "...",
    "width": 2000,
    "height": 1200
  },
  "variants": {
    "thumbnail": { "url": "...", "width": 300, "height": 300 },
    "medium": { "url": "...", "width": 800, "height": 480 },
    "large": { "url": "...", "width": 1600, "height": 960 }
  }
}
```

Không trả `source_storage_key`, raw source URL, provider credentials, bucket hay internal provider data. URL đến từ configured public media origin/provider.

Local provider có thể dùng:

```text
GET /public/sites/:siteId/media/:assetId/display-original
GET /public/sites/:siteId/media/:assetId/variants/:variantKey
```

Response bắt buộc dùng verified stored MIME, `X-Content-Type-Options: nosniff` và immutable `Cache-Control`. Không suy MIME từ URL/client filename. Production S3/R2 ưu tiên direct custom-domain/CDN URL, không proxy mọi ảnh qua Fastify.

## 15. RBAC and Site Isolation

Seed idempotently, SITE-scoped:

- `media.read`
- `media.upload`
- `media.update`
- `media.archive`

Không thêm `media.delete`. Không role-name bypass; dùng RolePermission và standard `requirePermission`. Mọi list/detail/upload/update/archive/revision attachment phải enforce site scope server-side và có direct IDOR/cross-site tests.

## 16. Admin API Surface

```text
GET   /sites/:siteId/media?page=&limit=&search=&status=
POST  /sites/:siteId/media                      multipart upload
GET   /sites/:siteId/media/:assetId
PATCH /sites/:siteId/media/:assetId
POST  /sites/:siteId/media/:assetId/archive
```

Không có DELETE. Pagination bắt buộc, server-side max page size. JSON endpoints tuân thủ ADR-0005 CSRF rules; multipart upload vẫn bắt buộc Origin/Referer cho cookie-auth nhưng được phép `multipart/form-data` thay vì JSON.

## 17. Admin UI

Route `/media` cung cấp:

- Site selector/context.
- JPEG/PNG/WebP upload với progress/loading và validation errors.
- Thumbnail grid, pagination, filename/title search.
- Active/archived filter và image metadata.
- Edit title/default alt/caption và archive.

CMS Dynamic Form render Media Picker hoàn toàn theo `field.type === 'media'`; không hard-code theo article/content-type key.

## 18. Migration and Verification Contract

Implementation phải sửa Drizzle schema trước rồi chạy `pnpm db:generate`; không tạo parallel SQL-only model. Migration forward-only sau 0005 phải review UUIDv7 app defaults, FKs, unique/lifecycle indexes và delete behavior. `pnpm db:generate` sau final schema phải báo không drift.

Fresh path: `0000 -> M4.1 migration`. Upgrade path: `existing DB through 0005 -> M4.1 migration`. Cả hai phải PASS trên PostgreSQL 16.

Mandatory regression: lint, typecheck, unit, build, integration, migration-upgrade, smoke, db:generate; storage contract; upload security; image-bomb; revision/media atomicity; zero draft leakage; archive/history; public delivery/cache; RBAC/site isolation và real browser flow.

## 19. Consistency Review and Acceptance

Đã đối chiếu với ADR-0002, ADR-0005, ADR-0006, ADR-0007, ADR-0008, ADR-0009, `DATABASE.md`, `CMS_ARCHITECTURE.md`, `API_CONVENTIONS.md`, `SECURITY.md`:

- Relational `content_revision_media` tuân ADR-0002 và không biến JSONB thành pseudo-FK.
- Cookie multipart mutation vẫn giữ provenance protection của ADR-0005.
- Bốn quyền media dùng standard scoped RBAC của ADR-0006, không role bypass.
- Media relation nằm trên immutable revision và public chỉ đọc published pointer theo ADR-0007/0009.
- Asset luôn site-bound và mọi lookup enforce site isolation theo ADR-0008.
- Archive bảo toàn historical relation, tương thích taxonomy archive semantics.
- API/pagination/error/security headers tuân domain docs; không public raw/provider internals.

Không còn mâu thuẫn trong phạm vi M4.1. Các limit, variant, compensation, provider, schema, API, cache, permission và migration decisions đã được chốt; ADR được **Accepted**. Mọi thay đổi contract tiếp theo phải cập nhật ADR/migration plan thay vì thay đổi ngầm.
