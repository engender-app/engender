/* Screenshots of the two part-to-whole forms (phase 8 UX ticket 04,
   ADR-0058): the donut, the donut against its cap, and the ordered
   proportional strip.

   Card by card rather than page by page. tests/kit-gallery.mjs already
   shoots the whole fixture, but at 390px wide and fullPage the two new
   cards are a tenth of a very tall image, and the findings these forms
   have to survive are a fill against a card and a percentage against a
   ramp step - which means looking at them at size.

   Eight palettes and both themes by default, because a contrast floor
   applied to a fill is what once turned nonbinary's yellow to olive and
   the only way to know is to look at the real tokens. Pass a palette to
   narrow it: `node tests/parts-gallery.mjs out trans` shoots the default
   palette alone, which is what Alicja asked to sign off on.

   Run: node tests/parts-gallery.mjs [outDir] [palette]
   Default outDir is .claude/parts-shots, which is gitignored and durable.
   It changes no source file and needs no rebuild afterwards. */
import { createServer } from 'vite';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './browser-harness.mjs';
import { PALETTES } from './palettes.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(process.argv[2] ?? resolve(here, '../.claude/parts-shots'));
const only = process.argv[3];
const palettes = only ? PALETTES.filter((p) => p === only) : PALETTES;
if (palettes.length === 0) throw new Error(`no such palette: ${only}`);

const THEMES = ['dark', 'light'];
const CARDS = ['ordered-strip', 'donut', 'donut-capped'];
/* The strip's fills come off the mood ramp, which is chosen independently
   of the flag (ADR-0025), so the sixteen palette shots all draw the same
   four browns. The question the strip raises that the vertical
   distribution never did is whether two adjacent steps of one preset are
   telling apart when they touch - the columns had space between them - and
   that has to be looked at per preset. */
const MOOD_PRESETS = ['amber', 'teal', 'plum', 'moss'];

await mkdir(outDir, { recursive: true });

const server = await createServer({
  configFile: `${here}/browser-tier/browser-tier.vite.config.ts`,
  server: { port: 0 }
});
await server.listen();
const port = server.config.server.port;

const browser = await launchChromium();
const page = await browser.newPage({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 3 });

await page.goto(`http://localhost:${port}/kit.html`, { waitUntil: 'networkidle' });
await page.waitForSelector('body[data-kit-ready]', { state: 'attached' });
await page.waitForFunction(() => document.querySelector('[data-chart="donut"]') !== null);

for (const palette of palettes) {
  for (const theme of THEMES) {
    await page.selectOption('select[aria-label="Palette"]', palette);
    await page.selectOption('select[aria-label="Theme"]', theme);
    /* Both entrances are one --dur-slow plus a per-arc stagger, and what
       is being captured is where they come to rest. */
    await page.waitForTimeout(600);
    for (const card of CARDS) {
      const file = `${outDir}/${card}-${palette}-${theme}.png`;
      await page.locator(`[data-chart-card="${card}"]`).screenshot({ path: file });
      console.log(file);
    }
  }
}

/* The strip again, once per mood preset. The palette is left wherever the
   loop above ended it: what changes here is the ramp, and the only thing
   the palette contributes to this card is the surface behind it. */
for (const preset of MOOD_PRESETS) {
  await page.evaluate((p) => document.documentElement.setAttribute('data-mood-preset', p), preset);
  for (const theme of THEMES) {
    await page.selectOption('select[aria-label="Theme"]', theme);
    await page.waitForTimeout(300);
    const file = `${outDir}/ordered-strip-mood-${preset}-${theme}.png`;
    await page.locator('[data-chart-card="ordered-strip"]').screenshot({ path: file });
    console.log(file);
  }
}

await browser.close();
await server.close();
