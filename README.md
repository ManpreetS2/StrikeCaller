# StrikeCaller

**Hear the combo. Set the pace. Build the reaction.**

StrikeCaller is a browser-based Muay Thai training coach that speaks realistic combinations during shadowboxing, bag work, pad work, or solo drills. It adapts timing to each technique, supports orthodox and southpaw stance, and keeps the athlete in control of pace, call style, and round structure.

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

Everything runs in the browser. Preferences, favorites, custom combos, and session history store locally. There is no backend, account system, analytics, or advertising in this MVP.

## Local setup

```bash
npm install
npm run dev
```

Other scripts:

```bash
npm run typecheck
npm test
npm run build
npm run preview
```

Requirements: Node.js 20+ and a modern browser. Speech uses the Web Speech API when available; captions and tones remain usable when speech is unsupported.

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
