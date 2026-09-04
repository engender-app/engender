/* Screenshots of "an area you are done with" (phase 8 features ticket 04):
   the control on an area's own screen, its confirmation, the finished state,
   the way back out of it, the offer, the mark a finish day draws on a chart,
   and the line it prints for a clinician.

   Default flag only, both themes, which is what the sign-off asked for.

   Run: VITE_DEMO=1 npm run build   first, then
        node tests/area-finish-gallery.mjs [outDir]
   Default outDir is .claude/area-finish-shots, which is gitignored. */
import { preview } from 'vite';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './browser-harness.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(process.argv[2] ?? resolve(here, '../.claude/area-finish-shots'));

await mkdir(outDir, { recursive: true });
const browser = await launchChromium();
const app = await preview({ preview: { port: 0 } });
const base = `http://localhost:${app.httpServer.address().port}`;
const shots = [];

/* Far enough past the demo persona's own last write that every area reads as
   quiet (areaGroups.ts's FINISH_SUGGESTION_QUIET_DAYS is 180, and the
   persona spans about 150 days). Moving the clock rather than backdating a
   record through the date picker: the offer is a question about elapsed
   time, and elapsed time is the honest way to produce one. */
const OFFER_SKIP_DAYS = 260;

/** The day the size log is said to have ended. Fifteen back, so the mark it
    draws sits in the middle of /stats' default thirty-day window rather than
    on either edge, where nobody could tell whether it drew at all. */
const ENDED_ON = new Date(Date.now() - 15 * 86400_000).toISOString().slice(0, 10);

for (const theme of ['light', 'dark']) {
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    colorScheme: theme
  });

  const shoot = async (name, fullPage = false) => {
    await page.evaluate(() => {
      for (const toast of document.querySelectorAll('[data-toast]')) toast.remove();
      // Review chrome, not the app: it is fixed to the top and would cover
      // half of every picture here.
      for (const bar of document.querySelectorAll('.demo-bar')) bar.remove();
    });
    const file = `${outDir}/${name}-trans-${theme}.png`;
    await page.screenshot({ path: file, fullPage });
    shots.push(`${name}-trans-${theme}`);
  };

  /** To the foot of the screen, where this control lives - `scrollIntoView`
      alone leaves it under the fixed bottom nav. */
  const toFoot = async () => {
    /* `.app-main` and not the window: the shell is a fixed-height flex
       column and the scrolling element is inside it (app.css). */
    const bottom = () =>
      page.evaluate(() => {
        const main = document.querySelector('.app-main');
        if (main) main.scrollTop = main.scrollHeight;
      });
    /* Twice, because the card animates its own height when it gains or
       loses a row (`resize`) and the first measurement is taken against a
       page that is still settling. */
    await bottom();
    await page.waitForTimeout(400);
    await bottom();
    await page.waitForTimeout(300);
  };

  const settle = async (path) => {
    await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-app-root][data-boot="ready"]');
    if (await page.locator('[data-leave-setup]').count()) {
      await page.locator('[data-leave-setup]').click();
      await page.waitForSelector('[data-home-hello]');
      await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
      await page.waitForSelector('[data-app-root][data-boot="ready"]');
    }
  };

  await settle('/settings');
  await page.locator('[data-palette-pick="trans"]').click();
  await page.locator(`[data-segment="${theme}"]`).click();
  await page.waitForFunction((want) => document.documentElement.dataset.theme === want, theme);

  /* The persona alone leaves most of these eight screens empty; this is the
     jump that puts real content on all of them. It resolves by navigating to
     /more, so that is what to wait for rather than a timeout. */
  await settle('/');
  await page.locator('[data-fill-every-feature]').click();
  await page.waitForURL('**/more');
  await page.waitForTimeout(500);

  /* ---------- the control, on the size log ---------- */
  await settle('/settings/sizes');
  await page.locator('[data-area-finish]').waitFor();
  await toFoot();
  await shoot('01-control');

  await page.locator('[data-area-finish]').click();
  await page.waitForSelector('[data-area-finish-confirm]');
  /* A day inside the default stats window rather than today, so the mark it
     draws further down lands in the middle of a chart instead of on its
     right-hand edge, where nobody could see whether it drew at all. */
  await page.evaluate((iso) => {
    const field = document.querySelector('#area-finish-date');
    field._flatpickr.setDate(iso, true);
  }, ENDED_ON);
  await page.waitForTimeout(400);
  await shoot('02-confirmation');

  await page.locator('[data-area-finish-confirm]').click();
  await page.locator('[data-area-finished]').waitFor();
  await toFoot();
  await shoot('03-finished');

  /* ---------- what the finish day does elsewhere ---------- */
  await settle('/stats');
  await page.waitForTimeout(900);
  await shoot('04-chart-mark', true);

  await settle('/settings/clinician-summary');
  await page.waitForSelector('[data-dossier-section="finishedAreas"]');
  await page.locator('[data-dossier-section="finishedAreas"]').scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await shoot('05-clinician-line');

  /* ---------- and back out of it, which has to be one tap ---------- */
  await settle('/settings/sizes');
  await toFoot();
  await page.locator('[data-area-finish-undo]').click();
  await page.locator('[data-area-finish]').waitFor();
  await toFoot();
  await shoot('06-picked-back-up');

  /* ---------- the offer, months later ---------- */
  await page.clock.install({ time: new Date(Date.now() + OFFER_SKIP_DAYS * 86400_000) });
  await settle('/settings/sizes');
  await page.locator('[data-area-finish-offer]').waitFor();
  /* Both answers have to be in frame together: the whole point of the rework
     is that the no is a labelled row rather than an unmarked x. */
  await page.locator('[data-area-finish-decline]').waitFor();
  await toFoot();
  await shoot('07-offer');

  /* ---------- and the no, which the app never takes back ---------- */
  await page.locator('[data-area-finish-decline]').click();
  await page.locator('[data-area-finish]').waitFor();
  await toFoot();
  await shoot('08-offer-declined');

  await page.close();
}

await app.httpServer.close();
await browser.close();

console.log(`${shots.length} shot(s) in ${outDir}`);
for (const shot of shots) console.log(' ', shot);
