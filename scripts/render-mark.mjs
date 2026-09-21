/* Renders every engender mark as a file: the full review set into
   brand/mark/, and the subset the app actually serves into static/ and the
   Android resources.

   The drawing is not here. src/lib/components/mark.ts owns it and
   Mark.svelte renders the same strings, so an icon file and the mark on a
   screen cannot disagree - which is the whole reason this is a generator
   and not a folder of hand-drawn SVGs. What is here is which files exist
   and where they go.

   brand/mark/ stays the full review set and stays out of static/, because
   everything under static/ ships in the web build and in the APK's assets:
   the app serves a handful of these, not two megabytes of them.

   Run from anywhere: npm run render:mark
   By hand rather than in CI: it needs a Chromium to rasterise through, its
   output is tracked, and the only two things that change it are a palette
   being added and the geometry being edited on purpose - both moments
   somebody is already at a keyboard. tests/mark-assets.test.ts is what
   fails if the run was forgotten, so a ninth palette cannot ship
   half-iconned.

   Stripes are read out of src/lib/theme/palettes.css rather than copied, so
   a ninth palette needs nothing taught here. */
import { chromium } from 'playwright-core';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MARK_R, MARK_SAFE_TILE, MARK_SEAM, MARK_TILE, MARK_TILE_RADIUS, markSvg } from '../src/lib/components/mark.ts';
import { ringRadii } from '../src/lib/motion/flagSun.ts';

/* Resolved off this file rather than the working directory, so the script
   writes into its own checkout when it is run from a worktree. */
const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(REPO, 'brand/mark');
const STATIC = join(REPO, 'static');
const RES = join(REPO, 'android/app/src/main/res');

/** The palette the app ships installed with, and therefore the one the
    install icon and the pre-paint favicon are. A manifest icon is fixed at
    install time and cannot follow the flag; a favicon in a running tab is a
    link element and does. */
const DEFAULT_FLAG = 'trans';

/* ---- stripes, straight out of the app's own token ---- */
function palettes() {
  const css = readFileSync(join(REPO, 'src/lib/theme/palettes.css'), 'utf8');
  const out = {};
  for (const m of css.matchAll(/\[data-palette="([a-z]+)"\]\s*\{\s*--motif-stripes:\s*([^;]+);/g)) {
    out[m[1]] = m[2].split(',').map((s) => s.trim());
  }
  return out;
}

const write = (path, text) => writeFileSync(path, text.endsWith('\n') ? text : text + '\n');

/* ---- Android ----

   An adaptive icon is a background and a foreground, and the launcher picks
   its own mask. The background is @color/ic_launcher_background, which is
   the white the tile is; the foreground is the whole stroked tile, laid in
   the middle of the 108dp canvas at MARK_SAFE_TILE.

   Drawn small rather than full bleed because the black edge is not optional
   (Alicja, 2026-09-21: "no stroke around the square, or its white - its
   supposed to be black always") and a file cannot know which mask will cut
   it. Inside the guaranteed circle the whole outline survives every mask,
   which is the only arrangement where "always black" is true. mark.ts's
   MARK_SAFE_TILE carries the arithmetic.

   A vector drawable rather than a PNG per density: the drawing is five to
   seven circles, and eight palettes times five densities is forty files to
   keep in step for nothing. */
const CANVAS = 108;
const n2 = (value) => value.toFixed(2);

/** A rounded rectangle as path data - a vector drawable has no <rect>. */
function roundedRectPath(x, y, size, r) {
  const side = size - 2 * r;
  return (
    `M${n2(x + r)},${n2(y)}`
    + `h${n2(side)}a${n2(r)},${n2(r)} 0 0 1 ${n2(r)},${n2(r)}`
    + `v${n2(side)}a${n2(r)},${n2(r)} 0 0 1 ${n2(-r)},${n2(r)}`
    + `h${n2(-side)}a${n2(r)},${n2(r)} 0 0 1 ${n2(-r)},${n2(-r)}`
    + `v${n2(-side)}a${n2(r)},${n2(r)} 0 0 1 ${n2(r)},${n2(-r)}z`
  );
}

function adaptiveForeground(stripes) {
  const rings = ringRadii(stripes.length, MARK_R)
    .map((radius, i) => {
      /* A circle as two half-turn arcs from its top point: a vector
         drawable has no <circle> either. Same centre and same half-seam
         inset as the SVG, so the two drawings are the same numbers. */
      const r = radius - MARK_SEAM / 2;
      return (
        `        <path\n`
        + `            android:pathData="M${MARK_R},${n2(-r)} a${n2(r)},${n2(r)} 0 1,0 0,${n2(r * 2)}`
        + ` a${n2(r)},${n2(r)} 0 1,0 0,${n2(-r * 2)} Z"\n`
        + `            android:fillColor="${stripes[i]}"\n`
        + `            android:strokeColor="#000000"\n`
        + `            android:strokeWidth="${MARK_SEAM}" />`
      );
    })
    .join('\n');
  /* The same construction mark.ts uses, and for the same reason: the clip
     stops half a seam short of the silhouette and the edge is stroked on
     that line in a group of its own, unclipped, so the drawing has one
     antialiased boundary rather than two that leave a pale halo. */
  const inset = MARK_SEAM / 2;
  const edgePath = roundedRectPath(inset, inset, MARK_R - MARK_SEAM, MARK_TILE_RADIUS - inset);
  const scale = (CANVAS * (MARK_SAFE_TILE / 100)) / MARK_R;
  const offset = (CANVAS - CANVAS * (MARK_SAFE_TILE / 100)) / 2;
  const group =
    `    <group\n`
    + `        android:translateX="${n2(offset)}"\n`
    + `        android:translateY="${n2(offset)}"\n`
    + `        android:scaleX="${n2(scale)}"\n`
    + `        android:scaleY="${n2(scale)}">\n`;
  return (
    `<?xml version="1.0" encoding="utf-8"?>\n`
    + `<!-- Generated by scripts/render-mark.mjs. The stroked tile, inside the\n`
    + `     circle every launcher mask keeps, so its black edge always survives. -->\n`
    + `<vector xmlns:android="http://schemas.android.com/apk/res/android"\n`
    + `    android:width="${CANVAS}dp"\n`
    + `    android:height="${CANVAS}dp"\n`
    + `    android:viewportWidth="${CANVAS}"\n`
    + `    android:viewportHeight="${CANVAS}">\n`
    + group
    + `        <clip-path android:pathData="${edgePath}" />\n`
    + `        <path\n`
    + `            android:pathData="${edgePath}"\n`
    + `            android:fillColor="${MARK_TILE}" />\n`
    + `${rings}\n`
    + `    </group>\n`
    + group
    + `        <path\n`
    + `            android:pathData="${edgePath}"\n`
    + `            android:fillColor="#00000000"\n`
    + `            android:strokeColor="#000000"\n`
    + `            android:strokeWidth="${MARK_SEAM}" />\n`
    + `    </group>\n`
    + `</vector>\n`
  );
}

function adaptiveIcon(flag) {
  return (
    `<?xml version="1.0" encoding="utf-8"?>\n`
    + `<!-- Generated by scripts/render-mark.mjs. -->\n`
    + `<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n`
    + `    <background android:drawable="@color/ic_launcher_background"/>\n`
    + `    <foreground android:drawable="@drawable/ic_launcher_${flag}_foreground"/>\n`
    + `</adaptive-icon>\n`
  );
}

const PNG_SIZES = [512, 192, 96, 48, 32, 16];
const MONO_INKS = [
  ['mono', '#1E1B16'],
  ['mono-reversed', '#FFFFFF']
];

/** The review set's shapes, and what markSvg calls each of them. */
const SHAPES = { tile: 'tile', round: 'round', maskable: 'bleed' };

async function main() {
  for (const d of ['svg', 'png', 'jpg']) mkdirSync(join(OUT, d), { recursive: true });
  mkdirSync(join(STATIC, 'icons'), { recursive: true });
  const PAL = palettes();
  const jobs = [];
  const named = { label: 'engender' };

  for (const [flag, stripes] of Object.entries(PAL)) {
    /* The review set: every shape, every size, tracked but not shipped. */
    for (const [shape, crop] of Object.entries(SHAPES)) {
      write(join(OUT, 'svg', `${flag}-${shape}.svg`), markSvg(stripes, crop, 512, named));
      const sizes = shape === 'tile' ? PNG_SIZES : [512];
      for (const size of sizes) {
        jobs.push({
          svg: markSvg(stripes, crop, size, named),
          size,
          file: join(OUT, 'png', `${flag}-${shape}-${size}.png`),
          type: 'png'
        });
      }
    }
    /* A jpeg cannot hold transparency and does not need to here: the tile is
       white and opaque. Supplied for the surfaces that will only take one. */
    jobs.push({
      svg: markSvg(stripes, 'tile', 512, named),
      size: 512,
      file: join(OUT, 'jpg', `${flag}-tile-512.jpg`),
      type: 'jpeg'
    });

    /* Shipped: the tab icon, which follows the flag, and the launcher icon
       for this palette's activity-alias. */
    write(join(STATIC, `favicon-${flag}.svg`), markSvg(stripes, 'tile', 512, named));
    write(join(RES, 'drawable', `ic_launcher_${flag}_foreground.xml`), adaptiveForeground(stripes));
    if (flag !== DEFAULT_FLAG) {
      write(join(RES, 'mipmap-anydpi-v26', `ic_launcher_${flag}.xml`), adaptiveIcon(flag));
    }
  }

  /* The default palette's adaptive icon is the application's own
     @mipmap/ic_launcher, which LauncherDefault (AndroidManifest.xml) is the
     alias for - so the default palette needs no alias and no second icon
     resource, and an install that never changes its flag never flips an
     alias at all. Both names, because android:roundIcon is a separate
     attribute even when the drawing behind it is the same adaptive icon. */
  for (const name of ['ic_launcher', 'ic_launcher_round']) {
    write(join(RES, 'mipmap-anydpi-v26', `${name}.xml`), adaptiveIcon(DEFAULT_FLAG));
  }

  /* The install icons. Fixed at the default rather than following the flag,
     because a web manifest's icon is read once at install time. */
  write(join(STATIC, 'icons', 'icon.svg'), markSvg(PAL[DEFAULT_FLAG], 'tile', 512, named));
  write(join(STATIC, 'icons', 'icon-maskable.svg'), markSvg(PAL[DEFAULT_FLAG], 'bleed', 512, named));

  for (const [name, ink] of MONO_INKS) {
    /* The tile, in one ink: the square is part of the mark and there is no
       variant without it. No ground, so paper or the reversed ground below
       shows through. */
    const svg = markSvg([], 'tile', 512, { ink, ...named });
    write(join(OUT, 'svg', `mark-${name}.svg`), svg);
    jobs.push({
      svg,
      size: 512,
      file: join(OUT, 'png', `mark-${name}-512.png`),
      type: 'png',
      ground: name === 'mono-reversed' ? '#000000' : null
    });
  }

  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium-browser', headless: true });
  const page = await browser.newPage();
  await page.goto('about:blank');
  for (const job of jobs) {
    const dataUrl = await page.evaluate(async ({ svg, size, type, ground }) => {
      const img = new Image();
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
      await img.decode();
      const c = document.createElement('canvas');
      c.width = size; c.height = size;
      const ctx = c.getContext('2d');
      /* A jpeg has no alpha, so anything transparent would come out black
         unless the ground is painted first. */
      if (type === 'jpeg' || ground) { ctx.fillStyle = ground || '#FFFFFF'; ctx.fillRect(0, 0, size, size); }
      ctx.drawImage(img, 0, 0, size, size);
      return c.toDataURL(type === 'jpeg' ? 'image/jpeg' : 'image/png', 0.92);
    }, job);
    writeFileSync(job.file, Buffer.from(dataUrl.split(',')[1], 'base64'));
  }
  await browser.close();
  const flags = Object.keys(PAL).length;
  console.log(
    `wrote ${flags * 3 + MONO_INKS.length} svg and ${jobs.length} raster files into ${OUT}, `
    + `${flags} favicons and 2 install icons into ${STATIC}, `
    + `and ${flags} foregrounds plus ${flags + 1} adaptive icons into ${RES}`
  );
}

await main();
