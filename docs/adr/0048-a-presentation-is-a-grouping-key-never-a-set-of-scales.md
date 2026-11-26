# A presentation is a grouping key, never a set of scales

Status: Accepted
Decided: 2026-09-01
Last reviewed: 2026-11-02
Supersedes: ADR-0057 (merged in)

An **Entry** carries at most one **Presentation**, which screens call a **mode**, in a nullable
`entry.presentation_uuid`. A presentation owns a name and a role index into the
active flag, and nothing else: no scales, no body regions, no tags, no
built-ins. It is a grouping key. It answers "did this region or trend read
differently depending on how I was presenting", and an entry with none sits
outside every comparison. An **Entry template** may seed a presentation as a
default. A presentation never points at a template, never grows a field, and
nothing aggregates over templates, because nothing records that a template
was used.

## Why it is not a set of scales

An earlier design deleted the **Active preset**, a named set of scales that
resolved at read time to what the entry editor offered. It lost to
`prefs.activeScales`, a plain list of ticked keys, because eight presets could
not cover the combinations of scales and adding a custom scale took three
writes.
A presentation that held scales would rebuild that indirection one level down
without anyone noticing.

So the two are split by what they govern. `activeScales` answers which scales
the editor offers, and a presentation cannot change it. A presentation answers
which entries belong together for a comparison, a question no preset ever
answered. If a presentation owned scales it would also change `scaleLean` in
`src/lib/data/lean.ts`, which derives from the ticked scales, so suggestion
ranking would silently become per entry with no test to catch it.

## Why it is not a tryout

A tryout is deliberately plural: several can be open at once, overlapping or
in the past, and it is read by date overlap, a filter and not a partition.
Grouping needs a partition. An entry counted under two presentations means "the
body map for this mode" stops denoting one set of entries, so each entry has one
presentation or none. Tryout kinds are name, pronouns, style and makeup. The garment and
presentation-step kinds are gone, so a tryout cannot stand in for a mode.

## Why it is not an entry template

A template and a presentation both hold a short typed name and a `hidden` flag,
but that makes them both reference data. It says nothing about meaning. Three
facts separate them, and all point one way: **a template writes; a presentation
is written.**

- **Only a presentation is recorded.** `entry.presentation_uuid` has a
  `REFERENCES presentation(uuid)` clause, an index, and an
  `assertKnownPresentation` check in `entries.ts`. No `entry.template_id`
  exists. A presentation is part of what the entry says happened; a template is
  keystrokes saved on the way to saying it, and leaves no trace.
- **Only a presentation is wholly the person's.** It has no `key` column, so the
  schema cannot hold a built-in. Templates ship built-ins alongside the
  person's own.
- **Only a presentation has consumers.** The constellation chart, the body map
  filter and the stats body-region trend all partition entries by it. A fold
  over templates has no input.

A person who wants "log the way I usually do on a work day" wants a template,
and the mode is one value that shortcut fills in. A presentation's colour exists
to tell modes apart on a row, a chip and the constellation, and a template is
never rendered on an entry, so it gets no colour.

## Considered options

- **Extend `gender_preset` with a colour and region list.** The table is a
  portability shell for old rows: reconcile no longer seeds built-ins and no
  screen picks a preset. Grafting a live feature onto it makes a table half
  legacy export and half feature.
- **Ship built-in presentations**, girl mode and boy mode being the obvious two.
  The product rule is that the person names their own identity. Seeding two tells an
  agender, bigender or genderfluid reader which ones the app thinks exist. The
  empty state names them as examples in copy and mints nothing.
- **A preference to turn the fluidity engine on.** Unlike cycle tracking
  (ADR-0092), no harm applies. The chip appears once a presentation exists, so
  a feature for a few people costs everyone else nothing.
- **Pre-fill the last presentation on a new entry.** For a grouping key a wrong
  value is worse than none: an unset entry honestly sits outside every
  comparison, and one stamped from last Tuesday poisons the read. Chips are
  ordered most recently used instead.
- **Merge presentation into template as a degenerate case.** It hangs tags,
  dimensions and a scaffold on a presentation, which breaks the rule above and
  the one ADR-0049 builds on it, and saves nothing because the two screens do
  not read alike.

## Consequences

- A `presentation` table (uuid, name, role index, hidden) and the nullable
  `entry.presentation_uuid`. Existing entries stay null, a valid resting state and
  not a backfill (ADR-0010).
- The area registers in `archiveSections.ts` and classifies in `live/writes.ts`
  (ADR-0027). Management is in Settings (ADR-0084).
- A presentation hides and never deletes. A hidden one stops being offered while
  entries keep it, so no orphan state exists. An entry with none shows no label,
  absence and not an "Uncategorized" category.
- `roleAt()` resolves any stored index by modulo, so none can dangle, and the
  swatch count varies by palette and stays small.
- A template whose presentation is hidden drops it silently on apply
  (`EntryEditor` filters on visible presentations): hidden means the app stops
  offering, and a template is an offer. The template picker does not preview the
  mode it seeds.
- `entry_template.presentation_uuid` has no `REFERENCES` clause because areas
  restore independently and a Replace restore rewrites `presentation` wholesale,
  so a template must survive an archive with no modes in it.

History: decided 2026-09-01; absorbed ADR-0057 (decided 2026-09-03, entry template seeds a presentation) 2026-11-02, when tryouts lost presentation-step and garment kinds; column names follow migration 119 (ADR-0103).