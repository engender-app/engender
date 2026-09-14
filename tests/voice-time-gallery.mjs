/* Where the voice spends its time, as crops to sign off (redesign ticket 42).

   Only what this ticket changed, per Alicja on redesign 07: the pitch
   figure with its new density, one group of figure blocks, the pair view's
   shared axis, and a picker row. Crops rather than screens, on the default
   flag in both themes.

   Two paths through the app, because the two halves of this screen are not
   reachable the same way. The record summary needs a take, so the fake
   microphone (tests/fake-microphone.mjs) reads the passage and the vowel
   step is skipped; the compare tab needs a history, which the demo fixture
   now seeds (data/demo/fullFixture.ts).

   Run: VITE_DEMO=1 npm run build   first, then
        node tests/voice-time-gallery.mjs [outDir] */
import { preview } from 'vite';
import { mkdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './browser-harness.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(process.argv[2] ?? resolve(here, '../.claude/voice-time'));
const THEMES = ['light', 'dark'];

const fakeMicrophoneSource = (await readFile(`${here}/fake-microphone.mjs`, 'utf8')).replace(
  /^export /gm,
  ''
);

await mkdir(outDir, { recursive: true });
const browser = await launchChromium({
  args: ['--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required']
});
const app = await preview({ preview: { port: 0 } });
const base = `http://localhost:${app.httpServer.address().port}`;

async function openPage() {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await page.addInitScript(`
    ${fakeMicrophoneSource}
    window.__fakeMicrophone = installFakeMicrophone('read');
  `);
  return page;
}

async function settle(page, path) {
  await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-app-root][data-boot="ready"]');
  if (await page.locator('[data-leave-setup]').count()) {
    await page.locator('[data-leave-setup]').click();
    await page.waitForSelector('[data-home-hello]');
    await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-app-root][data-boot="ready"]');
  }
}

async function dress(page, theme) {
  await settle(page, '/settings');
  await page.locator('[data-palette-pick="trans"]').click();
  await page.locator(`[data-segment="${theme}"]`).click();
  await page.waitForFunction((want) => document.documentElement.dataset.theme === want, theme);
}

async function clearToasts(page) {
  await page.evaluate(() => {
    for (const toast of document.querySelectorAll('[data-toast]')) toast.remove();
  });
}

/** The benchmarks the fixture seeds, which every crop below reads. */
async function seed(page) {
  await settle(page, '/');
  await page.locator('[data-fill-every-feature]').click();
  await page.waitForURL('**/more', { timeout: 180000 });
  await page.waitForTimeout(1500);
}

/** One take, read to the passage's floor and its vowels skipped, leaving
    the flow on its summary. */
async function read(page) {
  await page.locator('[data-vb-record]').click();
  await page.waitForTimeout(9500);
  await page.locator('[data-vb-stop]').click();
  for (let vowel = 0; vowel < 3; vowel++) {
    await page.waitForSelector('[data-vb-skip]', { timeout: 20000 });
    await page.locator('[data-vb-skip]').click();
    await page.waitForTimeout(700);
  }
  await page.waitForSelector('[data-vb-take]', { timeout: 20000 });
  await clearToasts(page);
}

for (const theme of THEMES) {
  const page = await openPage();
  await seed(page);
  await dress(page, theme);

  /* 1. The record summary: the pitch figure with its density, and the
        figure blocks under it. A take has to be read for either to exist,
        so the passage is read at the fake microphone's wandering rate and
        the three held vowels are skipped.

        Twice, because the two states of a figure block are both this
        ticket's: the first take has nothing behind it and says so, and the
        second draws the history with the ring on itself. The seeded
        benchmarks cannot supply that history - they were recorded through a
        capture chain this browser is not (ADR-0061), which is the rule
        working rather than a fixture problem. */
  await settle(page, '/practice/voice?tab=record');
  await clearToasts(page);
  await read(page);
  await page.locator('[data-vb-figures]').screenshot({ path: `${outDir}/figures-first-trans-${theme}.png` });
  await page.locator('[data-vb-save]').click();
  await page.waitForTimeout(1500);

  await settle(page, '/practice/voice?tab=record');
  await clearToasts(page);
  await read(page);
  await page.locator('[data-vb-take]').screenshot({ path: `${outDir}/take-trans-${theme}.png` });
  await page.locator('[data-vb-figures]').screenshot({ path: `${outDir}/figures-trans-${theme}.png` });
  await page.close();
}

for (const theme of THEMES) {
  const page = await openPage();
  await seed(page);
  await dress(page, theme);

  /* 2. The picking list, whose rows now carry each take's pitch, and 3. the
        pair view, whose two densities share one axis. */
  await settle(page, '/practice/voice?tab=compare');
  await page.waitForSelector('[data-voice-cell]');
  await clearToasts(page);
  await page.locator('[data-voice-cell]').first().screenshot({ path: `${outDir}/row-trans-${theme}.png` });

  const cells = page.locator('[data-voice-cell] .kit-row-main');
  await cells.nth(2).click();
  await cells.nth(5).click();
  await page.locator('[data-compare]').click();
  await page.waitForSelector('[data-vc-pair]', { timeout: 20000 });
  await page.waitForTimeout(1200);
  await clearToasts(page);
  await page.locator('[data-vc-pair]').screenshot({ path: `${outDir}/pair-trans-${theme}.png` });
  await page.close();
}

await app.httpServer.close();
await browser.close();
console.log(`wrote crops to ${outDir}`);
