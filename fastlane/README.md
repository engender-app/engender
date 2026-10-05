# Android store listing

English and Polish copy comes from the landing repository's
`content/play/en.md` and `pl.md`. The listing uses the current engender name,
six built-in scales, 16 palettes and the current Look back span controls.
Changelogs summarize `CHANGELOG.md`; their filenames are Android version
codes, so `1.0.0` maps to `1000000999.txt` through
`scripts/android-version.mjs`.

Regenerate the graphics and all six phone screenshots per language from
this checkout:

```sh
VITE_DEMO=1 npm run build
node scripts/store-listing-assets.mjs
```

The script owns preview port 5111 and closes its server and Chromium when
finished. It opens a fresh browser context for each language, fills every
feature from the demo persona and fixes the date to 5 October 2026. It never
opens an existing browser profile. A production build without demo controls
fails before screenshot capture.

Screenshots are 1080 × 1920 PNGs, in the default trans palette and light
theme. Their order is Home, new entry, Journal, Care, Look back and Settings
privacy. The entry screenshot is scrolled to its filled scales; Journal shows
the previous month expanded. Feature graphics are 1024 × 500 PNGs. The script also copies the
existing brand icons into the PWA assets and rasterizes the neutral disguise
icons from their existing SVGs.

Review the screenshots and feature graphics before committing regenerated
images. Text validation runs with `npm test -- tests/store-listing-assets.test.ts`.
This directory contains assets only; nothing here uploads them to a store.
