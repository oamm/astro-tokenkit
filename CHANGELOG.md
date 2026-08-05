# Changelog

## 1.0.51 - 2026-08-05

- Scoped ETag support to individual GET requests with `{ etag: true }`, preventing conditional requests from being forced across an entire client.

## 1.0.50 - 2026-08-05

- Added opt-in, per-request ETag support for conditional GET requests through `{ etag: true }`.
- Reused cached GET response data when the server returns `304 Not Modified`.
- Added regression coverage for ETag request and response handling.

## 1.0.49 - 2026-08-02

- Added `api.refreshSessionAsync()` to manually force a refresh even when the current access token is still valid.
- Added per-call manual refresh headers through `RefreshOptions` for debugging tenant-specific or diagnostic refresh requests.
- Documented manual refresh usage and added regression coverage for forced refresh of an unexpired session.

## 1.0.48 - 2026-08-01

- Added dynamic `resolveHeaders(ctx, options)` support for regular API requests, login, refresh, and logout.
- Included resolved refresh headers in the refresh single-flight key so tenant-specific refreshes are isolated.
- Added regression coverage for dynamic headers sourced from the current Astro request context.

## 1.0.47 - 2026-08-01

- Added ISO timestamps to TokenKit logger output using the `[TokenKit] [timestamp]` prefix format.
- Preserved debug gating, scoped log labels such as `[refresh]` and `[auth]`, and sanitized log details.
- Added regression coverage for timestamped logger output.

## 1.0.46 - 2026-08-01

- Added configurable login and refresh URL query parameters with `auth.loginParams`, `auth.refreshParams`, and per-request `params` overrides.
- Supported login calls such as `api.login(credentials, { params: { token_duration_minutes: 30 } })` without hardcoding auth-server-specific parameter names.
- Added sanitized auth debug diagnostics for login requests, token storage timing, and read-only session expiry decisions to help diagnose invalid tokens caused by duration or clock-skew rules.
- Added regression coverage for auth URL query parameters and sanitized expired-token logging.

## 1.0.45 - 2026-07-30

- Added detailed debug diagnostics throughout the token refresh flow, including storage state, expiry timing, policy decisions, request/response timing, parser status, and token persistence events.
- Kept refresh diagnostics sanitized by logging token presence and length instead of raw access or refresh token values.
- Added regression coverage to ensure refresh debug logs do not expose raw token values.

## 1.0.44 - 2026-07-28

- Prevent session-backed middleware checks from destroying or mutating Astro sessions when no TokenKit token record exists.
- Treat empty session-backed TokenKit state as anonymous instead of malformed, while still clearing malformed partial token records.
- Make browser activity keepalive opt-in with `idle.keepAlive: true` so multi-page sites do not create extra same-origin requests on login or public pages.
- Documented the safer keepalive default and added regression coverage for empty session-backed auth checks and opt-in keepalive behavior.

## 1.0.43 - 2026-07-28

- Preserve refreshable Astro session-backed token records during read-only expired session checks so middleware or `getValidSessionAsync()` can renew them instead of destroying the full session.
- Refresh expired session-backed tokens before `api.logout()` calls the configured logout endpoint, then destroy the local Astro session after revocation.
- Mark idle logout for server-side cleanup even when no remote logout endpoint is configured.
- Add throttled active-session keepalive requests so active multi-page and SPA sessions continue reaching Astro middleware for token refresh.
- Documented session-backed multi-page usage, idle keepalive options, and logout termination behavior.
- Added regression coverage for session-backed read-only expiry checks, logout revocation after refresh, idle cleanup marking, and active keepalive throttling.

## 1.0.42 - 2026-07-22

- Added `api.getValidSessionAsync()` for retrieving a valid session while refreshing expired tokens when possible.
- Added regression coverage for refresh-capable session reads with session-backed token storage.
- Documented `getValidSessionAsync()` for route code that needs a usable access token.

## 1.0.41 - 2026-07-22

- Added a targeted error when `getSession()` is used with async session storage, directing callers to `getSessionAsync()`.
- Added regression coverage for direct session reads through `getSessionAsync()` with session-backed token storage.
- Documented that session-backed routes should use `await api.getSessionAsync()`.

## 1.0.40 - 2026-07-21

- Added sanitized effective request headers to API, network, and timeout errors so multipart upload failures can be diagnosed without exposing authorization or cookie values.
- Added regression coverage for FormData upload errors with redacted sensitive headers.

## 1.0.39 - 2026-07-21

- Fixed `FormData` uploads so globally configured `Content-Type` headers are removed before `fetch`, allowing the runtime to set the multipart boundary.
- Added regression coverage for multipart uploads when TokenKit has default JSON headers configured.

## 1.0.38 - 2026-07-21

- Fixed `uploadFiles()` so explicit file `contentType` values are honored for `Blob` and `File` inputs.
- Preserved existing `Blob.type` values when `uploadFiles()` is called without an explicit file `contentType`.
- Added regression coverage for multipart file part MIME handling with `Blob` inputs.

## 1.0.37 - 2026-07-20

- Added exported MIME upload helpers: `MIME_TYPES`, `getDocumentMimeType()`, `normalizeMimeType()`, `isMultipartFormData()`, and `shouldSetContentTypeHeader()`.
- Updated raw upload handling so bare `multipart/form-data` is not set as a `Content-Type` header without a boundary.
- Documented MIME helper usage for document, multipart, and octet-stream uploads.

## 1.0.36 - 2026-07-19

- Updated `uploadFiles()` so the `name` value maps to the server's `Name[index]` multipart field.
- Added `filename` to `UploadFileInput` for controlling the multipart file part filename separately from the document name.
- Added regression coverage for the Lynx storage upload shape using `files[0]`, `files[1]`, `Name[0]`, and `Name[1]`.

## 1.0.35 - 2026-07-19

- Added raw request body support through `RequestConfig.body` so callers can send `FormData`, `Blob`, `ArrayBuffer`, and other fetch `BodyInit` payloads without JSON serialization.
- Added `api.send()` and `api.sendBytes()` helpers for concise raw-body and `application/octet-stream` requests.
- Added `api.uploadForm()` and `api.uploadFiles()` helpers for multipart uploads while preserving TokenKit base URL, auth injection, timeout, retry, and SSL configuration.
- Defaulted `uploadFiles()` multipart field names to indexed document upload fields: `files[index]` and `Name[index]`, with overrides still available for custom APIs.
- Documented binary and file upload usage and added regression coverage for raw bodies, octet-stream requests, and multipart uploads.

## 1.0.34 - 2026-07-18

- Refresh sessions when a refresh token remains available but access-token metadata has expired or gone missing.
- Keep cookie-backed access-token metadata available for the refresh-token lifetime while still treating expired sessions as inactive in read-only session helpers.
- Destroy the full Astro session for session-backed auth cleanup when `ctx.session.destroy()` or a custom provider `destroy(ctx)` hook is available.
- Prevent idle logout from being undone by the next navigation by setting an idle marker that middleware uses to clear auth state and skip refresh.
- Treat client-side navigation as idle activity while keeping idle monitoring from reactivating authenticated sessions.
- Added regression coverage for refresh-token-only recovery, idle logout cleanup, full Astro session destroy, and SPA navigation idle behavior.

## 1.0.33 - 2026-07-15

- Clear TokenKit storage when persisted token records are incomplete, expired beyond refresh, or refresh returns no bundle.
- Require access token, refresh token, and access expiry before `getSession()` or `getSessionAsync()` returns a session.
- Keep TokenKit scoped to token validity by clearing invalid TokenKit data without deciding app-level SessionKit user validity.
- Added regression coverage for missing token fields, failed expired refresh cleanup, and successful refresh persistence.

## 1.0.32 - 2026-07-09

- Added `auth.onSessionInvalid(error, ctx)` for malformed stored sessions where refresh cannot be attempted.
- Added session-storage regression coverage showing how consumers can clean up invalid session records.

## 1.0.31 - 2026-07-09

- Updated development packages: Astro 7.0.7, `@types/node` 26.1.1, and Vitest 4.1.10.
- Added pnpm build approvals for `esbuild` and Astro's optional `sharp` image dependency.

## 1.0.30 - 2026-07-05

- Fixed Astro context lookup across separately bundled server chunks by sharing the default AsyncLocalStorage through a process-wide symbol.
- Added regression coverage for isolated context module instances.

## 1.0.29 - 2026-07-02

- Added configurable token storage with opt-in Astro session-backed storage.
- Added async session/auth helpers for session-backed token reads.

## 1.0.28 - 2026-06-28

- Fixed TLS bypass requests by pairing external `undici.fetch` with its own `Agent`, avoiding dispatcher compatibility errors in Node's built-in `fetch`.

## 1.0.27 - 2026-06-28

- Added Astro 7 peer dependency compatibility (`^7.0.0`).
- Upgraded the local development and test environment to Astro 7.0.3.
- Refreshed development tooling dependencies for the Astro 7 compatibility test pass.
