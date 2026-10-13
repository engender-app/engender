# The mark, rendered

Every file here comes out of `scripts/render-mark.mjs`, which draws the geometry
Alicja signed off on 2026-09-21 (ticket 38, round three) and reads the stripes
from `src/lib/theme/palettes.css` rather than keeping a second copy of them.

The 100-unit tile has a sun at X = 95, Y = 5, with radius 96.75 (96.75% of
its original size). Black seams stay 3 units wide; the tile radius stays 30.
These sun values come from Alicja's review on 2026-10-13. The mark stays still.

Last-audit UI ticket 38 changes the radius from 15 to 30 across app and landing
logos so Google Play's corner mask preserves the black outline. The store PNG
has an opaque square background; Play applies the outside mask and shadow.

Regenerate with:

    npm run render:mark

## What is here

- `svg/<flag>-tile.svg` - the mark. White rounded square, black edge, the sun
  at the reviewed position and scale. This is the icon.
- `svg/<flag>-round.svg` - the same drawing under a circle crop, with the edge
  following the circle. What a round launcher shows.
- `svg/<flag>-maskable.svg` - full bleed white square with the stroked tile
  inside the launcher's safe circle. The maskable and adaptive-icon source.
- `svg/mark-mono.svg`, `svg/mark-mono-reversed.svg` - one ink, four rings, no
  tile and no ground. The printed surfaces and any single-colour reproduction.
- `png/<flag>-tile-{512,192,96,48,32,16}.png` - the sizes the manifest and
  a favicon ask for.
- `png/trans-store-512.png` - the default tile on an opaque square ground,
  copied into both store locales by `scripts/store-listing-assets.mjs`.
- `png/lockup-{light,dark}.png` - the mark beside the word, in the rail's proportions
  (ticket 37), for the README. Transparent, dark ink on light and light on dark.
- `png/<flag>-{round,maskable}-512.png`, `png/mark-mono{,-reversed}-512.png`.
- `jpg/<flag>-tile-512.jpg` - for anything that will only take a jpeg. The tile
  is white and opaque, so nothing is lost.

Sixteen flags: trans, nonbinary, genderfluid, bisexual, lesbian,
pansexual, rainbow, agender, gay men, genderqueer, intersex, asexual,
demiboy, demigirl, trigender and Polish. Trans is the default install icon.

These files are the source of the mark, not a copy of it: nothing here is
drawn by hand, and editing one of them is the wrong move. Change the numbers in
`src/lib/components/mark.ts` instead.

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
