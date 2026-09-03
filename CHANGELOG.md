# Changelog

## 1.3.0 — 2026-09-03

### Added

- Durable workout-summary links: a completed session can be reopened from `/#/summary/:sessionId` after refresh, without relying on transient router state.
- Production PWA install icons (192, 512, maskable) plus a 1200×630 Open Graph image.
- **Delete all local data** in Settings: two-step confirmation, StrikeCaller-owned keys only, truthful partial-failure reporting, and no `localStorage.clear()`.
- Production document metadata: canonical URL, Open Graph, and Twitter large-image tags. The browser title stays `StrikeCaller — Boxing & Muay Thai Combo Coach` (no version string).

### Improved

- Workout history now lives in IndexedDB, with one-time migration from leftover `strikecaller:history` localStorage.
- Imported and persisted user data is strictly validated; malformed records are not trusted into Stats.
- Local persistence failures are visible in the UI instead of failing silently.
- Audio and speech startup no longer blocks the session when the browser hangs or speech is unavailable.
- Real-browser coverage across Chromium, Firefox, WebKit, and iPhone-sized WebKit.

### Fixed

- Firefox could hang session resume while waiting on audio unlock.
- In-flight / pending history writes could race with later clears or deletes.
- GitHub Pages deploy is gated on verify, E2E, and a verified Pages artifact; only `main` deploys.
- Summary pages no longer go blank after a refresh when the session is still stored locally.

### Developer / Release

- Playwright release gate (Chromium, Firefox, WebKit, mobile WebKit, Pages Chromium).
- Oxlint runs with `--deny-warnings` in local `verify:release` and CI verify.
- Single CI deploy path with least-privilege Pages permissions and post-deploy live checks on `main`.
- Pages artifact verification for title, canonical/OG tags, install icons, and OG image dimensions.

StrikeCaller remains local-first. There is no account, cloud sync, service worker, or offline cache in this release.
