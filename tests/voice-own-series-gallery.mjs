/* Screenshots of the own-series card ticket 29 adds: one figure at a time,
   over a history that spans two phones, plus the two empty states.

   It cannot be reached in the web demo. A benchmark needs a microphone the
   demo build has no way to open, so the demo journal never holds one and
   the compare tab has nothing to draw - the same reason ticket 27's shots
   come off the browser tier. So this drives that probe page
   (tests/browser-tier/voice-own-series.html), where the card mounts against
   the app's real tokens and fonts over a fixed set of benchmarks.

   Run: node tests/voice-own-series-gallery.mjs [outDir]
   Default outDir is .claude/voice-own-series-shots, which is gitignored and
   durable - a shot written under /tmp is gone when the session exits. */
import { createServer } from 'vite';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './browser-harness.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(process.argv[2] ?? resolve(here, '../.claude/voice-own-series-shots'));

/* Trans and nothing else: Alicja asked for the default palette only. Both
   themes, because the default preference is `system` and either one is what
   somebody actually opens the screen in. */
const PALETTE = 'trans';
const THEMES = ['dark', 'light'];

/* Every figure the card offers. Named here rather than read off the picker
   so a missing one shows up as a failed screenshot rather than a shorter
   gallery. */
const FIGURES = ['span', 'spread', 'rate', 'resonance', 'room'];

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

await page.goto(`http://localhost:${port}/voice-own-series.html`, { waitUntil: 'networkidle' });
await page.waitForSelector('body[data-voice-own-series-probe-ready]', { state: 'attached' });

/** Picks a figure on one card and lets the chart's tween settle before the
    shutter. */
async function pick(container, figure) {
  await page.evaluate(
    ({ container, figure }) => {
      const select = document.querySelector(`${container} [data-chart-picker="voice-own-figure"]`);
      select.value = figure;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    },
    { container, figure }
  );
  await page.waitForTimeout(700);
  /* The probe put a finger on every plot to read its scrub value; a shot
     of the card is of the card at rest. */
  await page.evaluate(() => {
    for (const plot of document.querySelectorAll('[data-chart="area"]')) {
      plot.dispatchEvent(new PointerEvent('pointerleave', { bubbles: true }));
    }
  });
}

for (const theme of THEMES) {
  await page.evaluate(
    ({ palette, theme }) => {
      document.documentElement.dataset.palette = palette;
      document.documentElement.dataset.theme = theme;
      // The probe stacks three cards in one document; a shot of one should
      // not carry the page's default background through its margins.
      document.body.style.background = 'var(--bg)';
      document.body.style.padding = '16px';
    },
    { palette: PALETTE, theme }
  );

  for (const figure of FIGURES) {
    await pick('#series', figure);
    const shot = `${outDir}/${figure}-${PALETTE}-${theme}.png`;
    await page.locator('#series .kit-chart').screenshot({ path: shot });
    console.log(shot);
  }

  /* The two empty cards, which are two different sentences: a journal with
     one benchmark in it, and a figure no take has ever measured. */
  for (const [name, selector] of [
    ['one-benchmark', '#single .kit-chart'],
    ['never-measured', '#unmeasured .kit-chart']
  ]) {
    const shot = `${outDir}/${name}-${PALETTE}-${theme}.png`;
    await page.locator(selector).screenshot({ path: shot });
    console.log(shot);
  }
}

await browser.close();
await server.close();
