/* Screenshots of the two surfaces ticket 27 adds: the figure list a take
   shows, and the metric reference it links into.

   Neither can be reached in the web demo. A benchmark needs a microphone
   the demo build has no way to open, so the journal never holds one and
   the compare tab stays empty - which is why this drives the browser
   tier's own probe page (tests/browser-tier/voice-metrics.html), where
   both surfaces mount against the app's real tokens and fonts over a
   fixed set of figures.

   Run: node tests/voice-metrics-gallery.mjs [outDir]
   Default outDir is .claude/voice-metric-shots, which is gitignored and
   durable - a shot written under /tmp is gone when the session exits. */
import { createServer } from 'vite';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './browser-harness.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(process.argv[2] ?? resolve(here, '../.claude/voice-metric-shots'));

/* Trans and nothing else: Alicja asked for the default palette only, and
   the shots exist to be looked at rather than to sweep a matrix. Both
   themes, because the default preference is `system` and either one is
   what somebody actually opens the screen in. */
const PALETTE = 'trans';
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

await page.goto(`http://localhost:${port}/voice-metrics.html`, { waitUntil: 'networkidle' });
await page.waitForSelector('body[data-voice-metrics-probe-ready]', { state: 'attached' });

for (const theme of THEMES) {
  await page.evaluate(
    ({ palette, theme }) => {
      document.documentElement.dataset.palette = palette;
      document.documentElement.dataset.theme = theme;
      // The probe stacks both surfaces in one document; a shot of one of
      // them should not carry the other's background through its margins.
      document.body.style.background = 'var(--bg)';
      document.body.style.padding = '16px';
    },
    { palette: PALETTE, theme }
  );

  for (const [name, selector] of [
    ['figures', '#figures'],
    ['reference', '#reference']
  ]) {
    const shot = `${outDir}/${name}-${PALETTE}-${theme}.png`;
    await page.locator(selector).screenshot({ path: shot });
    console.log(shot);
  }

  /* Two sections on their own as well, because the pair is the claim:
     pitch is the only Referenced figure and the only one that states a
     published range, and spread is an Own-series figure that has to read
     differently rather than just read shorter. */
  for (const section of ['pitch', 'spread']) {
    const shot = `${outDir}/${section}-section-${PALETTE}-${theme}.png`;
    await page.locator(`#${section}`).screenshot({ path: shot });
    console.log(shot);
  }
}

await browser.close();
await server.close();
