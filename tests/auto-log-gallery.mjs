/* Sign-off renders for phase 11 ticket 11 ("A schedule can log its own
   doses"). Only what the ticket changed, in crops rather than whole screens
   (Alicja, on ticket 07's sign-off): the switch in the schedule editor off
   and on, an auto-logged row in the dose log beside a hand-logged one, that
   same row once it has been corrected, the dose panel's line on Today, and
   the dagger and legend the clinician summary prints. Trans, light and dark.

   Run against a demo build, from its own checkout as the cwd:

     VITE_DEMO=1 npm run build
     node tests/auto-log-gallery.mjs --out /abs/dir

   "Fill every feature" rather than the demo persona: the persona has no
   regimen episodes at all, and what this ticket needs is an episode with a
   daily schedule and an amount on it. The fixture's Progesterone is exactly
   that.

   The clock is moved on between flipping the switches and the reload that
   shoots the log, because the pass only ever writes a slot whose day has
   ended - a switch turned on today owes nothing until tomorrow, which is
   the rule and not a limitation of the render. How far on is worked out
   rather than fixed: the dose panel names the first active episode, which
   is the fixture's weekly Monday injection, and its line only draws when
   that slot was *yesterday* - so the run lands on the day after the next
   Monday, whichever weekday it is actually run on. The daily Progesterone
   then has several days' worth of rows for the log shot.

   Date is shimmed in the page rather than driven through Playwright's
   clock: the clock's timer control stalls the app's own settle, and all
   this needs is for `todayEpochDay()` to answer a few days later. */
import { preview } from 'vite';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './browser-harness.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? args[at + 1] : fallback;
};
const outDir = resolve(flag('out', resolve(here, '../.claude/auto-log-shots')));
/** The day after the next Monday, counted from today - see the header. */
const DAYS_AHEAD = (() => {
  let days = 2;
  while (new Date(Date.now() + (days - 1) * 86_400_000).getDay() !== 1) days++;
  return days;
})();

await mkdir(outDir, { recursive: true });
const browser = await launchChromium();
const app = await preview({ preview: { port: 0 } });
const base = `http://localhost:${app.httpServer.address().port}`;
const shots = [];
const errors = [];

for (const theme of ['light', 'dark']) {
  const page = await browser.newPage({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 2 });
  page.on('pageerror', (err) => errors.push(`${theme}: ${err}`));

  const strip = () =>
    page.evaluate(() => {
      for (const toast of document.querySelectorAll('[data-toast]')) toast.remove();
      for (const bar of document.querySelectorAll('.demo-bar')) bar.remove();
    });

  const settle = async (path) => {
    await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-app-root][data-boot="ready"]', { timeout: 30000 });
    if (await page.locator('[data-leave-setup]').count()) {
      await page.locator('[data-leave-setup]').click();
      await page.waitForSelector('[data-home-hello]');
      await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
      await page.waitForSelector('[data-app-root][data-boot="ready"]');
    }
  };

  const dress = async () => {
    await settle('/settings');
    await page.locator('[data-palette-pick="trans"]').click();
    await page.locator(`[data-segment="${theme}"]`).click();
    await page.waitForFunction((want) => document.documentElement.dataset.theme === want, theme);
  };

  /* One element, cropped: grow the viewport past the app's own scroll region
     so nothing is clipped by it, shoot the element where it really sits,
     then shrink back (stats-gallery.mjs's own trick). */
  const shootElement = async (selector, name) => {
    await strip();
    const tall = await page.evaluate(() => {
      const scroller = document.querySelector('[data-app-scroll-region]');
      const hidden = scroller ? scroller.scrollHeight - scroller.clientHeight : 0;
      return Math.min(window.innerHeight + hidden + 40, 12000);
    });
    await page.setViewportSize({ width: 390, height: tall });
    await page.waitForTimeout(500);
    const file = `${outDir}/${name}-trans-${theme}.png`;
    await page.locator(selector).first().screenshot({ path: file });
    await page.setViewportSize({ width: 390, height: 900 });
    await page.waitForTimeout(300);
    shots.push(`${name}-trans-${theme}`);
  };

  await settle('/');
  await page.locator('[data-fill-every-feature]').click();
  await page.waitForURL('**/more', { timeout: 180000 });
  await dress();

  /* --- 1 and 2. The switch in the schedule editor, off and on. The "before"
     for this crop is the ticket's own absence: the same block ended at the
     save button. Progesterone because the fixture gives it a daily
     recurrence and an amount, which is what the switch is offered on. */
  const openEpisode = async (drug) => {
    await settle('/care/regimen');
    await page.getByText(drug, { exact: false }).first().click();
    await page.waitForSelector('[data-auto-log-switch]', { timeout: 15000 });
    await page.waitForTimeout(600);
  };

  const flipSwitchOn = async () => {
    await page.locator('[data-auto-log-switch] [role="switch"]').click();
    await page.waitForFunction(
      () => document.querySelector('[data-auto-log-switch] [role="switch"]')?.getAttribute('aria-checked') === 'true'
    );
    await page.waitForTimeout(600);
  };

  await openEpisode('Progesterone');
  await shootElement('[data-auto-log-switch]', '01-switch-off');
  await flipSwitchOn();
  await shootElement('[data-auto-log-switch]', '02-switch-on');

  /* The weekly injection as well, because the dose panel names the first
     active episode and that is this one. It is also the case worth having in
     the log: an auto-logged injection carries no site, since where it went
     is not something the app can know. */
  await openEpisode('Estradiol valerate');
  await flipSwitchOn();

  /* Three days on, so the pass has three ended days to write for. Applied
     as an init script, which means every navigation from here on is three
     days later - including the reload that runs boot's housekeeping. */
  await page.addInitScript((days) => {
    const shift = days * 86_400_000;
    const RealDate = Date;
    const Shifted = class extends RealDate {
      constructor(...a) {
        if (a.length === 0) super(RealDate.now() + shift);
        else super(...a);
      }
      static now() {
        return RealDate.now() + shift;
      }
    };
    // eslint-disable-next-line no-global-assign
    Date = Shifted;
  }, DAYS_AHEAD);

  /* --- 3. The dose log: the rows the schedule wrote, each with its marker
     and its one-tap correction, above the rows the person logged by hand -
     which is the before and the after in one crop. */
  await settle('/care/doses');
  await page.waitForSelector('[data-dose-skip]', { timeout: 30000 });
  await page.waitForTimeout(1200);
  await shootElement('[data-batched-list="doses"]', '03-log-auto-logged');

  /* --- 4. The same rows after one has been corrected: the sentence changes
     and the control goes, and the row says both things at once. */
  await page.locator('[data-dose-skip]').first().click();
  await page.waitForTimeout(900);
  await shootElement('[data-batched-list="doses"]', '04-log-corrected');

  // --- 5. Today's dose panel, on the morning after a slot was written.
  await settle('/');
  await page.waitForSelector('[data-dose-panel-tile]', { timeout: 30000 });
  await page.waitForTimeout(1200);
  await shootElement('[data-dose-panel-tile]', '05-dose-panel');

  /* --- 6. What leaves the device, in print media rather than on screen:
     the marked rows are past the screen preview's twelve-row floor and the
     status column they carry the dagger in is off the right edge of a
     390px table. Both are screen-only facts (ticket 08 draws the preview
     short on purpose), and what this shot has to answer is what a clinician
     reads on paper. Clipped from the first marked row to the legend. */
  await settle('/health/clinician-summary');
  await page.waitForSelector('[data-dossier-auto-logged-legend]', { timeout: 30000 });
  await page.emulateMedia({ media: 'print' });
  await page.waitForTimeout(1200);
  await strip();
  {
    const tall = await page.evaluate(() => Math.min(document.body.scrollHeight + 40, 30000));
    await page.setViewportSize({ width: 720, height: Math.min(tall, 12000) });
    await page.waitForTimeout(500);
    const box = await page.evaluate(() => {
      const mark = document.querySelector('[data-dose-auto-logged]');
      const legend = document.querySelector('[data-dossier-auto-logged-legend]');
      if (!mark || !legend) return null;
      const top = mark.closest('tr').getBoundingClientRect().top + window.scrollY;
      const bottom = legend.getBoundingClientRect().bottom + window.scrollY;
      return { top: Math.max(0, top - 56), bottom: bottom + 12 };
    });
    if (!box) {
      errors.push('found no marked dose row or legend to clip the print shot at');
    } else {
      const file = `${outDir}/06-clinician-summary-trans-${theme}.png`;
      await page.screenshot({
        path: file,
        clip: { x: 0, y: box.top, width: 720, height: Math.min(box.bottom - box.top, 3000) }
      });
      shots.push(`06-clinician-summary-trans-${theme}`);
    }
    await page.setViewportSize({ width: 390, height: 900 });
  }
  await page.emulateMedia({ media: 'screen' });

  await page.close();
}

console.log(`${shots.length} shot(s) in ${outDir}:`);
for (const s of shots) console.log(' -', s);
if (errors.length) {
  console.log(`\n${errors.length} PAGE ERROR(S):`);
  for (const e of errors) console.log(' -', e);
}
await app.httpServer.close();
await browser.close();
