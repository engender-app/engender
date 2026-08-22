# Screens

The per-screen inventory `PRODUCT.md` has no room for. Written for whoever
designs the app next: every route, what it has to keep doing, where it is
reached from, and whether `.scratch/phase-5/ux/` is already committed to
changing it. A redesign that drops one of these capabilities has failed
regardless of how it looks; a redesign that reproduces a bug this repo has
already decided to fix (cited below by ticket number) has also failed.

**How to read an entry.** "Current" is what is true of the code today.
"Target" appears only where a ticket changes it, and names the ticket. No
target line means: design this screen as it behaves today. Tickets 01, 03
and 09 are merged; tickets 04 through 08 are written and agreed but not yet
built - designing for their target state is designing ahead of the code on
purpose, per `.scratch/phase-5/ux/spec.md`'s course correction.

**What this is not.** No visual or layout decision appears below - that is
the redesign's job (ticket 15), not this document's. Copy is quoted from
`messages/en.json` only to say what a screen does, not to freeze the words;
new wording is the copy tickets' job.

## Cross-cutting constraints

Stated once here rather than repeated 61 times.

- **8 palettes x 2 themes x disguise.** `src/lib/theme/palettes.css` defines
  `trans`, `nonbinary`, `genderfluid`, `bisexual`, `lesbian`, `pansexual`,
  `rainbow` and `agender`, each under `data-theme="light"` and
  `data-theme="dark"`. All 8 stay, whatever the visual language turns out to
  be (spec decision). Disguise mode (`prefs.disguise`) changes the app name
  and icon app-wide, not per screen, with one screen-level exception: the
  pride motif (`PrideAurora`, currently on Home and nine other screens) is
  Home-only and never renders under disguise (ADR-0035). A "Decoy notes"
  screen (`DecoyNotes.svelte`) covers the app on quick exit while disguised -
  it is not a route, renders no journal content, and its copy is fixed; it
  is still something a person sees and worth the designer's attention.
- **The a11y floor.** Usable at 390px width and at 200% zoom, touch targets
  >=44px, WCAG 4.5:1 contrast for body text (3:1 for large text), per
  `docs/ui-copy.md` and this spec. `tests/palette-contrast.test.ts` guards
  on-colour pairs across the full palette x theme cross product.
- **English and Polish.** Every user-facing string exists in both
  `messages/en.json` and `messages/pl.json` at key parity
  (`scripts/check-copy.mjs`). Polish runs longer than English on average;
  a layout that only fits the English string fails half the app's readers.
  Neither catalogue genders the reader.
- **Colour never judges.** ADR-0012: no diverging or red-to-green scale, no
  "worst" or "best" legend - a heat-map or chart is labelled with the active
  dimension's own endpoints. ADR-0025: mood keeps its own fixed four-preset
  scale (amber, teal, plum, moss), chosen independently of the gender
  palette, and is not touched by this effort.
- **The shell's safe-area defect is a functional requirement, not a visual
  one.** Only the bottom inset is honoured today; there is no
  `viewport-fit` declaration, so a device with a screen cutout can render a
  screen's top content under the status bar. Bottom-bar clearance depends
  on one padding rule applied by the standard screen wrapper - a screen
  that doesn't use it, or overrides its padding, is not guaranteed clear of
  the bar. (This came from the now-deleted ticket 13; there is no ticket
  file to point to any more, but the defect is still on `main`.) The
  redesign has to declare `viewport-fit=cover` and consume both insets
  robustly, not just carry the current look forward.
- **Android launch routes are a pinned contract.** `/entry/new/[day]`
  (+ `seedMood=1..5`), `/` (+ `?tally=misgendered|correctly_gendered`),
  `/doubt`, `/wrapped/[week|month|year]`, `/on-this-day`
  (+ `?lookback=month|sixMonths|year`), and `/settings/reminders/[id]` are
  deep-link targets whose accepted query shapes are pinned by
  `src/lib/android/fixtures/launch-routes.json` (ADR-0028). A redesign of
  any of these screens must keep reading the same params the same way; it
  must not touch the fixture itself (unchanged by every ticket in this
  spec except 07, which removes `/recap`, never listed there).
- **Loading state is a reference-data/entry-data question, not a visual
  one.** Per `CONTEXT.md`: reference data (gender dimensions, presets, tag
  groups/tags, milestones, body regions, measurement types, effect
  categories, the personal-effects catalogue, preferences) is held in
  memory and read synchronously - no loading state. Entry data (entries,
  search, stats, tag insights, recap) is unbounded and read a query at a
  time via `liveQuery` - every screen reading it needs a loading state,
  most already use the `Skeleton` component. Each entry below says which it
  is.

## Chrome (not itself a route)

- **Bottom bar / desktop rail.** Four tabs: Home (`/`), Calendar
  (`/calendar`), Stats (`/stats`), and a fourth tab whose `href` is `/more`
  and whose label is "More" - its internal `key` stays `'settings'`
  deliberately (ADR-0036; the walkthrough and `activeTabKey` key off it).
  Tab lighting is table-driven (`src/lib/navigation/active-tab.ts`, ticket
  09): every route below maps to exactly one tab, including seven that
  matched nothing before that ticket (`/body-map`, `/compare`, `/doses`,
  `/doubt`, `/tally`, `/entry/*`, `/on-this-day`).
- **Quick add** (the bottom bar's centre button). Current: a sheet offering
  "today" and a backdated entry, both landing on the entry editor.
  **Target (ticket 04, not yet built):** widened to a mood, an entry
  (today or backdated, unchanged), both tally directions, a dose, and a
  photo - each option landing on the surface that records that thing, with
  the existing today/backdate behaviour preserved exactly. Every feature
  surface keeps its own in-context add control regardless; quick add never
  replaces one. Restyling the sheet is the redesign's job now (ticket 04's
  own text still says "ticket 13" - that ticket is deleted; ticket 15 owns
  it).
- **Per-screen headers.** Inconsistent today - some screens carry a
  `screen-header`/`screen-title` pair, some don't. Unifying this was the
  now-deleted ticket 13's job; it is ticket 15's now.

## Pre-unlock, gates, and onboarding (chromeless - no tab bar, no rail)

`src/routes/+layout.svelte` renders these instead of any tab content; none
of the routes below light a tab, and none show journal data.

- **Lock gate** - PIN/biometric unlock, shown whenever `isLocked()`.
- **Passphrase gate** - the journal can't open yet; asks for the passphrase.
- **Authentication gate** (Android only) - Keystore needs the platform's
  word for who is present, before it releases the data key.
- **Device-recovery gate** - a passphrase-conversion running, or one that
  couldn't start.
- **Schema-too-new gate** - older app code against a newer journal; tells
  the person what to do rather than showing a generic boot error.
- **`/settings/lock`** - also chromeless. Sets or previews the PIN
  (`?setup=1` from onboarding vs. reached from Settings); redirects away if
  there's nothing to set or try.
- **`/onboarding`** - 5 steps: name, gender preset pick, app-lock offer,
  finish. Sets `prefs.onboarded` and sends a new user to Home, not Settings.

## Home tab

### `/` (Home)

**Current.** Header with app name, greeting, streak line. Conditionally: a
celebration card (transition anniversary), a stale-backup notice
(dismissible). Then, unconditionally: a compact mood picker ("how are you
feeling"), a Wrapped teaser card (gated on `prefs.wrappedEnabled`), an
on-this-day teaser card (gated on `prefs.onThisDayEnabled`, separately), a
tally card (misgendered/correctly-gendered buttons), a persistent doubt-
journal card (`/doubt`, always visible, no gate). A milestones section
(up to 4 upcoming, or an empty-state pointing at `/settings/milestones`) with
a link to `/timeline`. A "last seven days" section holding the week strip,
metric-switchable via a sheet. A "recent entries" section reading the last 5
logged days with **no row cap** (`recentDays(5)` returns every entry from
those days), each rendered as an `EntryCard`, or an empty state offering
"new entry". Renders `PrideAurora` behind everything (the motif this spec's
problem statement documents as painting over cards - not yet fixed on
`main`; ticket 15 designs its Home-only replacement, ADR-0035).

**Target (tickets 04 and 08, not yet built).**
- Tally buttons removed from Home; both directions move into quick add.
- The doubt-journal card moves to the More hub (still one tap away, no
  longer an unconditional daily prompt); the doubt flow itself
  (`/doubt`) is unchanged, only its entry point moves.
- The Wrapped and on-this-day teasers merge into one look-back card that
  offers whichever has something to show (or both); each preference gate
  still silences its own half.
- Recent entries get a cap, with a link to see the rest (`/calendar`).
- Everything not listed above (celebration, backup notice, mood picker,
  week strip, milestones) is explicitly unchanged.

Entry-data screen (recent entries, loading state via `Skeleton`).

### `/doubt`

The doubt journal: writing a doubt entry, and a counterevidence view that
reads back starred entries and euphoria-tagged entries. Reached from Home
today; **target (ticket 08):** reached from the More hub instead, screen
itself unchanged. Entry-data screen, has a loading state.

## Calendar tab

- **`/calendar`** - month heat map, coloured by a switchable metric
  (mood or an active gender dimension), a metric-picker sheet.
- **`/day/[day]`** - every entry logged on one day; `day` may be `today` or
  an epoch-day number.
- **`/search`** - filtered entry search (tags, mood, date range), paginated
  30 hits at a time, no infinite scroll.
- **`/search/starred`** - every starred entry and starred photo, unbounded
  by design (a person only stars what they choose to, unlike the journal
  itself).
- **`/entry/[id]`** - the entry editor for an existing entry. Wrapped in
  `{#key page.params.id}` so navigating from one entry straight to another
  on the same route remounts rather than reusing stale state - preserve
  that wrapper in any redesign, it is the fix for a real stale-params bug
  class, not incidental structure.
- **`/entry/new/[day]`** - the entry editor for a new entry, seeded from
  `?seedMood=1..5` where a caller (quick add, the widget, a notification)
  supplies one. Pinned Android launch-route target.

All entry-data screens; all but the empty/loading state need one.

## Stats tab (the "look-back" group)

Everything here reads the same aggregate seam (`stats.recap()` /
`dayAverages()`) or is reached from Stats. All entry-data, all need a
loading state.

- **`/stats`** - the hub: correlation cards, a metric trend chart, tag
  insight sheets, and cards linking out to `/body-map`, `/tally`,
  `/recap` (month and year), and `/compare`.
- **`/timeline`** - milestone timeline, past and future, with gaps and a
  "today" marker; the only place `/timeline` is linked from is Home's
  milestones section.
- **`/wrapped/[cadence]`** (`week`/`month`/`year`) - the named retrospective:
  entry count, best streak, average mood, a mood chart (multi-point, unlike
  on-this-day - it draws), one dimension change, top tags, milestones,
  photos. Gated on `prefs.wrappedEnabled` and an entry floor. Nothing is
  cached; opening recomputes. Pinned Android launch-route target.
  **Target (ticket 06, not yet built):** also surfaces tag insights (which
  tags go with better/worse days, framed as neither good nor bad), a tally
  trend (counts, not a ratio), best-streak-ever alongside the current
  streak, and the dimension change's signed delta - each section
  conditional, so a thin period renders no empty cards. **Target (ticket
  07, blocked on 06, not yet built):** also gains an arbitrary-range option
  (previous month/year, last 7/30/90 days, year to date, custom start and
  end) - see `/recap` below.
- **`/wrapped/[cadence]/share`** - builds and rasterizes a share-card image
  from a fixed, journal-text-free content type (per-element toggles, a live
  preview, then an explicit "make card" step before anything is shared).
  Unchanged by this spec.
- **`/on-this-day`** - **current:** three stat tiles (entry count, best
  streak, average mood) and a mood chart, over a one-day range - the chart
  can never draw (needs >=2 points) and the tiles restate that a day
  exists, contradicting `CONTEXT.md`'s own definition of on-this-day as
  showing "what was logged". Reuses `WrappedCompact`'s presentation. Only
  good days resurface (never bad ones); `?lookback=month|sixMonths|year`
  deep-links to a section. Pinned Android launch-route target. **Target
  (ticket 05, not yet built):** renders the actual entries for each
  qualifying lookback (using the existing per-day read and the existing
  entry card), drops the chart that can't draw, reduces or removes the
  stat tiles, keeps photo highlights. The good-day gate and the lookback
  deep link are unchanged.
- **`/recap`** - **current:** a second reader of the same aggregate seam,
  with its own period picker (previous month/year, last 7/30/90 days,
  year-to-date, custom range) and a step-through carousel presentation;
  reachable only from two links on `/stats` and the demo bar. **Target
  (ticket 07, blocked on 06, not yet built): this route is deleted.** Its
  period picker moves into Wrapped; its carousel presentation is not
  preserved (a possible future option inside Wrapped, not built here). Do
  not design this screen - design Wrapped's new range picker instead.
- **`/body-map`** - body-region feelings (dysphoria and euphoria
  intensities, tracked independently) charted over a switchable range.
  Linked from `/stats`.
- **`/tally`** - misgendered/correctly-gendered counts charted over a
  switchable range. Linked from `/stats`; the two buttons that log a tally
  live on Home today, moving into quick add under ticket 04.
- **`/compare`** - a then-vs-now comparison between two periods. Linked
  from `/stats`.

## More hub and Settings tab

The fourth tab opens `/more` first, one hop from `/settings` (ADR-0036).
`/doses` sits outside both trees but is grouped with this tab in
`active-tab.ts` because it is reached from within it.

### `/more` - the hub itself

Header, then four data-driven groups (`CARE_ROWS`, deepening ticket 05),
each a title and a list of rows with an icon, title, one-line subtitle and
a chevron, plus a final row linking to `/settings` itself. Every row's
existing icon/title/subtitle/href carries over unchanged (no restyle, no
copy change, is this spec's explicit note) - a redesign changes the
container, not what each row says.

**Body group:**
| Route | What it's for |
|---|---|
| `/settings/photos` | "all photos, then vs now" |
| `/settings/measurements` | "waist, hips, chest and underbust over time" |
| `/settings/sizes` | "what you bought, the size, and how it fit" |
| `/settings/hair-progress` | "staging against a published scale, and fixed-position photos" |
| `/settings/hair-removal` | "electrolysis and laser sessions, logged plainly" |

**Health group:**
| Route | What it's for |
|---|---|
| `/settings/labs` | "your numbers, your trend" |
| `/settings/regimen` | "what you're taking, and since when" |
| `/settings/hormone-curve` | "modelled or illustrative estradiol or testosterone between doses" |
| `/doses` | "every dose, and how it sits against the schedule" |
| `/settings/cycle-events` | "period, spotting and quiet months, logged plainly" |
| `/settings/side-effects` | "what you're noticing, logged plainly" |
| `/settings/surgery` | "procedures, dates and your own recovery log" |
| `/settings/appointment-prep` | "questions to bring to your next appointment" |
| `/settings/clinician-summary` | "doses, lab results and side effects for a chosen range, ready to print" (uses the shared `@media print` seam `journal-book` also uses) |

**Transition group:**
| Route | What it's for |
|---|---|
| `/settings/milestones` | milestone list; also linked from Home |
| `/settings/roadmap` | "a step-by-step checklist" |
| `/settings/letters` | "write a letter now, read it once the date arrives" |
| `/settings/tryouts` (+ `/settings/tryouts/[id]` detail) | "track how something you're trying feels over time" |

**Practice group:**
| Route | What it's for |
|---|---|
| `/settings/voice` | "two recordings, side by side" |
| `/settings/wear` | "binder and tucking wear time, tracked plainly" |
| `/settings/effects` | "when you first noticed each change" |
| `/settings/resources` | "trans organisations and helplines, kept in the app" |

All 22 are entry-data or mixed reference/entry-data screens; each needs its
own loading and empty state (a new person has no photos, no doses, no
letters yet - every one of these ships an empty state today and must keep
one).

### `/settings` - preferences only (ADR-0036)

Three hand-written sections, unaffected by this spec (they stay
hand-written, per the spec's own decision):

- **Appearance:** language, the gender-palette swatch picker (8, sheet),
  the mood-preset picker (4, sheet, independent of the gender palette).
- **Tracking:** active gender preset (sheet), `/settings/dimension`
  (custom dimension), `/settings/reminders` (+ `/settings/reminders/[id]`
  detail, pinned launch-route target), `/settings/journey-anchor`,
  `/settings/affirmations`, `/settings/body-regions`,
  `/settings/streak-goal`, `/settings/journaling-pause`, inline tag-group
  toggles plus a link to `/settings/tags`, and an inline "entry nudges"
  toggle (not a route).
- **Privacy and data:** `/settings/security` (leads to `/settings/lock`
  and `/settings/passphrase`), a disguise toggle (sheet, not a route),
  `/settings/export` (backup/restore, Daylio import),
  `/settings/journal-book` (print of a chosen range - shares its
  `@media print` seam with `/settings/clinician-summary`),
  `/settings/trash` (soft-deleted entries, 30-day window), an "about" sheet
  (not a route).

### Reached from within a feature screen, not from the hub or Settings

- **`/settings/stock`** - medication stock and run-out projection; linked
  only from `/settings/regimen`. In context, not drifted.
- **`/settings/exposure`** - cumulative dose/regimen exposure counters;
  linked only from `/settings/regimen`. This is one of the "routes
  drifted out of reach" the original problem statement named, and no
  ticket in 03 through 09 gives it an inbound link from the hub or
  Settings directly - still true today. Flagging it here since nothing
  else will.
- **`/settings/photos/export`** - the progress-photo journey export
  (range picker, live preview, then export); linked only from
  `/settings/photos`. Same drifted-route note as exposure.

## Total

61 routes under `src/routes` (`find src/routes -name '+page.svelte' | wc -l`),
cross-checked against this document programmatically: every path named above
in backticks matches exactly one of the 61, and every one of the 61 is named
above exactly once. By section: 1 onboarding + 1 lock-setup (`/settings/lock`)
+ 2 Home-tab + 6 Calendar-tab + 9 Stats-tab + 1 More-hub index + 22 More-hub
rows + 1 More-hub detail route (`/settings/tryouts/[id]`, not itself a hub
row) + 1 Settings index + 14 Settings-preference detail routes + 3
in-context/drifted routes = 61. The five pre-unlock/authentication gates in
the "Pre-unlock, gates, and onboarding" section above are not counted here -
they render inline in `+layout.svelte`, not as their own route files.
