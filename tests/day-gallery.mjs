/* Screenshots of what a day looks like (phase 5 deepening ticket 21): the
   three day shapes the ticket names - one entry and nothing else, a day
   someone logged properly, and every registered section at once - across all
   8 palettes and both themes.

   The route cannot be driven to those three shapes without seeding three
   journals, so this drives tests/browser-tier/day.html, which mounts the real
   DayRecords.svelte with a fabricated `DayRecords`. What is being looked at
   is the composition: whether a sparse day still looks like the screen it
   was, and whether a maximal one reads as a day rather than as a dump.

   Run: npm run gallery:day  (or node tests/day-gallery.mjs [outDir])
   Default outDir is .claude/day-shots, which is gitignored and durable. */
import { createServer } from 'vite';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './browser-harness.mjs';
import { PALETTES } from './palettes.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(process.argv[2] ?? resolve(here, '../.claude/day-shots'));

const THEMES = ['dark', 'light'];
const SHAPES = ['sparse', 'typical', 'maximal'];

await mkdir(outDir, { recursive: true });

const fixture = await createServer({
  configFile: `${here}/browser-tier/browser-tier.vite.config.ts`,
  server: { port: 0 }
});
await fixture.listen();

const browser = await launchChromium();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await page.goto(`http://localhost:${fixture.config.server.port}/day.html`, { waitUntil: 'networkidle' });
await page.waitForSelector('body[data-day-ready]', { state: 'attached' });

const shots = [];

const select = async (label, value) => {
  await page.selectOption(`select[aria-label="${label}"]`, value);
  // The stage is keyed, so this is the remount settling rather than an
  // entrance: nothing on this screen animates in (DIRECTION, tier 4).
  await page.waitForTimeout(150);
};

/* The selectors are for driving the page by hand; they are not part of what
   is being looked at, so they come off for the picture and go back on. */
async function shoot(name) {
  await page.addStyleTag({ content: '.stage-controls { display: none !important; }' });
  await page.screenshot({ path: `${outDir}/${name}.png`, fullPage: true });
  await page.evaluate(() => document.head.querySelectorAll('style').forEach((s) => {
    if (s.textContent?.includes('.stage-controls')) s.remove();
  }));
  shots.push(name);
}

/* Every shape on every flag in both themes - 48 pictures. The ticket asks
   for all three days across 8 palettes x 2 themes and it is right to: the
   sparse day is the one that has to keep looking like the screen it was, and
   the day card's own stripe is the only colour on it. */
for (const shape of SHAPES) {
  await select('Day', shape);
  for (const palette of PALETTES) {
    await select('Palette', palette);
    for (const theme of THEMES) {
      await select('Theme', theme);
      await shoot(`day-${shape}-${palette}-${theme}`);
    }
  }
}

await browser.close();
await fixture.close();

console.log(`${shots.length} shots in ${outDir}`);
for (const shot of shots) console.log(`  ${shot}.png`);
