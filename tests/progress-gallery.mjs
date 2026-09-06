/* Screenshots of the progress bar (phase 9 audit ticket 11), one per
   palette per theme, plus a strip of the indeterminate sweep across one
   pass and one pass under reduced motion.

   The sweep strip is the reason this exists rather than a row on the
   control gallery: a single still of a looping animation says nothing
   about it, and four stills a third of a pass apart say most of what there
   is to say. Timed against --dur-sweep, which is 1400ms.

   Run: node tests/progress-gallery.mjs [outDir]
   Default outDir is .claude/progress-shots, which is gitignored and durable. */
import { createServer } from 'vite';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './browser-harness.mjs';
import { PALETTES } from './palettes.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(process.argv[2] ?? resolve(here, '../.claude/progress-shots'));

const THEMES = ['dark', 'light'];
const SWEEP_MS = 1400;
const SWEEP_STOPS = 4;

await mkdir(outDir, { recursive: true });

const server = await createServer({
  configFile: `${here}/browser-tier/browser-tier.vite.config.ts`,
  server: { port: 0 }
});
await server.listen();
const port = server.config.server.port;

const browser = await launchChromium();
const page = await browser.newPage({
  viewport: { width: 390, height: 900 },
  deviceScaleFactor: 2
});

await page.goto(`http://localhost:${port}/progress.html`, { waitUntil: 'networkidle' });
await page.waitForSelector('body[data-progress-ready]', { state: 'attached' });
await page.waitForFunction(() => document.querySelector('[data-progress="quarter"]') !== null);

async function shoot(name) {
  const file = `${outDir}/${name}.png`;
  await page.screenshot({ path: file, fullPage: true });
  console.log(file);
}

for (const palette of PALETTES) {
  for (const theme of THEMES) {
    await page.selectOption('select[aria-label="Palette"]', palette);
    await page.selectOption('select[aria-label="Theme"]', theme);
    // Long enough for the determinate fills to have finished their tween;
    // the sweeps are caught wherever they happen to be, which is what the
    // strip below is for.
    await page.waitForTimeout(500);
    await shoot(`progress-${palette}-${theme}`);
  }
}

/* One pass of the sweep, sampled. What to look at: the segment starts and
   ends off the track at either end, stretches as it crosses the middle,
   and never sits still at either edge. */
await page.selectOption('select[aria-label="Palette"]', 'trans');
for (const theme of THEMES) {
  await page.selectOption('select[aria-label="Theme"]', theme);
  await page.waitForTimeout(300);
  for (let stop = 0; stop < SWEEP_STOPS; stop++) {
    await page.waitForTimeout(SWEEP_MS / SWEEP_STOPS);
    await shoot(`progress-sweep-${theme}-${stop + 1}`);
  }
}

/* And once with motion off, where the sweep is meant to become a still
   half-lit track rather than nothing at all, and where a fill jumps to each
   sampled value instead of tweening to it. */
await page.selectOption('select[aria-label="Motion"]', 'reduce');
for (const theme of THEMES) {
  await page.selectOption('select[aria-label="Theme"]', theme);
  await page.waitForTimeout(400);
  await shoot(`progress-reduced-${theme}`);
}

await browser.close();
await server.close();
