# Changelog

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
