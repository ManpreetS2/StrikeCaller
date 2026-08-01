# AGENTS.md

## Cursor Cloud specific instructions

StrikeCaller is a single-package, **100% client-side** React 19 + TypeScript SPA built with Vite. There is no backend, database, secrets, or external services — everything runs in the browser and persists to `localStorage`. A single dev server is the only process needed to run the product end to end.

### Services

| Service | Command | Notes |
|---------|---------|-------|
| Vite dev server | `npm run dev` | Serves the whole app at `http://localhost:5173/`. This is the only service. |

Standard scripts are defined in `package.json` and documented in `README.md`; use those instead of duplicating commands here. Key ones: `npm run typecheck`, `npm test` (Vitest, deterministic, no network), `npm run build`, `npm run preview`.

### Non-obvious notes

- Node 22 is required (CI pins Node 22; README says 20+). The default VM `node` (v22) works — do not switch to an older nvm version.
- Lint uses **oxlint** but there is no `lint` npm script; run it directly with `npx oxlint`. It currently reports one pre-existing non-blocking warning in `src/context/AppContext.tsx` (`react/only-export-components`); that is expected, not something you introduced.
- The app uses `HashRouter`, so routes are hash-based (e.g. `http://localhost:5173/#/session`). Deep links won't work without the `#`.
- First run triggers a one-time onboarding flow (stance / experience / calling style) before a session starts; this choice is saved in `localStorage`, so subsequent "Quick Train" clicks start a session immediately. To re-test onboarding, clear the browser's site data / `localStorage`.
- Audio (spoken combos via Web Speech API, bells via Web Audio API) requires a user gesture and depends on browser/OS voices; captions and on-screen stats work regardless, so headless/automated verification should rely on the visible captions, round timer, and live stats rather than audio.
