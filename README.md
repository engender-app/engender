# Gender Diary

A local-first, private diary for tracking gender transition — moods, gender
feelings on configurable scales, quick tags, notes, photos, milestones. Web
PWA + Android (Capacitor) from one SvelteKit codebase. No accounts, no
network requests, GPLv3. Full product spec in [prd.md](prd.md).

## Status

The **close-to-final frontend** is built and interactive: all 20 screens from
the PRD's screen list, 8 queer-flag palettes × light/dark, English + Polish,
walkable end to end on demo data. Design decisions and their history live in
[mockup/DESIGN.md](mockup/DESIGN.md) (the earlier static mockup in `mockup/`
is superseded by this app but kept for reference).

Not yet wired (Phase 1): SQLite persistence (SQLocal/OPFS + Capacitor
driver — the demo store behind `src/lib/data/` implements the same repository
interfaces), real photo storage, crypto for export/import, Capacitor shell,
notifications, real Rive assets (animated CSS stand-ins render in every Rive
slot and remain as fallbacks).

The app installs as a PWA and starts without a network. `src/service-worker.ts`
precaches the whole release into one cache per build version: app code,
SQLocal's worker and WASM, the bundled fonts and everything in `static/`. When
a new version is allowed to take over is deliberately not decided there. See
[ADR-0021](docs/adr/0021-the-offline-shell-is-one-document-and-one-cache-per-release.md).
`npm run dev` does not register it, since a precached shell would be served
ahead of every edit; `npm run verify:build` installs it, kills the network and
starts the app again.

## Development

```
npm install
npm run dev        # dev server with the demo control bar
npm run build      # static SPA bundle in build/ (adapter-static, no SSR)
npm run preview
npm run check      # svelte-check
npm run test:walkthrough  # the 15 walkable flows, in a real Chromium
```

`test:walkthrough` builds first (with the demo bar compiled in, since one
flow drives its jump-to-screen control) and serves that build, the same way
`verify:build` does - the dev server's dependency re-optimization forces a
mid-boot page reload that a static build doesn't have. It shares Chromium
launch and CHROMIUM_PATH override with `test:browser` and `verify:build`
via `tests/browser-harness.mjs`.

The dev/demo build shows a **demo bar** (theme toggle, phone-frame emulation,
reset demo state, jump-to-screen). It is compiled out of production builds
unless `VITE_DEMO=1`. The phone/desktop switch works by constraining the
app's container — the layout responds via container queries, the same
mechanism a resized browser window uses.

Demo state persists in `localStorage`; "Reset demo state" restores the Alice
persona. "Onboarding (first run)" in the jump list clears it and walks the
true first-launch flow. The demo import password is `demo` (any other input
shows the wrong-password state).

## Stack

SvelteKit + Svelte 5 (runes) + TypeScript, `adapter-static` SPA. Melt UI
builders where they exist today (slider, toggle); sheets are a small custom
dialog until Melt's Svelte 5 dialog lands. Paraglide for i18n (en/pl,
`messages/`). Hand-rolled SVG charts on `d3-scale` + `d3-shape`. Rive runtime
wired with graceful fallbacks. Fonts (Nunito, Baloo 2) bundled in
`static/fonts` — zero runtime network requests, verified against the built
bundle.

## Structure

```
src/
├── routes/              # the 20 screens (home, entry, calendar, day, search,
│                        # stats, recap, timeline, onboarding, settings/*)
└── lib/
    ├── components/      # MoodPicker, DimensionSlider, TagPicker, EntryCard,
    │                    # HeatMap, LineChart, RiveSlot, Sheet, DemoBar, …
    ├── theme/           # binding design tokens: 8 flag palettes × light/dark
    ├── styles/          # app shell + component + screen CSS (token-driven)
    ├── data/
    │   ├── repositories/  # PRD repository interfaces (demo implementation)
    │   ├── demo/          # Alice seed data
    │   └── db.svelte.ts   # reactive store, localStorage-persisted
    ├── stores/          # ui state, toasts
    └── paraglide/       # generated i18n runtime (gitignored)
messages/                # en.json, pl.json
static/fonts/            # bundled woff2 (OFL)
mockup/                  # Phase 0 static mockup (superseded, kept for reference)
```
