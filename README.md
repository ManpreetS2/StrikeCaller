# StrikeCaller v1.2.2 — GitHub Pages Availability Hotfix

**Hear the combo. Set the pace. Build the reaction.**

StrikeCaller is a browser-based striking coach for **Muay Thai** and **Boxing**. It speaks realistic combinations during shadowboxing, bag work, pad work, or solo drills, with adaptive pacing, timed rounds, and local training stats.

Version **1.2.2** is an availability hotfix: the GitHub Pages base path is now derived from GitHub's canonical, case-sensitive Pages URL so the published app's JavaScript and CSS load correctly (no more blank page or generic 404). Workout, Session, audio, routing, stats, storage, and onboarding behavior are unchanged.

225+ realistic combinations across Muay Thai and Boxing. Free. No account. No download.

StrikeCaller tracks training activity, not technique quality or accuracy.

## Live demo

**[Launch StrikeCaller](https://manpreets2.github.io/StrikeCaller/)**

Public site: [manpreets2.github.io/StrikeCaller](https://manpreets2.github.io/StrikeCaller/)  
Repository: [github.com/ManpreetS2/StrikeCaller](https://github.com/ManpreetS2/StrikeCaller)

No GitHub login is required to use the app.

## Problem

Most combo timers treat every strike the same. A jab and a rear body kick do not deserve the same pause. Random technique strings also ignore stance, weight transfer, range, and safe exits. StrikeCaller is built so every call is trainable — not just noisy.

## Realistic combo philosophy

Combinations are curated first and generated second.

- Curated combos are the primary source and are manually reviewable as structured data.
- The generator may only assemble techniques using explicit compatibility rules.
- Sequences respect stance, side, weight transfer, range, recovery, defensive responsibility, and exits.
- Beginner work stays simple and repeatable; advanced work adds layers, not empty length.

Most combinations contain 2–5 offensive techniques, with optional defense and movement.

## Names, numbers, and hybrid calls

| Mode | Behavior |
|------|----------|
| **Names** | “Jab, cross, rear low kick” |
| **Numbers** | Boxing numbers `1–6` where clear; Muay Thai techniques keep short named calls |
| **Hybrid** | “One, two, lead hook, rear low kick” |

Numbers are never forced onto techniques where numbering would confuse the athlete.

## Training modes

- **Learn Mode** — study one combo, step through techniques, practice with slow calls
- **Coach Mode** — continuous combinations with adaptive pacing
- **Round Mode** — rounds, rest, bells, ten-second warning, summaries
- **Reaction Mode** — offense, defense, counters, and movement with valid sequences
- **Custom Combo Builder** — tap techniques, validate transitions, save locally
- **Daily Drill** — one focused combo across slow, normal, and fight-pace attempts
- **Guided Demo** — 60-second recruiter-friendly round using the real engines

## Adaptive timing

Each technique carries execution, recovery, and transition timing. Kicks, knees, defense, and movement receive more time than jabs. Pace presets:

Learn · Slow · Technical · Normal · Fast · Fight pace · Custom

Category multipliers and a global pace control are available. Unsafe or unusably fast timing is clamped, with a warning when pace may be too fast for technical practice.

## Stance support

Orthodox and southpaw are first-class. Technique language stays lead/rear by default, with an optional left/right display mode. Movement directions mirror for southpaw so left/right calls stay coherent.

## Technique library

Strongly typed techniques across:

Punches · Kicks · Teeps · Knees · Elbows · Defense · Movement · Counters · Clinch

Each technique includes timing, range, difficulty, follow-up rules, coaching cues, and safety notes where appropriate. Head kicks, elbows, knees, and clinch work can be filtered by equipment and preference.

## Combo validation

Validation checks:

- stance consistency
- side / weight-transfer consistency
- range transitions
- incompatible follow-ups
- recovery after committed strikes
- reasonable length
- defensive responsibility warnings
- valid exits for clinch sequences

## Themes

Dark, Light, and System themes with persistence. Dark is a fight-gym charcoal identity; light uses warm concrete tones with the same professional structure.

## Privacy

Everything runs in the browser. Preferences, favorites, custom combos, and session history store locally on the device. There is no backend, account system, analytics, advertising, or remote sync in this MVP.

## Local development

```bash
npm install
npm run dev
```

Other scripts:

```bash
npm run typecheck
npm test
npm run build
npm run build:pages
npm run preview
```

- `npm run build` — production build with base `/` for local or root hosting
- `npm run build:pages` — production build for GitHub Pages; the base path is derived from GitHub's canonical Pages URL via `PAGES_BASE_URL` (falling back to `/StrikeCaller/` locally)
- `npm run verify:pages` — validate the generated `dist/` artifact (correct base, existing local assets, expected title) before deploy

Requirements: Node.js 20+ (22 LTS recommended) and a modern browser.

## GitHub Pages deployment

The public site is published to GitHub Pages at the canonical URL **https://manpreets2.github.io/StrikeCaller/**. GitHub Pages paths are case-sensitive, so the exact casing matters.

There is exactly one authoritative deployment path:

- **Deploy GitHub Pages** (`.github/workflows/deploy-pages.yml`) — configures Pages first, passes GitHub's canonical Pages URL to the Vite build via `PAGES_BASE_URL`, verifies the artifact (`npm run verify:pages`), publishes the `dist` artifact via Actions, and then runs a `verify-live` job that fails unless the public URL and its JS/CSS assets return HTTP 200.
- **CI** (`.github/workflows/ci.yml`) — typecheck, test, and build on pushes and pull requests to `main`.
- **Pages Diagnostics** (`.github/workflows/pages-diagnostics.yml`) — a manual (`workflow_dispatch`), read-only workflow that inspects the live Pages configuration and asset availability without rebuilding.

Pages source must be **Settings → Pages → Build and deployment → Source → GitHub Actions**. Do not publish from a `gh-pages` branch; that would create a second, competing publication system.

Routing uses `HashRouter` so deep links and refresh work on GitHub Pages without server rewrites (for example `https://manpreets2.github.io/StrikeCaller/#/train`).

Local Pages build:

```bash
npm run build:pages
npm run verify:pages
```

## Supported browsers and feature limits

- Best on current Chrome, Edge, Firefox, and Safari
- Spoken calls use the Web Speech API when available; captions and tones remain usable when speech is unsupported
- Round bells and countdown tones use the Web Audio API after a user gesture starts a session
- Vibration and screen wake lock are optional and device-dependent
- Voice quality depends on voices installed in the browser/OS

## Testing

Deterministic Vitest + Testing Library coverage includes combo validation, timing, call styles, storage safety, training surfaces, session controls, and accessibility labels. Tests do not require the public internet.

## Release notes — v1.2.2

GitHub Pages availability hotfix:

- The Vite Pages base is derived from GitHub's canonical Pages URL (`PAGES_BASE_URL` from `actions/configure-pages`) instead of a hardcoded, mis-cased `/strikecaller/`. This restores the app's JavaScript/CSS on the case-sensitive Pages path and fixes the blank page / generic 404 seen on the public site.
- The deploy workflow now configures Pages before building, validates the built artifact (`scripts/verify-pages-build.mjs`), and adds a post-deploy `verify-live` job that confirms the public URL and its assets return HTTP 200.
- Added a manual, read-only `Pages Diagnostics` workflow.
- Web manifest `start_url` now opens the app's root hash route under the project base; all displayed links use the canonical `https://manpreets2.github.io/StrikeCaller/`.
- No changes to workout generation, Session behavior, audio timing, hash routing, stats, storage, or onboarding.

## Release notes — v1.2.1

Mobile gym experience:

- Session rebuilt for portrait phones: large technique, large timer with labeled states, thumb-zone control dock, safe-area padding
- Active Session hides app navigation; End Session + blocker remain the exit path
- Minimal Mode trimmed for gym use and preference persistence
- Audio primed from Start gestures; visibility interruptions pause safely and cancel stale speech
- Wake lock tip (dismissible); optional home-screen install via web manifest
- Home, Onboarding, Train, Builder, and Stats tuned for one-handed phone use

Workout generation, finite queues, Train Again, Daily Drill, stats math, and hash routing are unchanged.

## Release notes — v1.2.0

Interactive visual polish only:

- Dimensional inline SVG icon system for sports, modes, categories, metrics, and presets
- Restrained motion (press, select, technique change, stats count-up, milestone unlock)
- Home hero illustration, sport/Quick Start identity, clearer empty states
- Onboarding step illustrations with progress chips
- Customize Workout sport/mode visuals and collapsible section icons
- Session call-change flash, timer warning states, category cue (non-minimal)
- Combo Display progression path; Builder sport/category identity
- Full `prefers-reduced-motion` support

Workout logic, routing, speech, stats math, and data schemas are unchanged from v1.1.3.

## Limitations

- StrikeCaller does **not** evaluate technique quality, power, speed, accuracy, or calories burned.
- There is **no motion tracking** in the MVP.
- Combinations are training drills and common tactical sequences — **not** guarantees of fight performance.
- Clinch, elbows, and some knee work need appropriate equipment or a partner; the app will warn or filter where practical.
- Voice quality depends on the browser’s installed speech voices.
- Visual polish uses CSS/SVG only — no WebGL or 3D scene.

## Safety

Warm up. Use appropriate equipment. Keep enough clear space. Prioritize balance and control. Prefer qualified coaching. Avoid hard contact without supervision. Stop for pain, dizziness, or injury.

StrikeCaller is a training aid, not medical advice, sparring supervision, or a replacement for a coach.

## Future martial arts

Muay Thai and Boxing are available now. Kickboxing, MMA striking, Karate, and Taekwondo are labeled **Coming soon** — no fake functionality is exposed.

## Author

**Manpreet Singh**  
Computer Science Student at De Anza College

Built as a portfolio project exploring adaptive audio coaching, structured combat-sport training data, rule-based combination generation, accessible workout design, and full-stack product engineering.

## License

MIT
