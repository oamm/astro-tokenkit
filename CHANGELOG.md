# Changelog

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
