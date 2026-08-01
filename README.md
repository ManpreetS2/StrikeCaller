# StrikeCaller v1.1 — Boxing & Training Stats

**Hear the combo. Set the pace. Build the reaction.**

StrikeCaller is a browser-based striking coach for **Muay Thai** and **Boxing**. It speaks realistic combinations during shadowboxing, bag work, pad work, or solo drills, with adaptive pacing, timed rounds, and local training stats.

Version **1.1.1** is a correctness patch for Customize Workout handoff, custom combo training, session controls, history/stats, and JSON import hardening.

225+ realistic combinations across Muay Thai and Boxing. Free. No account. No download.

StrikeCaller tracks training activity, not technique quality or accuracy.

## Live demo

**[Launch StrikeCaller](https://manpreets2.github.io/strikecaller/)**

Public site: [manpreets2.github.io/strikecaller](https://manpreets2.github.io/strikecaller/)  
Repository: [github.com/ManpreetS2/strikecaller](https://github.com/ManpreetS2/strikecaller)

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
- `npm run build:pages` — production build with base `/strikecaller/` for GitHub Pages

Requirements: Node.js 20+ (22 LTS recommended) and a modern browser.

## GitHub Pages deployment

The public site is published to GitHub Pages at `/strikecaller/`.

- **CI** (`.github/workflows/ci.yml`) — typecheck, test, and build on pushes and pull requests to `main`
- **Deploy GitHub Pages** (`.github/workflows/deploy-pages.yml`) — builds with `npm run build:pages` and publishes the `dist` artifact via Actions

Routing uses `HashRouter` so deep links and refresh work on GitHub Pages without server rewrites (for example `/strikecaller/#/train`).

Local Pages build:

```bash
npm run build:pages
```

If the Actions deploy workflow is not yet connected, enable Pages under:

Repository Settings → Pages → Build and deployment → Source → GitHub Actions

Until Actions deployment is connected, the repository may also publish from the `gh-pages` branch.

## Supported browsers and feature limits

- Best on current Chrome, Edge, Firefox, and Safari
- Spoken calls use the Web Speech API when available; captions and tones remain usable when speech is unsupported
- Round bells and countdown tones use the Web Audio API after a user gesture starts a session
- Vibration and screen wake lock are optional and device-dependent
- Voice quality depends on voices installed in the browser/OS

## Testing

Deterministic Vitest + Testing Library coverage includes combo validation, timing, call styles, storage safety, training surfaces, session controls, and accessibility labels. Tests do not require the public internet.

## Limitations

- StrikeCaller does **not** evaluate technique quality, power, speed, accuracy, or calories burned.
- There is **no motion tracking** in the MVP.
- Combinations are training drills and common tactical sequences — **not** guarantees of fight performance.
- Clinch, elbows, and some knee work need appropriate equipment or a partner; the app will warn or filter where practical.
- Voice quality depends on the browser’s installed speech voices.

## Safety

Warm up. Use appropriate equipment. Keep enough clear space. Prioritize balance and control. Prefer qualified coaching. Avoid hard contact without supervision. Stop for pain, dizziness, or injury.

StrikeCaller is a training aid, not medical advice, sparring supervision, or a replacement for a coach.

## Future martial arts

Muay Thai is available now. Boxing, Kickboxing, MMA striking, Karate, and Taekwondo are labeled **Coming soon** — no fake functionality is exposed.

## Author

**Manpreet Singh**  
Computer Science Student at De Anza College

Built as a portfolio project exploring adaptive audio coaching, structured combat-sport training data, rule-based combination generation, accessible workout design, and full-stack product engineering.

## License

MIT
