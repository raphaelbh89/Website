# TESTING.md

## Mục tiêu

Test để xác minh behavior thực tế, không chỉ syntax/compile.

## Test Pyramid

### Unit

Dùng cho:

- pure functions;
- schema validation;
- permission rules;
- module config normalization;
- domain rules.

### Integration

Dùng cho:

- repository + database;
- API + DB;
- auth + permission;
- migration;
- page config -> renderer contract.

### E2E / Browser

Dùng cho:

- login;
- CRUD Admin;
- page builder publish;
- public render;
- form submission;
- menu navigation;
- locale switching;
- permission denial.

## Critical Golden Paths

### GP-01 Content Publishing

```text
Admin login
-> create content
-> save DB
-> publish
-> public API returns content
-> web renders content
-> refresh remains correct
```

### GP-02 Page Composition

```text
Admin create page
-> add section
-> choose module type
-> select content source
-> configure props
-> publish
-> web renders in correct order
```

### GP-03 Permission

```text
User without permission
-> UI action hidden/disabled
-> direct API call denied
-> direct URL denied
-> audit/security behavior correct
```

### GP-04 Localization

```text
Create VI content
-> create EN translation
-> localized slug
-> locale switch
-> hreflang/canonical correct
```

### GP-05 Form

```text
Create dynamic form
-> publish
-> submit valid data
-> validation invalid data
-> DB submission saved
-> notification/webhook if configured
-> export works
```

## Responsive Verification

Tối thiểu kiểm tra representative widths:

- ~360px
- ~768px
- ~1024px
- ~1440px
- wide desktop khi module phụ thuộc container

Không hard-code test theo device brand.

## Database Verification

- clean migration;
- seed/bootstrap;
- CRUD persistence;
- unique constraints;
- soft delete behavior;
- partial indexes quan trọng;
- transaction rollback ở flows nhạy cảm.

## Security Test Baseline

- unauthorized API;
- IDOR/object access;
- role escalation;
- invalid file upload;
- XSS payload ở rich text/input;
- CSRF nếu session/cookie architecture yêu cầu;
- rate limit ở auth/form/chat endpoints;
- secret exposure.

## Test Evidence Format

Mỗi test run ghi:

- date/time;
- environment;
- commit/hash nếu có;
- command;
- result;
- failures;
- screenshots/log location nếu có.
