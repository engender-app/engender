/* Screenshots of mood's ramp and mood's five faces (phase 10 ticket 27),
   one per preset per theme, plus one sweep across the eight flags.

   The icon gallery next door draws both mark families at every size and
   answers "do these read as one set". This one answers the two questions
   ticket 27 is: does each preset read as two colours end to end, and do the
   five faces still tell apart at 28px now that the drawing is filled rather
   than stroked. Only mood is on the page, so a reviewer is looking at what
   changed instead of finding it.

   Run: node tests/mood-gallery.mjs [outDir] [--tag before|after]
   Default outDir is .claude/mood-shots, which is gitignored and durable. */
import { createServer } from 'vite';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './browser-harness.mjs';
import { PALETTES } from './palettes.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const tagAt = args.indexOf('--tag');
const tag = tagAt === -1 ? '' : `${args[tagAt + 1]}-`;
const outArg = args.find((a, i) => !a.startsWith('--') && (tagAt === -1 || i !== tagAt + 1));
const outDir = resolve(outArg ?? resolve(here, '../.claude/mood-shots'));

const THEMES = ['dark', 'light'];
const PRESETS = ['amber', 'teal', 'plum', 'moss'];

await mkdir(outDir, { recursive: true });

const server = await createServer({
  configFile: `${here}/browser-tier/browser-tier.vite.config.ts`,
  server: { port: 0 }
});
await server.listen();
const port = server.config.server.port;

const browser = await launchChromium();
/* A phone's width, because the picker and the chip row are laid out against
   one and five faces on a 520 column would sit further apart than they ever
   do in the app. */
const page = await browser.newPage({
  viewport: { width: 390, height: 900 },
  deviceScaleFactor: 2
});

await page.goto(`http://localhost:${port}/mood.html`, { waitUntil: 'networkidle' });
await page.waitForSelector('body[data-mood-ready]', { state: 'attached' });
await page.waitForFunction(() => document.querySelector('.mood-face') !== null);
// Nunito and Outfit both come off disk here, and a label in a fallback face
// is a label at the wrong width.
await page.evaluate(() => document.fonts.ready);

async function shoot(file) {
  // The palette swap is a stylesheet change, not an animation; this is only
  // giving it a frame to land.
  await page.waitForTimeout(120);
  const path = `${outDir}/${tag}${file}.png`;
  await page.screenshot({ path, fullPage: true });
  console.log(path);
}

/* The pass that actually moves the faces: mood's scale is keyed on
   [data-mood-preset] rather than on the flag (ADR-0077), so it is these
   four and not the eight palettes that change them. */
for (const preset of PRESETS) {
  for (const theme of THEMES) {
    await page.selectOption('select[aria-label="Palette"]', 'trans');
    await page.selectOption('select[aria-label="Theme"]', theme);
    await page.selectOption('select[aria-label="Mood preset"]', preset);
    await shoot(`mood-${preset}-${theme}`);
  }
}

/* And the pass that proves the claim the other way round: the same preset
   against every flag, where only the ink, the page and the picked face's
   ring move. This is where a ramp that had quietly re-derived itself from
   the palette would show up, and where the eight inks on the same five
   fills are checked by eye against the 4.5:1 the test computes. */
for (const palette of PALETTES) {
  for (const theme of THEMES) {
    await page.selectOption('select[aria-label="Palette"]', palette);
    await page.selectOption('select[aria-label="Theme"]', theme);
    await page.selectOption('select[aria-label="Mood preset"]', 'amber');
    await shoot(`flags-${palette}-${theme}`);
  }
}

await browser.close();
await server.close();
