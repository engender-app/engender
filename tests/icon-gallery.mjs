/* Screenshots of the navigation set and mood's five faces (phase 5 ticket
   31), one per palette per theme.

   The marks have no screen of their own to be reviewed on - they are spread
   across every screen there is - so this is how they get looked at together:
   tests/browser-tier/icons.html draws both families at every size the app
   ships them, against the app's real tokens and fonts, and this drives it
   across all 8 palettes and both themes.

   Run: node tests/icon-gallery.mjs [outDir]
   Default outDir is .claude/icon-shots, which is gitignored and durable. */
import { createServer } from 'vite';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './browser-harness.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(process.argv[2] ?? resolve(here, '../.claude/icon-shots'));

const PALETTES = [
  'trans',
  'nonbinary',
  'genderfluid',
  'bisexual',
  'lesbian',
  'pansexual',
  'rainbow',
  'agender'
];
const THEMES = ['dark', 'light'];

await mkdir(outDir, { recursive: true });

const server = await createServer({
  configFile: `${here}/browser-tier/browser-tier.vite.config.ts`,
  server: { port: 0 }
});
await server.listen();
const port = server.config.server.port;

const browser = await launchChromium();
/* Wider than a phone on purpose. Nothing here is laid out against a
   viewport - every mark is drawn at a fixed pixel size - so the width is
   only deciding how many fit on a row, and a contact sheet is easier to
   judge than a column. */
const page = await browser.newPage({
  viewport: { width: 520, height: 900 },
  deviceScaleFactor: 2
});

await page.goto(`http://localhost:${port}/icons.html`, { waitUntil: 'networkidle' });
await page.waitForSelector('body[data-icons-ready]', { state: 'attached' });
// The five mood faces are the thing being judged, so wait for one.
await page.waitForFunction(() => document.querySelector('.mood-face') !== null);
// Nunito and Outfit both come off disk here, and a label in a fallback face
// is a label at the wrong width.
await page.evaluate(() => document.fonts.ready);

for (const palette of PALETTES) {
  for (const theme of THEMES) {
    await page.selectOption('select[aria-label="Palette"]', palette);
    await page.selectOption('select[aria-label="Theme"]', theme);
    // The faces blink nowhere on this page and nothing else here moves; this
    // is only giving the palette swap a frame to land.
    await page.waitForTimeout(120);
    const file = `${outDir}/icons-${palette}-${theme}.png`;
    await page.screenshot({ path: file, fullPage: true });
    console.log(file);
  }
}

await browser.close();
await server.close();
