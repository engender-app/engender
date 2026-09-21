/* Renders every enGender mark as a file, from the geometry Alicja signed off
   in ticket 38 round three: corner sun, R 100, centre on the corner, seam 3,
   tile radius 15, white tile, all bands at every size, no motion.

   Run from anywhere: node scripts/render-mark.mjs
   Stripes are read out of src/lib/theme/palettes.css rather than copied, so a
   ninth palette needs nothing taught here. */
import { chromium } from 'playwright-core';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/* Resolved off this file rather than the working directory, so the script
   writes into its own checkout when it is run from a worktree. */
const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(REPO, 'brand/mark');

/* ---- the picked numbers, in a 100 unit tile ---- */
const R = 100, OUT_CENTRE = 0, SEAM = 3, RX = 15, TILE = '#FFFFFF';
const MONO_RINGS = 4;

/* ---- stripes, straight out of the app's own token ---- */
function palettes() {
  const css = readFileSync(join(REPO, 'src/lib/theme/palettes.css'), 'utf8');
  const out = {};
  for (const m of css.matchAll(/\[data-palette="([a-z]+)"\]\s*\{\s*--motif-stripes:\s*([^;]+);/g)) {
    out[m[1]] = m[2].split(',').map((s) => s.trim());
  }
  return out;
}

/* ---- geometry: one ring per stripe, outermost outermost, equal radial
   thickness (flagSun.ts's rule), each with a black edge on its outer side,
   which is what a border-box border draws in the app. ---- */
function rings(stripes, { mono = false, ink = '#000' } = {}) {
  const n = mono ? MONO_RINGS : stripes.length;
  const cx = 100 + OUT_CENTRE * Math.SQRT1_2;
  const cy = 0 - OUT_CENTRE * Math.SQRT1_2;
  let s = '';
  for (let i = 0; i < n; i++) {
    const r = ((R * (n - i)) / n - SEAM / 2).toFixed(2);
    s += mono
      ? `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${ink}" stroke-width="${SEAM}"/>`
      : `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${stripes[i]}" stroke="#000" stroke-width="${SEAM}"/>`;
  }
  return s;
}

/* shape: 'tile' (rounded square, stroked), 'round' (circle, stroked),
   'maskable' (full bleed square, no stroke, because a launcher mask crops
   the edge off anyway). */
function mark(stripes, shape, size, opts = {}) {
  const clipId = 'c';
  const clip = shape === 'round'
    ? `<circle cx="50" cy="50" r="50"/>`
    : `<rect width="100" height="100" rx="${shape === 'maskable' ? 0 : RX}"/>`;
  const edge = shape === 'round'
    ? `<circle cx="50" cy="50" r="${(50 - SEAM / 2).toFixed(2)}" fill="none" stroke="#000" stroke-width="${SEAM}"/>`
    : shape === 'maskable'
      ? ''
      : `<rect x="${SEAM / 2}" y="${SEAM / 2}" width="${100 - SEAM}" height="${100 - SEAM}"`
        + ` rx="${(RX - SEAM / 2).toFixed(2)}" fill="none" stroke="#000" stroke-width="${SEAM}"/>`;
  const ground = opts.ground === null ? '' : `<rect width="100" height="100" fill="${opts.ground || TILE}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100"`
    + ` role="img" aria-label="enGender">`
    + `<defs><clipPath id="${clipId}"><rect width="100" height="100"/></clipPath>`
    + `<clipPath id="${clipId}s">${clip}</clipPath></defs>`
    + `<g clip-path="url(#${clipId}s)">${ground}${rings(stripes, opts)}${edge}</g></svg>`;
}

/* The mark on paper: one ink, four rings, no tile and no ground. */
function monoMark(size, ink) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100"`
    + ` role="img" aria-label="enGender">`
    + `<defs><clipPath id="m"><rect width="100" height="100"/></clipPath></defs>`
    + `<g clip-path="url(#m)">${rings([], { mono: true, ink })}</g></svg>`;
}

const PNG_SIZES = [512, 192, 96, 48, 32, 16];

async function main() {
  for (const d of ['svg', 'png', 'jpg']) mkdirSync(join(OUT, d), { recursive: true });
  const PAL = palettes();
  const jobs = [];

  for (const [flag, stripes] of Object.entries(PAL)) {
    for (const shape of ['tile', 'round', 'maskable']) {
      const svg = mark(stripes, shape, 512);
      writeFileSync(join(OUT, 'svg', `${flag}-${shape}.svg`), svg + '\n');
      const sizes = shape === 'tile' ? PNG_SIZES : [512];
      for (const size of sizes) jobs.push({ svg: mark(stripes, shape, size), size, file: join(OUT, 'png', `${flag}-${shape}-${size}.png`), type: 'png' });
    }
    /* A jpeg cannot hold transparency and does not need to here: the tile is
       white and opaque. Supplied for the surfaces that will only take one. */
    jobs.push({ svg: mark(stripes, 'tile', 512), size: 512, file: join(OUT, 'jpg', `${flag}-tile-512.jpg`), type: 'jpeg' });
  }

  for (const [name, ink] of [['mono', '#1E1B16'], ['mono-reversed', '#FFFFFF']]) {
    writeFileSync(join(OUT, 'svg', `mark-${name}.svg`), monoMark(512, ink) + '\n');
    jobs.push({ svg: monoMark(512, ink), size: 512, file: join(OUT, 'png', `mark-${name}-512.png`), type: 'png',
      ground: name === 'mono-reversed' ? '#000000' : null });
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
  console.log(`wrote ${Object.keys(PAL).length * 3 + 2} svg and ${jobs.length} raster files into ${OUT}`);
}

await main();
