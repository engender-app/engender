/* Screenshots of ticket 09's hover/tap interaction on the bar and donut
   charts: default, hovered, and touch-tapped, for two palettes (trans -
   the reference ramp - and nonbinary, the one ADR-0025's own hover blend
   had to be checked against once already) across both themes.

   Cropped to each chart's own card rather than the full kit page: what
   changed is inside those two cards, and a full-page shot would bury the
   thing being reviewed in seven other components that did not change.

   Run: node tests/chart-hover-gallery.mjs [outDir]
   Default outDir is .claude/chart-hover-shots, which is gitignored and durable. */
import { createServer } from 'vite';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './browser-harness.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(process.argv[2] ?? resolve(here, '../.claude/chart-hover-shots'));

const PALETTES = ['trans', 'nonbinary'];
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
await page.waitForFunction(() => document.querySelector('[data-list-card]') !== null);

const stripCard = page.locator('[data-chart-card="ordered-strip"]');
const donutCard = page.locator('[data-chart-card="donut"]').first();
const narrowSegment = stripCard.locator('[data-strip-step="1"]');
const donutLegendWork = donutCard.locator('[data-donut-slice="work"]');

async function shoot(locator, name) {
  const file = `${outDir}/${name}.png`;
  await locator.screenshot({ path: file });
  console.log(file);
}

for (const palette of PALETTES) {
  for (const theme of THEMES) {
    await page.selectOption('select[aria-label="Palette"]', palette);
    await page.selectOption('select[aria-label="Theme"]', theme);
    await page.waitForTimeout(500);

    await shoot(stripCard, `strip-${palette}-${theme}-default`);
    await shoot(donutCard, `donut-${palette}-${theme}-default`);

    await narrowSegment.hover();
    await page.waitForTimeout(200);
    await shoot(stripCard, `strip-${palette}-${theme}-hover`);
    await stripCard.locator('[data-chart="ordered-strip"] .kit-ordered-ends').hover();

    await donutLegendWork.hover();
    await page.waitForTimeout(200);
    await shoot(donutCard, `donut-${palette}-${theme}-hover`);
    await donutCard.locator('.kit-donut-total').hover();

    await narrowSegment.dispatchEvent('pointerup', { pointerType: 'touch' });
    await page.waitForTimeout(200);
    await shoot(stripCard, `strip-${palette}-${theme}-tap`);
    await narrowSegment.dispatchEvent('pointerup', { pointerType: 'touch' });
  }
}

await browser.close();
await server.close();
