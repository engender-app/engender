/* Renders for the photo wipe (phase 10 redesign ticket 55), for sign-off.

   Only what the ticket changed, in crops rather than whole screens (Alicja,
   on ticket 07's sign-off), and in the default palette crossed with the two
   themes and nothing else (Alicja, 2026-09-14) - the eight-palette cross
   product is `palette-contrast.test.ts`'s job, not something to look
   through by eye.

   What changed: two photographs that were a two-up grid are one frame with
   a divider, on both screens that take fixed-position photographs. So the
   scenes are the control itself at three divider positions on each screen,
   and the `before` is the band each screen drew in that place instead.

   Run against a demo build:
     VITE_DEMO=1 npm run build
     node tests/photo-wipe-gallery.mjs --tag after --out /abs/dir

   `--tag before` wants another checkout's build, and vite's `preview`
   serves the cwd rather than its own root flag, so run it with that
   checkout as the cwd:
     node -e "process.chdir('/path/to/base'); process.argv.push('--','--tag','before','--out','/abs/dir'); import('/abs/tests/photo-wipe-gallery.mjs')"
   (the leading '--' stands where a script path would, since the flags are
   read from argv[2] on). */
import { preview } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';
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
const outDir = resolve(flag('out', resolve(here, '../.claude/photo-wipe-shots')), tag);
const THEMES = ['light', 'dark'];

/** Where the divider stands in each of the three shots. Home and then one
    arrow key per 5% is the control's own keyboard path, so the positions
    are set the way a person could set them rather than by writing to the
    custom property behind its back. */
const POSITIONS = [25, 50, 75];

await mkdir(outDir, { recursive: true });
const browser = await launchChromium();
const app = await preview({ preview: { port: 0 } });
const base = `http://localhost:${app.httpServer.address().port}`;
const shots = [];
const errors = [];

const page = await browser.newPage({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 2 });
page.on('pageerror', (err) => errors.push(String(err)));

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

const strip = () =>
  page.evaluate(() => {
    for (const toast of document.querySelectorAll('[data-toast]')) toast.remove();
    for (const bar of document.querySelectorAll('.demo-bar')) bar.remove();
    document.body.classList.remove('has-demo-bar');
    if (!document.getElementById('wipe-shot-css')) {
      const style = document.createElement('style');
      style.id = 'wipe-shot-css';
      style.textContent =
        '[data-app-scroll-region]{scrollbar-width:none}[data-app-scroll-region]::-webkit-scrollbar{display:none}';
      document.head.append(style);
    }
  });

/** A band from `from`'s top to `to`'s bottom, scrolled into view first. */
const cropBand = async (name, from, to, note = '') => {
  await page.mouse.move(4, 4);
  await strip();
  if (!(await page.locator(from).count())) {
    errors.push(`${name}: nothing matched ${from}`);
    return;
  }
  await page.locator(from).first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(600);
  const box = await page.evaluate(
    ([a, b]) => {
      const frame = document.querySelector('[data-app-root]').getBoundingClientRect();
      const head = document.querySelector(a)?.getBoundingClientRect();
      const foot = document.querySelector(b)?.getBoundingClientRect();
      if (!head || !foot) return null;
      /* The floating bar sits over the page, so a band that ran to the
         frame's own bottom would be shot through it. */
      const bar = document.querySelector('[data-app-nav]')?.getBoundingClientRect();
      const floor = Math.min(frame.bottom, bar && bar.top > head.top ? bar.top - 8 : frame.bottom);
      const top = Math.max(head.top - 12, frame.top);
      return { x: frame.x, y: top, width: frame.width, height: Math.min(foot.bottom - top + 16, floor - top) };
    },
    [from, to]
  );
  if (!box) {
    errors.push(`${name}: nothing matched ${from} / ${to}`);
    return;
  }
  await page.screenshot({ path: `${outDir}/${name}.png`, clip: box });
  shots.push({ name, note });
};

/** A band of `height` px from `from`'s own top, scrolled into view first. */
const cropFixed = async (name, from, height, note = '') => {
  await page.mouse.move(4, 4);
  await strip();
  if (!(await page.locator(from).count())) {
    errors.push(`${name}: nothing matched ${from}`);
    return;
  }
  await page.locator(from).first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(600);
  const box = await page.evaluate(
    ([a, tall]) => {
      const frame = document.querySelector('[data-app-root]').getBoundingClientRect();
      const head = document.querySelector(a)?.getBoundingClientRect();
      if (!head) return null;
      const top = Math.max(head.top - 12, frame.top);
      return { x: frame.x, y: top, width: frame.width, height: Math.min(tall, frame.bottom - top) };
    },
    [from, height]
  );
  if (!box) {
    errors.push(`${name}: nothing matched ${from}`);
    return;
  }
  await page.screenshot({ path: `${outDir}/${name}.png`, clip: box });
  shots.push({ name, note });
};

const dress = async (theme) => {
  await settle('/settings');
  await page.locator('[data-palette-pick="trans"]').click();
  await page.locator(`[data-segment="${theme}"]`).click();
  await page.waitForFunction(
    (t) => document.documentElement.dataset.palette === 'trans' && document.documentElement.dataset.theme === t,
    theme
  );
};

const seed = async () => {
  await settle('/');
  await page.locator('[data-fill-every-feature]').click();
  await page.waitForURL('**/more', { timeout: 180000 });
  await page.waitForTimeout(2000);
};

/** Drive the divider to `percent` through the control's own keyboard path. */
const setDivider = async (percent) => {
  const handle = page.locator('[data-wipe-handle]');
  await handle.focus();
  await handle.press('Home');
  for (let at = 0; at < percent; at += 5) await handle.press('ArrowRight');
  await page.waitForTimeout(500);
  const now = await handle.getAttribute('aria-valuenow');
  if (Number(now) !== percent) errors.push(`divider landed on ${now}%, not ${percent}%`);
  // Or every shot carries the focus ring the keyboard path left on the
  // grip, which is a state of the control rather than a state of the wipe.
  await page.evaluate(() => document.activeElement?.blur());
  await page.waitForTimeout(200);
};

/** Open the compare view the way a person does: two cells, then Compare. */
const openCompare = async () => {
  await settle('/media/photos');
  await page.waitForSelector('[data-photo-cell] img');
  const cells = page.locator('[data-photo-cell]');
  await cells.nth(0).click();
  await cells.nth(3).click();
  await page.locator('[data-segment="compare"]').click();
};

try {
  await seed();

  for (const theme of THEMES) {
    await dress(theme);

    if (tag === 'after') {
      await openCompare();
      await page.waitForSelector('[data-photo-wipe] .wipe-photo');
      await page.waitForTimeout(600);
      for (const percent of POSITIONS) {
        await setDivider(percent);
        await cropBand(
          `photos-${percent}-${theme}`,
          '[data-photo-wipe]',
          '[data-photo-wipe]',
          `the compare view's wipe, divider at ${percent}%`
        );
      }

      await settle('/body/hair-progress');
      await page.waitForSelector('[data-photo-wipe] .wipe-photo', { timeout: 15000 });
      await page.waitForTimeout(600);
      for (const percent of POSITIONS) {
        await setDivider(percent);
        await cropBand(
          `hair-${percent}-${theme}`,
          '[data-photo-wipe]',
          '[data-photo-wipe]',
          `hair progress's wipe, divider at ${percent}%`
        );
      }

      /* Said out loud rather than assumed: whether the frame had to
         explain its crop, and what the divider announces to a screen
         reader where it stands. */
      const crop = await page.locator('[data-wipe-crop-note]').count();
      const spoken = await page.locator('[data-wipe-handle]').getAttribute('aria-valuetext');
      shots.push({ name: `read-${theme}`, note: `crop note shown: ${crop > 0}; divider announces "${spoken}"` });
    } else {
      await openCompare();
      await page.waitForSelector('[data-compare-side]');
      await page.waitForTimeout(600);
      await cropBand(
        `photos-${theme}`,
        '.compare-wrap',
        '.compare-wrap',
        'the two-up grid the compare view drew instead'
      );

      await settle('/body/hair-progress');
      await page.waitForSelector('[data-add-photo]');
      await page.waitForTimeout(600);
      /* A fixed band rather than one bounded by a row: the demo persona
         had no fixed-position photographs at all before this ticket
         (fullFixture.ts), so there is no last row to run the crop down
         to - which is itself half of what the `before` says. */
      await cropFixed(
        `hair-${theme}`,
        '[data-add-photo]',
        260,
        'hair progress: the photo half, with no comparison over it'
      );
    }
  }
} catch (error) {
  errors.push(`the run itself: ${String(error)}`);
} finally {
  await writeFile(`${outDir}/shots.json`, JSON.stringify({ tag, shots, errors }, null, 2) + '\n');
  await page.close();
  await browser.close();
  await app.close();
}

console.log(JSON.stringify({ tag, outDir, shots, errors }, null, 2));
if (errors.length) process.exitCode = 1;
