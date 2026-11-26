# The launcher icon follows the chosen flag, at the price of immediacy

Status: Accepted
Decided: 2026-09-21
Last reviewed: 2026-11-02
Supersedes: none

The app's mark is the corner sun in the active flag's stripes, and the icon on
a home screen wears the same flag the app does. Android carries that with
`activity-alias` entries in `AndroidManifest.xml`, exactly one enabled at a
time, flipped by `DisguiseAlias` with `DONT_KILL_APP`. A flag change does not
restart the app; the new icon shows once the app has gone to the background.
What disguise does to the icon is decided in ADR-0101. This record keeps the
icon, the aliases and their names.

## The alias set

One alias per palette (`PALETTES` in `src/lib/theme/paletteChoices.ts`) in each
of two shapes, plus one disguised alias.

- **Two shapes.** The current square tile, and a round crop that keeps the
  sun's centre inside the circle (`ROUND_SUN_CENTER` and `ROUND_SUN_R` in
  `src/lib/components/mark.ts`). The person picks the shape in Settings
  (`launcherIconShape`, `'current'` or `'round'`), and `DisguiseAlias.aliasFor`
  takes palette and shape together.
- **One disguised alias**, with no round twin. It outranks every flag and
  every shape.
- **Neutral class names, append-only.** Apps that list launcher activities
  print class names, and 1.0 fixes them for good, so the aliases are
  `.Launch01`, `.Launch02` and on, not `.disguise.LauncherTrigender`. What an
  alias draws is its `dev.engender.app.LAUNCHER_IDENTITY` meta-data (the
  palette, the palette with `-round`, or `disguised`), which `DisguiseAlias`
  resolves by instead of by name. A new alias takes the next number. A number
  is never renamed or reused, because renaming drops the icon a person placed
  on their home screen.
- **The default palette is `Launch01`** (trans). The manifest enables it, so an
  install that never changes its flag never flips an alias. `Launch03` is the
  disguised one (`DisguiseAlias.DEFAULT`, `DISGUISED`).

`DisguiseAlias` enumerates the aliases off the manifest through
`PackageManager` instead of holding a list. Adding a palette is its stripes in
`palettes.css`, a generator run (`npm run render:mark`,
`scripts/render-mark.mjs`) and two manifest entries with the next two numbers.
`tests/mark-assets.test.ts` fails if an icon or an alias identity is missing;
`DisguiseAliasTest.java` walks every alias on a device and holds the
one-enabled invariant.

## Rules

- **A flag change does not restart the app.** `DisguisePlugin.setLauncherIdentity`
  kills the process only when the disguise itself changed. A flag or shape
  change is queued and applied from `handleOnStop`: disabling the alias a
  running task lives under tears the window down even with `DONT_KILL_APP`
  (`tests/android-tier/palette-switch-crash-check.mjs`), so applying it at once
  would close the screen under the person anyway.
- **An unknown palette resolves to the default**, never to no alias. Two
  enabled aliases would show the app in the launcher twice, none would leave no
  way in.
- **The icon is drawn small enough that its black edge survives any mask.** A
  launcher picks its own shape and the tile's edge is not optional (maintainer
  decision, 2026-09-21: the tile's edge is always black, never white and
  never missing), so the stroked tile sits inside the central circle Android
  guarantees (`MARK_SAFE_TILE` in `mark.ts`).

The web install does not follow the flag. A manifest icon is read once, so
`static/manifest.webmanifest` keeps the default's icon set. A favicon in a
running tab is a link element and does follow (`src/app.html`).

## Why

The palette is the person's own flag, chosen from many, not one brand colour
(ADR-0035's motif). A mark built on trans pink and blue
is wrong the moment somebody picks the nonbinary flag, and the app answers
that everywhere else through `--motif-stripes`. An icon that alone stayed
trans would be the one surface that disagreed, and the one looked at most.

The restart is the part worth arguing. The kill in the plugin exists because
a disguise has to take effect now. Wearing a different flag is not that, and
restarting the app under somebody who changed a colour would be a worse bug
than the one it fixes.

## Consequences

- The launcher shows the new icon once the app is in the background, and the
  recents entry can lag until the next cold start. Accepted; nothing in the app
  claims otherwise.
- The bridge method is `setLauncherIdentity({ disguised, palette, shape })`,
  one call carrying every input, because the native side decides between them:
  a flag arriving second must not outrank a disguise.
- `+layout.svelte`'s platform-sync effect re-runs on a palette change too:
  wasted work, not a behaviour change, for the reason `platform-sync.ts` gives.
- Every palette needs two icons, so a palette cannot be added by editing
  `palettes.css` alone.

History: sixteen-palette alias set renamed to neutral `LaunchNN` names before 1.0 (cost only test installs); rewritten 2026-11-02 to match the tree and move disguise rules to ADR-0101.