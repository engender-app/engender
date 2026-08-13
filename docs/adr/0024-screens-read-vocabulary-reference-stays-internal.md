# Screens read vocabulary, reference stays internal

Screens and components read vocabulary rows through `src/lib/data/vocabulary/vocabulary.ts`. They do not import `reference.svelte` directly.

## Why

`reference.svelte` and `vocabulary.ts` answer adjacent questions but at different layers. The mirror under `reference` answers which rows exist and keeps those rows live with table writes. `vocabulary` answers what the user sees: localized built-in wording, custom wording unchanged, and metric labels that stay in step with preferences.

When screens import `reference` directly, the seam is ambiguous. A reader sees two routes to the same data and cannot tell why one route is safe and the other is accidental. The direct path also invites copying row access into more screens, which re-opens this split each time a new page is added.

Keeping screen reads in `vocabulary` keeps ADR-0016 intact. Localization remains above the Node-tested tier, and the Node tier keeps running without paraglide imports.

## Consequences

The route layer now has one rule for vocabulary rows: import `vocabulary`, not `reference`.

`reference` remains internal infrastructure for live row mirroring and boot hydration. It is still used where that infrastructure belongs, but not at screen call sites.

A repo test enforces the rule by failing if anything under `src/routes` or `src/lib/components` imports `reference.svelte`.

Future row getters that a screen needs are added to `vocabulary.ts` first, then consumed from there. That keeps behavior changes in one seam and avoids re-creating direct imports by convenience.
