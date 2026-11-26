# A reference area is managed in Settings and takes no hub row

Status: Accepted
Decided: 2026-09-15
Last reviewed: 2026-11-02
Supersedes: ADR-0036 (merged in), ADR-0072 (merged in), ADR-0076 (merged in)

An area whose rows are **spent** on another screen, and never read where they
are kept, is a **reference area**. It is managed in Settings, or inside the
screen that spends it, and takes no hub row. An area read where it was written
is a **logged area**, and a hub row is what it is for.

The hub (the More door) holds grouped feature surfaces, never preferences. A
row declares where it is drawn: `home` in `src/lib/data/hubRows.ts` is one of
the hub's groups or a host screen in `HUB_ROW_HOSTS`, and
`src/lib/components/HostedRows.svelte` draws the hosted ones. Settings is
reached from chrome, not from a hub row. An address that moves gets no
redirect before 1.0.

## Reference areas

`ARCHIVE_SECTION_NAMES` in `src/lib/data/journal/archiveSections.ts` lists
every area. These are the reference ones, with where each is managed:

- `dimensions`: `/settings/dimension`. `tagGroups`: `/settings/tags`.
  `bodyRegions`: `/settings/body-regions`. `eras`: `/settings/eras`.
- `presentations` (Modes) and `entryTemplates`: manager sheets raised from
  Settings (`PresentationsManager.svelte`, `EntryTemplatesManager.svelte`,
  `ui.raisedManager`). The entry editor links through to them from its chips.
- `effectCategories` and `personalEffectTypes`: inside `/care/changes`, with
  the logged area that spends them.
- `presets`: nothing spends or manages it. The rows exist only on devices that
  predate the retired picker, and the rule gives it no hub row.

Every other area is logged: none is spent on a screen other than the one
that keeps it, which is the whole test.

## Why storage is the wrong test

ADR-0036 sorted rows by whether they write journal rows or set a
preference. A tag group and an entry template both write journal rows and
both travel in an archive, yet they ended up in different places. A mode is
a name and a colour spent on the editor's chips; nobody opens Modes to read
how they were presenting. Where a row is met decides where it lives.

## The hub

The tab bar holds four doors plus the centre add button, so a feature surface
cannot bid for a tab; it becomes a row in a group. The groups are those in
`HUB_GROUP_KEYS`. Practice was dissolved: a row went to the group it was
always about, and Support holds Safe space and resources.

A host screen draws its rows from the registry. A row goes when every area behind it is hidden, wherever it is
drawn, and it states the day the person declared the area finished. A hosted
row does not also appear on the hub. A row stays in `hubRows.ts` when it moves
host, so its invariants hold: every finishable group is claimed by one row and
every area with a last write is fronted or written down as an opt-out.

## Settings and its entry point

Settings holds decisions about how the app works for you; the hub holds the
journal's own areas. A record is not a preference.

One persistent control reaches Settings: a gear at the end of Today's foot on
the phone and a fifth item at the rail's foot on desktop, set apart by a rule
so it reads as chrome rather than a fifth door. The phone bar stays at four
tabs. On `/settings` routes the rail item takes the pill and `aria-current`;
the phone bar keeps lit the door the gear was pressed from
(`litTabKey`, `railTabKey`, `src/lib/navigation/chrome-tab-origin.ts`).

## URL policy

Moving a row moves an address, so the rule for addresses lives here.

**Before 1.0: no redirects.** No bookmark exists outside test installs, so a
moved or removed address stops existing. A cleanup before 1.0 deleted
all the redirect stubs. An address with no page renders the unknown-address
screen (`src/routes/+error.svelte`, `data-error-screen="not-found"`) at the
address asked for, with one link to Today. There is no catch-all redirect.

**From 1.0 on: a moved address redirects for two releases, then goes.** The
stub exists in the release that moves the screen and the next; the release
after removes it. Two releases cover a person who skips one update, and a
reminder alarm or widget that still carries the old route. A removed screen
gets no redirect. No catch-all, ever: it would hide the next broken link.

Checks: `tests/old-addresses-check.mjs` (browser tier) loads every route in
`tests/old-addresses.json` and expects the unknown-address screen; a
post-1.0 stub joins the list when its two releases end.
`tests/internal-route-targets.test.ts` fails on any `href` or `goto` target
in `src/`, or route in `src/lib/android/fixtures/launch-routes.json`, with no
`+page.svelte`; a redirect stub never counts as a target.

A URL supplied at runtime, or a new route wrapper the guard does not know,
escapes these; the browser tier and the walkthrough catch those.

## Considered and rejected

- **Reuse "reference data".** ADR-0004 and the domain glossary use it for a
  different axis (bounded, in memory, read synchronously).
- **Move the managers onto the editor that spends them.** The editor is
  where a mode is picked, not named. A way through from the chips instead.
- **Sort by whether rows travel in an archive.** ADR-0036's storage test
  with the sign flipped.
- **A fifth tab, a Settings row left in the hub, a gear in the field's
  corner.** Each exceeds the bar's four slots or reads as a fifth door.

## Consequences

The domain glossary has **Reference area** and **Logged area** beside **Area**. A new
area gets one more design question: is it spent somewhere else? If so it is
managed in Settings or inside that screen. "Logged" names where somebody meets
the rows, not what they are, so `areaStates` is a logged area with no log.

History: decided 2026-09-15. Amended 2026-09-15 (`wordIgnore` became a reference area), 2026-09-16 (`eras` became one, hub row replaced by the milestone rail band) and 2026-10-21 (Words reading cut, `wordIgnore` dropped). URL policy added 2026-11-02. Absorbed ADR-0036 (hub, 4 tabs, Settings holds preferences), ADR-0072 (row `home`, hosted rows, Practice dissolved) and ADR-0076 (gear in chrome) 2026-11-02.