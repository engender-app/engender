/* Renders for the photo library (phase 11 ticket 14), for sign-off.

   Only what the ticket changed, in crops rather than whole screens (Alicja,
   on ticket 07's sign-off), in the default palette crossed with the two
   themes and nothing else (Alicja, 2026-09-14).

   What changed: the grid reads all six tables that hold a photograph
   instead of one, a chip row over it narrows by source, each tile says
   where its photograph came from, a year rail sticks beside a grid taller
   than the screen, and the wipe can be opened over two photographs from
   two different tables. So the scenes are the head of the grid, the grid
   narrowed to one chip, the rail, a video note's tile, and the wipe across
   two tables - and the `before` is what main draws in each of those places,
   which for three of the five is nothing at all.

   Run against a demo build:
     VITE_DEMO=1 npm run build
     node tests/photo-library-gallery.mjs --tag after --out /abs/dir

   `--tag before` wants another checkout's build, and vite's `preview`
   serves the cwd rather than its own root flag, so run it with that
   checkout as the cwd (photo-wipe-gallery.mjs's own note, same trick):
     node -e "process.chdir('/path/to/base'); process.argv.push('--','--tag','before','--out','/abs/dir'); import('/abs/tests/photo-library-gallery.mjs')"
*/
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
const outDir = resolve(flag('out', resolve(here, '../.claude/photo-library-shots')), tag);
const THEMES = ['light', 'dark'];

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
    if (!document.getElementById('library-shot-css')) {
      const style = document.createElement('style');
      style.id = 'library-shot-css';
      style.textContent =
        '[data-app-scroll-region]{scrollbar-width:none}[data-app-scroll-region]::-webkit-scrollbar{display:none}';
      document.head.append(style);
    }
  });

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
      const bar = document.querySelector('[data-app-nav]')?.getBoundingClientRect();
      const floor = bar && bar.top > head.top ? bar.top - 8 : frame.bottom;
      return { x: frame.x, y: top, width: frame.width, height: Math.min(tall, floor - top) };
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

/** Open the wipe the way a person does: pick two cells, then Compare.
    `pick` says which two, so the `after` run can take one from a table the
    `before` run has no tile for. */
const openCompare = async (pick) => {
  await settle('/media/photos');
  await page.waitForSelector('[data-photo-cell] img');
  await page.locator('[data-segment="compare"]').click();
  const picked = await pick();
  if (!picked) return false;
  await page.locator('[data-compare-open]').click();
  await page.waitForSelector('[data-photo-wipe]');
  await page.waitForTimeout(800);
  return true;
};

/** The two entry-owned photographs main's grid can offer, by position. */
const twoFromTheGrid = async () => {
  const cells = page.locator('[data-photo-cell]');
  await cells.nth(0).click();
  await cells.nth(3).click();
  return true;
};

/** A hair photograph and a surgery-recovery one, which is the comparison
    only the library can set up - neither screen that owns those two
    photographs can see the other's. */
const acrossTwoTables = async () => {
  const hair = page.locator('[data-photo-source="hair"] [data-photo-cell]').first();
  const recovery = page.locator('[data-photo-source="procedure"] [data-photo-cell]').first();
  if (!(await hair.count()) || !(await recovery.count())) {
    errors.push('the library holds no hair or no recovery photograph to compare');
    return false;
  }
  await hair.click();
  await recovery.click();
  return true;
};

try {
  await seed();

  for (const theme of THEMES) {
    await dress(theme);

    await settle('/media/photos');
    await page.waitForSelector('[data-photo-cell] img');
    await page.waitForTimeout(800);

    if (tag === 'after') {
      await cropFixed(
        `head-${theme}`,
        '[data-segmented="photos-tab"]',
        420,
        'the library head: the chip row, the count, and a grid holding all six sources'
      );

      await page.locator('[data-photo-chip="hair"]').click();
      await page.waitForFunction(() => !document.querySelector('[data-photo-source="entry"]'));
      await page.waitForTimeout(700);
      await cropFixed(
        `narrowed-${theme}`,
        '[data-segmented="photos-tab"]',
        420,
        'the same grid with the Hair chip taken: hair progress and hair removal, nothing else'
      );

      await page.locator('[data-photo-chip="everything"]').click();
      await page.waitForSelector('[data-photo-source="entry"]');
      await page.waitForTimeout(700);

      const rail = await page.locator('[data-photo-years]').count();
      if (rail) {
        await cropFixed(
          `rail-${theme}`,
          '[data-photo-years]',
          320,
          'the year rail, which appears once the grid is taller than the screen'
        );
      } else {
        shots.push({ name: `rail-${theme}`, note: 'no rail: this grid is shorter than the screen' });
      }

      const video = page.locator('[data-photo-source="video"]').first();
      if (await video.count()) {
        await video.scrollIntoViewIfNeeded();
        await cropFixed(
          `video-${theme}`,
          '[data-photo-source="video"]',
          200,
          "a video note's tile: it plays rather than being picked, and says so in words"
        );
      } else {
        errors.push('the fixture seeded no video note');
      }

      if (await openCompare(acrossTwoTables)) {
        await cropFixed(
          `wipe-${theme}`,
          '[data-photo-wipe]',
          560,
          'the wipe inside the library, over a hair photograph and a recovery one'
        );
      }
    } else {
      await cropFixed(
        `head-${theme}`,
        '[data-segmented="photos-tab"]',
        420,
        'the same head on main: no chips, no count, and a grid reading one table of six'
      );
      shots.push({
        name: `narrowed-${theme}`,
        note: 'nothing to shoot: main has no way to narrow the grid'
      });
      shots.push({ name: `rail-${theme}`, note: 'nothing to shoot: main has no year rail' });
      shots.push({
        name: `video-${theme}`,
        note: 'nothing to shoot: a video note could not be found from this screen on main'
      });

      if (await openCompare(twoFromTheGrid)) {
        await cropFixed(
          `wipe-${theme}`,
          '[data-photo-wipe]',
          560,
          'the same wipe on main, which can only ever hold two of the photo table\'s own'
        );
      }
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
