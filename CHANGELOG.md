# Changelog

## 1.3.3 — 2026-09-11

### Reliability, Recovery & Workout Consistency

#### Workout configuration integrity

- Saved Minimal Mode now applies consistently across Quick Start, Daily, Learn, Builder, and onboarding, while explicit Train overrides stay authoritative.
- Timing multipliers follow new workouts from every entry point, and Builder custom pace uses the saved custom multiplier.

#### Builder integrity

- Deleting a combo that is currently being edited no longer resurrects the deleted ID on Save.

#### Daily Drill reliability

- Open Daily pages refresh safely across local date changes.
- A stale post-midnight click cannot start a different invisible combo.
- Original-session midnight completion behavior is unchanged.

#### Session lifecycle

- Ending or completing a workout uses a dedicated finishing state instead of live Round chrome.
- Back cannot leave Session during save and later get yanked to Summary.
- Summary navigation and history write happen once.
- Minimal mode hides the next-technique preview whether it is set before start or toggled live.

#### Storage and backup integrity

- Export can recover valid current in-tab state after a failed durable write.
- Current-generated backups remain importable.
- Invalid salvaged future history cannot poison generated backups.

#### Stats/time integrity

- Implausibly future imports are rejected.
- Future salvaged rows stay out of Stats, Home, streaks, and milestones.
- Stats use a deterministic supplied clock.

#### Accessibility

- Pending confirmation dialogs contain focus correctly, including when both actions are disabled.
- Stacked dialogs coordinate ownership.
- Train radio groups support arrow-key navigation.

StrikeCaller remains local-first. There is no account, cloud sync, service worker, or offline cache in this release.

## 1.3.2 — 2026-09-09

### Data & Identity Integrity

- Session summaries now use collision-resistant IDs minted once per session while legacy timestamp IDs remain compatible.
- Strict import rejects duplicate session and custom-combo identities before writes.

### Daily Drill Integrity

- Strict Daily Drill imports now enforce canonical date-key, martial-art, combo, and map-key consistency.
- Corrupted local Daily combo IDs recover deterministically to the correct martial art without discarding phase progress.

### Action Reliability

- Guarded primary actions recover after synchronous throws and rejected async work without permanent lockout or hook-created unhandled rejections.

### Security / Maintenance

- Updated Vitest and `@vitest/mocker` to 4.1.11 to remediate GHSA-82fw-gwwq-j7x9 in dev/test tooling.
- `npm audit` and `npm audit --omit=dev` report 0 vulnerabilities.

StrikeCaller remains local-first. Multi-tab state synchronization remains out of scope.

## 1.3.1 — 2026-09-08

### Reliability & Data Integrity

- Hardened workout-history clearing, importing, initialization, and legacy migration so stale or in-flight writes cannot silently resurrect old sessions.
- Improved partial-failure handling so local storage and IndexedDB mutations report their real durable state instead of claiming success after incomplete cleanup.
- Added stricter custom-combo validation across import, persistence, Train Again, historical reuse, and SessionEngine runtime execution.

### Session & Training Correctness

- Direct or malformed `/session` routes no longer fabricate a default workout; invalid session-start state now shows an honest unavailable-session screen.
- Generator filters now remain authoritative across curated, rule-based, and fallback paths, including defense, movement, knees, elbows, clinch, head kicks, martial-art compatibility, and difficulty.
- Finite Train Again queues safely finish without falling back to unrelated generated combinations.

### Mobile & Daily Reliability

- Hardened Screen Wake Lock ownership so overlapping requests, stale release callbacks, pending teardown, and release failures cannot leak or misreport wake-lock state.
- Daily Drill phases now remain attached to the civil date on which they were started, including workouts that cross midnight and Daily pages left open overnight.

### Summary Recovery

- Saved summary routes now distinguish a truly missing workout from temporarily unavailable history storage and provide an explicit retry path.

### Security / Maintenance

- Includes the already-reviewed dev/build-only NanoID advisory remediation in the Vite → PostCSS chain (`3.3.16 → 3.3.18`). StrikeCaller source does not import NanoID; runtime dependencies are unchanged.

StrikeCaller remains local-first. There is no account, cloud sync, service worker, or offline cache in this release.

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
