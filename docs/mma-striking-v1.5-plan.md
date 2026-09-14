# MMA Striking v1.5

## 1. What it means

MMA Striking is a third spoken striking sport: shorter mixed combinations, hands into kicks, recovery after committed kicks, angle/defense exits, and takedown-aware distance. It uses the existing spoken-drill model.

## 2. What it is not

Not full MMA. No BJJ, wrestling teaching, takedown techniques, ground work, submissions, cage grappling, kickboxing-as-a-sport, or fake scoring.

## 3. Reuse

`MartialArt` on configs/sessions, `combo()` helper, `filterCombos`, eligibility engine, Daily key/phases, Builder validation, Session chrome, import allowlists.

## 4. New work

- Promote `mma-striking` from `ComingSoonArt` into `MartialArt`
- Tag shared punches/defense/movement plus selected kicks/tees/knees/elbows
- 75 curated MMA combos (`mma-*` IDs)
- MMA generator: shorter sequences, no stacked committed kicks, prefer an exit after a kick
- Labels, Home/Train/Daily/Builder/Stats/Quick Starts, Daily pool/regex

## 5. UI

Home chips, Train 3-card selector, Onboarding, Settings, Builder, Daily, Stats filters/breakdown, SportVisual, AppLayout subtitle.

## 6. Compatibility

`MARTIAL_ARTS` gains `mma-striking`. Missing/legacy `boxing` and `muay-thai` still load. Unknown sports still rejected. No destructive rewrite of history, prefs, favorites, custom combos, or Daily.

## 7. Tests

Sport model, curated counts (300 / 125 / 100 / 75), generator constraints, Home/Train/Daily/Builder/Session/import, PWA offline where practical.
