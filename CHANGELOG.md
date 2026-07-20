# Changelog

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
