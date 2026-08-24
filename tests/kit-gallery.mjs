/* Screenshots of the surface kit and the chart kit (phase 5 ticket 20),
   one per palette per theme.

   The kit has no screen to live on until the screen tickets land, so this
   is how it gets looked at: tests/browser-tier/kit.html mounts every
   component against the app's real tokens and fonts, and this drives it
   across all 8 palettes x both themes at phone width.

   Run: node tests/kit-gallery.mjs [outDir]
   Default outDir is .claude/kit-shots, which is gitignored and durable. */
import { createServer } from 'vite';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './browser-harness.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(process.argv[2] ?? resolve(here, '../.claude/kit-shots'));

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
const page = await browser.newPage({
  viewport: { width: 390, height: 900 },
  deviceScaleFactor: 2
});

await page.goto(`http://localhost:${port}/kit.html`, { waitUntil: 'networkidle' });
await page.waitForSelector('body[data-kit-ready]', { state: 'attached' });
// The gallery reads --motif-stripes on mount, and the roles it hands the
// surfaces are the whole point of half these screenshots.
await page.waitForFunction(() => document.querySelector('[data-list-card]') !== null);

for (const palette of PALETTES) {
  for (const theme of THEMES) {
    await page.selectOption('select[aria-label="Palette"]', palette);
    await page.selectOption('select[aria-label="Theme"]', theme);
    // The sun's rings and the chart's tween both settle well inside this;
    // what is being captured is the resting state of every surface.
    await page.waitForTimeout(500);
    const file = `${outDir}/kit-${palette}-${theme}.png`;
    await page.screenshot({ path: file, fullPage: true });
    console.log(file);
  }
}

await browser.close();
await server.close();
