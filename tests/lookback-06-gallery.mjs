/* Sign-off renders for phase 11 ticket 06 ("The span rail says what is
   behind you"). Only what the ticket changed, in crops rather than whole
   screens (Alicja, on ticket 07's sign-off): the rail with its state line,
   its legend and its first-arrival hint, at rest and mid-drag - trans,
   light and dark, before and after.

   Run against each build separately, from that build's own checkout as the
   cwd (vite's preview({ root }) serves the cwd's build):

     cd <before-checkout> && VITE_DEMO=1 npm run build
     node <this-repo>/tests/lookback-06-gallery.mjs --tag before --out /abs/dir

     cd <after-checkout> && VITE_DEMO=1 npm run build
     node <this-repo>/tests/lookback-06-gallery.mjs --tag after --out /abs/dir

   "Fill every feature" rather than the demo persona, and that is the whole
   point of this gallery: the persona writes entries, milestones and eras and
   nothing else, so three of the four band kinds - the regimen episodes, the
   tryouts, the breaks - and every surgery mark are absent from it. The
   fixture is what puts four kinds on one rail, which is the case the legend
   and the Polish 390px reading both have to survive.

   The hint only draws on a journal that has never been dragged, and the
   preference recording that survives a demo reseed, so the run clears it
   before the rest-of-rail shot. Mid-drag is a real pointer drag on the start
   handle, held rather than released, so the shot catches the handle under
   the finger with the transitions off - which is the state the rail's own
   "direct manipulation is not animation" rule is about. */
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
const tag = flag('tag', 'after');
const outDir = resolve(flag('out', resolve(here, '../.claude/lookback-06-shots')), tag);

await mkdir(outDir, { recursive: true });
const browser = await launchChromium();
const app = await preview({ preview: { port: 0 } });
const base = `http://localhost:${app.httpServer.address().port}`;
const shots = [];
const errors = [];

for (const theme of ['light', 'dark']) {
  const page = await browser.newPage({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 2 });
  page.on('pageerror', (err) => errors.push(String(err)));

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

  /* After the fill, never before: resetDemoFull() writes the preferences
     back, so a palette and theme set first are gone by the time the shots
     are taken (ticket 71's four mislabelled "dark" renders). */
  const dress = async () => {
    await settle('/settings');
    await page.locator('[data-palette-pick="trans"]').click();
    await page.locator(`[data-segment="${theme}"]`).click();
    await page.waitForFunction((want) => document.documentElement.dataset.theme === want, theme);
  };

  /* One element, cropped: grow the viewport past the app's own scroll
     region so nothing is clipped by it, screenshot the element at its real
     layout position, then shrink back (stats-gallery.mjs's own trick). */
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

  /* The whole top of the door, down to the first heading: before, that is
     the title with the span as its subtitle, the quick picks and a rail
     with nothing under it; after, it is the title alone and the rail
     carrying its own line, legend and hint. */
  const shootTopOfDoor = async (name) => {
    await strip();
    const tall = await page.evaluate(() => {
      const scroller = document.querySelector('[data-app-scroll-region]');
      const hidden = scroller ? scroller.scrollHeight - scroller.clientHeight : 0;
      return Math.min(window.innerHeight + hidden + 40, 12000);
    });
    await page.setViewportSize({ width: 390, height: tall });
    await page.waitForTimeout(400);
    const cut = await page.evaluate(() => {
      const heading = document.querySelector('[data-section-heading]');
      return heading ? heading.getBoundingClientRect().top : null;
    });
    if (cut === null) {
      errors.push(`${name}: found no section heading to crop the top of the door at`);
    } else {
      const file = `${outDir}/${name}-trans-${theme}.png`;
      await page.screenshot({ path: file, clip: { x: 0, y: 0, width: 390, height: Math.round(cut) } });
      shots.push(`${name}-trans-${theme}`);
    }
    await page.setViewportSize({ width: 390, height: 900 });
    await page.waitForTimeout(300);
  };

  /* Fill every feature, which navigates to /more when the seeding lands
     (DemoBar.svelte) - waited for rather than timed, since the seed is long
     and the navigation is what says it finished. */
  await settle('/');
  await page.locator('[data-fill-every-feature]').click();
  await page.waitForURL('**/more', { timeout: 180000 });
  await dress();

  /* Nothing clears the hint by hand: `reseed` in demo/controls.ts assigns
     PREFERENCE_DEFAULTS over the store before it seeds, so the fill above
     has already put `spanRailHintDismissed` back to false - which is also
     why the drag in shot 3 does not poison the second theme's run.

     --- 1. The top of the door at rest: the rail, its line, its legend and
     its hint. Before, the same crop is the title with the span as its
     subtitle, the quick picks, and a rail carrying nothing underneath. */
  await settle('/stats');
  await page.waitForSelector('[data-lookback-rail]');
  await page.waitForTimeout(1500);
  await shootTopOfDoor('01-top-of-door');

  // --- 2. The rail alone, so the lanes and the legend are readable.
  await shootElement('[data-lookback-rail]', '02-rail-at-rest');

  /* --- 3. Mid-drag: the start handle taken and moved, not released, so the
     rail is raised, the grip is held and the line under it is counting to
     the day under the finger. */
  {
    const handle = page.locator('[data-span-handle="start"]');
    const box = await handle.boundingBox();
    const rail = await page.locator('[data-span-timeline]').boundingBox();
    if (box && rail) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(rail.x + rail.width * 0.35, box.y + box.height / 2, { steps: 12 });
      await page.waitForTimeout(400);
      await shootElement('[data-lookback-rail]', '03-rail-mid-drag');
      await page.mouse.up();
    } else {
      errors.push('could not find the start handle to drag');
    }
  }

  /* --- 4. The legend in Polish, light only: the acceptance box asks whether
     four kinds of Polish word still fit a 390px column, and that is a
     question about the words rather than about the theme. `setLocale`
     reloads the page, so this is last in the run. */
  if (theme === 'light') {
    await settle('/settings');
    await page.locator('[data-segment="pl"]').click();
    await page.waitForTimeout(1500);
    await settle('/stats');
    await page.waitForSelector('[data-lookback-rail]');
    await page.waitForTimeout(1500);
    await shootElement('[data-lookback-rail]', '04-rail-polish');
    const wrapped = await page.evaluate(() => {
      const keys = [...document.querySelectorAll('[data-span-key]')];
      const tops = new Set(keys.map((k) => Math.round(k.getBoundingClientRect().top)));
      return { kinds: keys.length, lines: tops.size };
    });
    console.log(`   polish legend: ${wrapped.kinds} kinds on ${wrapped.lines} line(s) at 390px`);
  }

  await page.close();
}

console.log(`${shots.length} shot(s) in ${outDir}:`);
for (const s of shots) console.log(' -', s);
if (errors.length) {
  console.log(`\n${errors.length} PAGE ERROR(S):`);
  for (const e of errors) console.log(' -', e);
}

app.httpServer.close();
await browser.close();
process.exit(errors.length ? 1 : 0);
