/* Screenshots of the practice tab's new records (phase 8 features ticket
   10): the idle lead once stopping means something, the felt-sense review
   after a take, a freshly saved take still sealed, and the same take once
   its seal has opened.

   Goes through the real flow against the fake microphone
   (tests/fake-microphone.mjs), the same 185 Hz oscillator the browser-tier
   probe and ticket 09's own gallery use. The seal opens the day after a
   take, so seeing the revealed figures needs tomorrow: Playwright's clock
   is installed and moved forward by a day rather than waiting for one, and
   only after the take is already saved - todayEpochDay() reads the clock
   directly (epochDay.ts), and the live gauge's own poll runs on
   setInterval, which a clock installed any earlier would have to be ticked
   through by hand.

   Default palette and theme only, at Alicja's request for this round of
   sign-off - the palette sweep is voice-benchmark-gallery.mjs's job and
   still does it for the figures this ticket draws on top of.

   Run: VITE_DEMO=1 npm run build   (or any demo build) first, then
        node tests/voice-practice-gallery.mjs [outDir]
   Default outDir is .claude/voice-practice-shots, gitignored and durable. */
import { preview } from 'vite';
import { mkdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './browser-harness.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(process.argv[2] ?? resolve(here, '../.claude/voice-practice-shots'));
const DAY_MS = 24 * 60 * 60 * 1000;

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
    document.querySelector('.demo-bar')?.remove();
    for (const el of document.querySelectorAll('.editor-savebar, [class*="app-nav"], nav')) {
      if (getComputedStyle(el).position !== 'static') el.style.position = 'static';
    }
  });
  await page.screenshot({ path: `${outDir}/${name}.png`, fullPage: true });
  shots.push(name);
}

const page = await openPage();
await dress(page, 'trans', 'light');
await settle(page, '/settings/voice');
await page.locator('[data-segment="practise"]').click();
await page.waitForSelector('[data-comfort-band]');
await page.waitForTimeout(300);

// 1. The idle tab, with the lead now that stopping can save something.
await shoot(page, 'vp-1-idle');

// 2. Stop offers the felt-sense dial rather than saving straight away.
await page.locator('[data-vp-start]').click();
await page.waitForTimeout(2400);
await page.locator('[data-vp-stop]').click();
await page.waitForSelector('[data-vp-save]', { timeout: 15000 });
await shoot(page, 'vp-2-review-before-felt-sense');

// 3. A felt-sense rating picked, still on the same screen.
await page.locator('[data-mood="4"]').click();
await page.waitForTimeout(200);
await shoot(page, 'vp-3-review-with-felt-sense');

// 4. Saved, and sealed until tomorrow - no figures on screen at all.
await page.locator('[data-vp-save]').click();
await page.waitForSelector('[data-practice-take]', { timeout: 10000 });
await page.waitForTimeout(300);
await shoot(page, 'vp-4-saved-sealed');

// 5. The same take, its seal opened by a day passing. The clock is
//    installed only now, after the live gauge's own polling is done with,
//    and moved forward rather than paused-and-ticked, since nothing after
//    this point depends on real elapsed time.
await page.clock.install({ time: Date.now() });
await page.clock.setSystemTime(Date.now() + DAY_MS + 60_000);
await page.goto(`${base}/settings/voice?tab=practise`, { waitUntil: 'networkidle' });
await page.waitForSelector('[data-app-root][data-boot="ready"]');
await page.waitForSelector('[data-practice-take]');
await page.waitForTimeout(300);
await shoot(page, 'vp-5-revealed');

await page.close();

await app.httpServer.close();
await browser.close();
console.log(`${shots.length} shots in ${outDir}`);
