# Gender Diary

A local-first, private diary for tracking gender transition — moods, gender
feelings on configurable scales, quick tags, notes, photos, milestones. Web
PWA + Android (Capacitor) from one SvelteKit codebase. No accounts, no
analytics, GPLv3. The hosted web app still uses network requests to its own
origin for the app shell and updates. Full product spec in [prd.md](prd.md).

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
SQLocal's worker and WASM, the bundled fonts and everything in `static/`. A new
release waits instead of taking over: `src/lib/pwa/update.ts` asks it to stop
waiting only once nothing is running that an activation must not land on, and
`src/lib/data/journal-busy.ts` is what answers that question. See
[ADR-0021](docs/adr/0021-the-offline-shell-is-one-document-and-one-cache-per-release.md).
`npm run dev` does not register it, since a precached shell would be served
ahead of every edit; `npm run verify:build` installs it, kills the network and
starts the app again.

## Privacy, security and support

- Privacy policy (English): [docs/privacy-policy.en.md](docs/privacy-policy.en.md)
- Polityka prywatności (polski): [docs/privacy-policy.pl.md](docs/privacy-policy.pl.md)
- Security disclosure process: [SECURITY.md](SECURITY.md)
- Support boundaries and safe diagnostics: [SUPPORT.md](SUPPORT.md)

## Development

```
npm install
npm run dev        # dev server with the demo control bar
npm run build      # static SPA bundle in build/ (adapter-static, no SSR)
npm run preview
npm run check      # svelte-check
npm run test:walkthrough  # the 15 walkable flows, in a real Chromium
npm run check:copy      # catalogue parity, and no new hardcoded copy
npm run check:licences  # every installed package's licence
node scripts/app-version.mjs   # what this checkout would build as
```

The version the build stamps into the app comes from a signed `v<semver>` tag
and from nowhere else, so ordinary builds are `0.0.0-dev` plus the commit
(ADR-0022). `GENDER_DIARY_VERSION` overrides it, which is how the release
pipeline hands one value to the bundle, the release notes and the Android
artifacts at once.

`check:copy` compares the two catalogues key by key and counts user-facing text
written straight into the markup. Hundreds of those literals are still there
from phase 0 and phase 1, so the check is a ratchet against
`messages/untranslated-literals.txt`: a count may not go up, and one that goes
down is recorded with `node scripts/check-copy.mjs --update`. A key the code
calls and no catalogue has is a type error already, so `npm run check` covers
that half.

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

## CI and releases

`.github/workflows/ci.yml` runs on pull requests and on `main`, since tickets
here merge locally and main is where work actually lands. It installs from the
lockfile and then splits: one job builds, type-checks, runs the Node tier and
the copy and licence checks; the other drives a real Chromium through the
browser tier, the walkthroughs and `verify:build`. A failed browser run keeps
its output as an artifact for a week - every fixture in it is synthetic, and no
job in that workflow is given a secret.

`.github/workflows/release.yml` runs on a `v*` tag. It reads the version once,
through `scripts/app-version.mjs`, so an unsigned tag or a tag on an edited tree
produces no release at all (ADR-0022); hands that string to everything else
through `GENDER_DIARY_VERSION`; takes the notes out of `CHANGELOG.md`; and
publishes a web bundle, a source archive and checksums.

```
node scripts/release-notes.mjs [version]   # what the release would say
node scripts/package-release.mjs           # bundle, source archive, checksums
```

Both refuse a development version, so a dry run of the whole path means handing
one over deliberately: `GENDER_DIARY_VERSION=1.2.3 node scripts/package-release.mjs`.
Packaging builds twice and stops unless both bundles have the same digest,
because a checksum over a bundle nobody can rebuild only says the download
arrived intact. Anyone else can repeat that from the published source archive,
which has no tags to read, so the version has to be handed over:

```
tar xzf gender-diary-src-1.2.3.tar.gz && cd gender-diary-1.2.3
npm ci && GENDER_DIARY_VERSION=1.2.3 npm run build
tar --create --sort=name --owner=0 --group=0 --numeric-owner --mtime=@0 \
    --format=gnu --directory=build . | gzip --no-name --best | sha256sum
```
 Every release section in `CHANGELOG.md` has to answer four
questions - schema changes, Archive format changes, security migrations,
minimum supported version - and the pipeline stops before it builds anything if
one of them is blank. Everything left in `dist/release/` is checksummed and
attached, which is how ticket 18's signed Android artifacts will join a release.

The DNS records, hosting credentials, store account and signing key that any of
this needs are steps a person has to take, and `scripts/provision.sh` walks
them. It says what each value is for before asking, writes secrets to the
protected `release` environment rather than into the repository, and skips what
a previous run finished. `DRY_RUN=1 scripts/provision.sh` performs nothing and
describes every step. [docs/provisioning.md](docs/provisioning.md) is the list
of what ends up where, and which ticket reads it.

## Stack

SvelteKit + Svelte 5 (runes) + TypeScript, `adapter-static` SPA. Melt UI
builders where they exist today (slider, toggle); sheets are a small custom
dialog until Melt's Svelte 5 dialog lands. Paraglide for i18n (en/pl,
`messages/`). Hand-rolled SVG charts on `d3-scale` + `d3-shape`. Rive runtime
wired with graceful fallbacks. Fonts (Nunito, Baloo 2) bundled in
`static/fonts` and served from the same origin as the app bundle, with no
runtime requests to third-party services.

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
