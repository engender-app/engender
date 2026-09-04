/* Screenshots of the voice compare surface now that benchmarks share it
   (phase 5 deepening ticket 16): both kinds' empty states, the segmented
   control, the pitch trend, the two-benchmark compare view with its
   acoustic delta, and the delete confirm - then the benchmark list across
   all eight flags in both themes, which is where the trend chart's own
   colour lands.

   Two real benchmarks are recorded through the actual flow (fake
   microphone, same oscillator voice-benchmark-gallery.mjs uses) rather than
   seeded directly, so the screenshots are of what the app actually
   produces and saves, not of a fixture shaped to look right.

   Run: VITE_DEMO=1 npm run build   (or any demo build) first, then
        node tests/voice-compare-gallery.mjs [outDir]
   Default outDir is .claude/voice-compare-shots, gitignored and durable. */
import { preview } from 'vite';
import { mkdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './browser-harness.mjs';
import { PALETTES } from './palettes.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(process.argv[2] ?? resolve(here, '../.claude/voice-compare-shots'));
const THEMES = ['dark', 'light'];

const fakeMicrophoneSource = (await readFile(`${here}/fake-microphone.mjs`, 'utf8')).replace(/^export /gm, '');

await mkdir(outDir, { recursive: true });
const browser = await launchChromium({
  args: ['--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required']
});

const app = await preview({ preview: { port: 0 } });
const base = `http://localhost:${app.httpServer.address().port}`;
const shots = [];

async function openPage() {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await page.addInitScript(`
    ${fakeMicrophoneSource}
    window.__fakeMicrophone = installFakeMicrophone('steady');
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

async function dress(page, palette, theme) {
  await settle(page, '/settings');
  await page.locator(`[data-palette-pick="${palette}"]`).click();
  await page.locator(`[data-segment="${theme}"]`).click();
  await page.waitForFunction((want) => document.documentElement.dataset.theme === want, theme);
}

async function shoot(page, name) {
  await page.evaluate(() => {
    for (const toast of document.querySelectorAll('[data-toast]')) toast.remove();
  });
  await page.screenshot({ path: `${outDir}/${name}.png` });
  shots.push(name);
}

/** One full benchmark, through the real flow: passage, then the first held
    vowel, the other two skipped (ticket 30 - this gallery is of the
    compare surface, not of the recording flow's own three-note shape),
    then save. Lands back on /settings/voice, the flow's own destination. */
async function recordOneBenchmark(page) {
  await page.goto(`${base}/settings/voice?tab=record`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-vb-record]');
  await page.locator('[data-vb-record]').click();
  await page.waitForTimeout(2600);
  await page.locator('[data-vb-stop]').click();
  await page.waitForSelector('[data-vb-skip]', { timeout: 15000 });
  await page.locator('[data-vb-record]').click();
  await page.waitForSelector('[data-vb-skip]', { timeout: 20000 });
  await page.locator('[data-vb-skip]').click();
  await page.waitForSelector('[data-vb-skip]', { timeout: 20000 });
  await page.locator('[data-vb-skip]').click();
  await page.waitForSelector('[data-vb-save]', { timeout: 20000 });
  await page.waitForTimeout(300);
  await page.locator('[data-vb-save]').click();
  await page.waitForURL('**/settings/voice');
}

/* ---------- default flag: both kinds empty, then the benchmark states ---------- */
const page = await openPage();
await dress(page, 'trans', 'dark');

// 1. Both kinds start empty - the segmented control with nothing behind
//    either segment yet.
await settle(page, '/settings/voice');
await shoot(page, 'vc-1-recordings-empty');
await page.locator('button:has-text("Benchmarks")').click();
await page.waitForTimeout(350);
await shoot(page, 'vc-2-benchmarks-empty');

// 2. Two benchmarks, recorded for real.
await recordOneBenchmark(page);
await recordOneBenchmark(page);

// 3. The benchmark list: segmented control, trend chart, two picker rows.
await page.locator('button:has-text("Benchmarks")').click();
await page.waitForTimeout(350);
await shoot(page, 'vc-3-benchmarks-list');

// 4. Both picked - the compare button appears.
const cells = page.locator('[data-voice-cell]');
await cells.nth(0).click();
await cells.nth(1).click();
await page.waitForTimeout(200);
await shoot(page, 'vc-4-benchmarks-picked');

// 5. Comparing: two players, the acoustic delta underneath.
await page.locator('[data-compare]').click();
await page.waitForTimeout(200);
await shoot(page, 'vc-5-benchmarks-compare-delta');
await page.locator('.btn-soft:has-text("all")').click();

// 6. The delete confirm sheet.
await page.locator('button:has-text("Benchmarks")').click();
await page.waitForTimeout(350);
await page.locator('[data-delete-benchmark]').first().click();
await page.waitForTimeout(300);
await shoot(page, 'vc-6-benchmark-delete-confirm');
await page.keyboard.press('Escape');
await page.waitForTimeout(200);
await page.close();

/* ---------- the benchmark list across all eight flags, both themes ---------- */
for (const palette of PALETTES) {
  for (const theme of THEMES) {
    const flagPage = await openPage();
    await dress(flagPage, palette, theme);
    await recordOneBenchmark(flagPage);
    await recordOneBenchmark(flagPage);
    await flagPage.locator('button:has-text("Benchmarks")').click();
    await flagPage.waitForTimeout(350);
    await shoot(flagPage, `vc-flag-${palette}-${theme}`);
    await flagPage.close();
  }
}

await app.httpServer.close();
await browser.close();
console.log(`${shots.length} shots in ${outDir}`);
