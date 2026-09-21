# The mark, rendered

Every file here comes out of `scripts/render-mark.mjs`, which draws the geometry
Alicja signed off on 2026-09-21 (ticket 38, round three) and reads the stripes
from `src/lib/theme/palettes.css` rather than keeping a second copy of them.

`corner sun: R 100, centre 0, seam 3, tile radius 15, small all-seam`, white
tile, black stroke on the tile's own edge, no motion anywhere.

Regenerate with:

    npm run render:mark

## What is here

- `svg/<flag>-tile.svg` - the mark. White rounded square, black edge, the sun
  anchored to the top right corner. This is the icon.
- `svg/<flag>-round.svg` - the same drawing under a circle crop, with the edge
  following the circle. What a round launcher shows.
- `svg/<flag>-maskable.svg` - full bleed square, no edge, because a launcher
  mask crops the edge off anyway. The maskable and adaptive-icon source.
- `svg/mark-mono.svg`, `svg/mark-mono-reversed.svg` - one ink, four rings, no
  tile and no ground. The printed surfaces and any single-colour reproduction.
- `png/<flag>-tile-{512,192,96,48,32,16}.png` - the sizes the manifest, the
  store listing and a favicon ask for.
- `png/<flag>-{round,maskable}-512.png`, `png/mark-mono{,-reversed}-512.png`.
- `jpg/<flag>-tile-512.jpg` - for anything that will only take a jpeg. The tile
  is white and opaque, so nothing is lost.

Eight flags: trans, nonbinary, genderfluid, bisexual, lesbian, pansexual,
rainbow, agender. Trans is the default and the one the app ships installed
with.

These files are the source of the mark, not a copy of it: nothing here is
drawn by hand, and editing one of them is the wrong move. Change the numbers in
the generator instead.

They are tracked but not shipped. Everything under `static/` goes into the web
build and into the APK's assets, so the same run writes the subset the app
actually serves straight into its own places instead: `static/favicon-<flag>.svg`
for the tab, `static/icons/icon.svg` and `icon-maskable.svg` for the install,
and one adaptive icon plus its vector foreground per palette under
`android/app/src/main/res/`. `tests/mark-assets.test.ts` fails if a palette is
missing any of them, which is what stops a run being forgotten.

The drawing itself is not in the generator either: `src/lib/components/mark.ts`
owns it and `Mark.svelte` renders the same strings on screen, so a file here
and the mark in the app are one drawing rather than two that agree today.
