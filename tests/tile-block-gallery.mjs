/* Screenshots of the tile, one crop per shape per palette per theme
   (redesign ticket 24).

   Crops rather than pages: what this ticket changed is the tile, and a
   review page of whole screens is how a reviewer ends up judging the parts
   of the app that have not been rebuilt yet. Each `section[data-shape]` on
   tests/browser-tier/tile-block.html is shot on its own.

   Run: node tests/tile-block-gallery.mjs [outDir]
   Default outDir is .claude/tile-shots, which is gitignored and durable. */
import { createServer } from 'vite';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './browser-harness.mjs';
import { PALETTES } from './palettes.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(process.argv[2] ?? resolve(here, '../.claude/tile-shots'));

const THEMES = ['dark', 'light'];
const SHAPES = ['plain', 'action', 'dismiss', 'both', 'row', 'tight', 'disguise'];

await mkdir(outDir, { recursive: true });

const server = await createServer({
  configFile: `${here}/browser-tier/browser-tier.vite.config.ts`,
  server: { port: 0 }
});
await server.listen();
const port = server.config.server.port;

const browser = await launchChromium();
const page = await browser.newPage({
  viewport: { width: 390, height: 1400 },
  deviceScaleFactor: 2
});

await page.goto(`http://localhost:${port}/tile-block.html`, { waitUntil: 'networkidle' });
await page.waitForSelector('body[data-tile-block-ready]', { state: 'attached' });
await page.waitForFunction(() => document.querySelector('[data-tile-grid]') !== null);

for (const palette of PALETTES) {
  for (const theme of THEMES) {
    await page.selectOption('select[aria-label="Palette"]', palette);
    await page.selectOption('select[aria-label="Theme"]', theme);
    // Nothing here animates at rest; this is the paint after the roles were
    // re-read off the new palette.
    await page.waitForTimeout(250);
    for (const shape of SHAPES) {
      const file = `${outDir}/tile-${shape}-${palette}-${theme}.png`;
      await page.locator(`section[data-shape="${shape}"]`).screenshot({ path: file });
      console.log(file);
    }
  }
}

await browser.close();
await server.close();
