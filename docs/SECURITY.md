# SECURITY.md

## Security Principles

- deny by default;
- least privilege;
- validate all untrusted input;
- authorize server-side;
- secure secrets;
- audit sensitive actions;
- safe defaults.

## Authentication

- secure password hashing nếu dùng local auth;
- secure session/token storage;
- expiration/rotation strategy;
- brute-force protection;
- secure recovery flow.

## Authorization

RBAC phải kiểm tra ở backend.

Model tối thiểu:

```text
Actor -> Role -> Permission -> Action/Resource -> Scope
```

Scope cần ADR: global/site/campus/resource ownership.

## Web Security

- XSS prevention;
- CSRF khi applicable;
- CORS explicit;
- CSP;
- secure cookies;
- clickjacking protection;
- safe redirects;
- SSRF protections cho URL fetch/import nếu có.

## API

- rate limiting;
- payload size limits;
- validation;
- no internal stack leak;
- object-level authorization/IDOR tests.

## Media Upload

- size limit;
- MIME verification;
- extension allowlist;
- random/object-safe filenames;
- private/public access rules;
- image processing isolation;
- malware scanning integration point nếu cần.

## AI/Chat

- provider API keys server-side;
- prompt/content boundaries;
- abuse/rate limits;
- PII handling policy;
- human handoff authorization;
- do not expose internal system prompts/secrets.

## Admin

- sensitive settings masked;
- audit log;
- elevated operations require stronger permission;
- session revocation.

## Release Gate

S0/S1 security issue unresolved -> release BLOCKED.
