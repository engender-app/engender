/* Screenshots of the control kit (phase 5 ticket 30), one per palette per
   theme, plus one pass under reduced motion.

   Same shape as tests/kit-gallery.mjs and for the same reason: a control
   nobody can look at is a control nobody has reviewed, and the grid is what
   catches the colour defects no test can see. The fixture is
   tests/browser-tier/controls.html.

   Run: node tests/controls-gallery.mjs [outDir]
   Default outDir is .claude/control-shots, which is gitignored and durable. */
import { createServer } from 'vite';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './browser-harness.mjs';
import { PALETTES } from './palettes.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(process.argv[2] ?? resolve(here, '../.claude/control-shots'));

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

await page.goto(`http://localhost:${port}/controls.html`, { waitUntil: 'networkidle' });
await page.waitForSelector('body[data-controls-ready]', { state: 'attached' });
await page.waitForFunction(() => document.querySelector('[data-slider]') !== null);

async function shoot(name) {
  const file = `${outDir}/${name}.png`;
  await page.screenshot({ path: file, fullPage: true });
  console.log(file);
}

for (const palette of PALETTES) {
  for (const theme of THEMES) {
    await page.selectOption('select[aria-label="Palette"]', palette);
    await page.selectOption('select[aria-label="Theme"]', theme);
    // Every transition on this page is well inside this; what is captured is
    // the resting state of every control.
    await page.waitForTimeout(400);
    await shoot(`controls-${palette}-${theme}`);
  }
}

/* The held state, which no resting screenshot can show and which is where
   most of this ticket's design decisions live: the readout leaves the right
   edge and travels to the thumb, the thumb takes its ring, and the ruler
   steps up a level of contrast. Held with a real pointer down on the thumb
   rather than by setting the class, so what is captured is the state the
   component actually produces. */
await page.selectOption('select[aria-label="Palette"]', 'trans');
for (const theme of THEMES) {
  await page.selectOption('select[aria-label="Theme"]', theme);
  const thumb = page.locator('[data-case="slider-hundred"] .slider-thumb');
  const box = await thumb.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(400);
  await shoot(`controls-held-${theme}`);
  await page.mouse.up();
  await page.waitForTimeout(200);
}

/* And once with motion off, where every press, travel and pop is meant to
   become an instant change of colour rather than nothing at all. */
await page.selectOption('select[aria-label="Motion"]', 'reduce');
await page.selectOption('select[aria-label="Theme"]', 'dark');
await page.waitForTimeout(300);
await shoot('controls-reduced-motion');

await browser.close();
await server.close();
