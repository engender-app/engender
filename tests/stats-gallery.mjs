/* Screenshots of the rebuilt stats tab (phase 8 UX ticket 03, ADR-0056).

   Three states, which are the three the emptiness rule has to hold across:
   a journal with entries and almost no dated areas, a journal using every
   feature, and the same journal read over the shortest range.
   The first is the point - it is where a screen that works at both extremes
   falls between two stools.

   A truly empty journal is not among them because a demo build cannot
   produce one: it seeds the persona on first boot, and the seven-day shot
   is the nearest honest stand-in for the floors.

   Default flag only, both themes, which is what the sign-off asked for.

   Run: VITE_DEMO=1 npm run build   first, then
        node tests/stats-gallery.mjs [outDir]
   Default outDir is .claude/stats-shots, which is gitignored and durable. */
import { preview } from 'vite';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './browser-harness.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(process.argv[2] ?? resolve(here, '../.claude/stats-shots'));

await mkdir(outDir, { recursive: true });
const browser = await launchChromium();
const app = await preview({ preview: { port: 0 } });
const base = `http://localhost:${app.httpServer.address().port}`;
const shots = [];

for (const theme of ['light', 'dark']) {
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    colorScheme: theme
  });

  const strip = () =>
    page.evaluate(() => {
      for (const toast of document.querySelectorAll('[data-toast]')) toast.remove();
      for (const bar of document.querySelectorAll('.demo-bar')) bar.remove();
    });

  /* The app scrolls `[data-app-scroll-region]` rather than the document, so
     `fullPage` catches the viewport and an element shot of the scroller is
     clipped to what is visible inside it. The whole screen is captured by
     growing the viewport to the content and shrinking it back: the layout
     stays the 390px one throughout and only the height is unreal. */
  const shoot = async (name) => {
    await strip();
    const tall = await page.evaluate(() => {
      const scroller = document.querySelector('[data-app-scroll-region]');
      const hidden = scroller.scrollHeight - scroller.clientHeight;
      return Math.min(window.innerHeight + hidden + 40, 12000);
    });
    await page.setViewportSize({ width: 390, height: tall });
    await page.waitForTimeout(600);
    const file = `${outDir}/${name}-trans-${theme}.png`;
    await page.locator('[data-app-root]').screenshot({ path: file });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(300);
    shots.push(`${name}-trans-${theme}`);
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

  /* The palette and the theme are set after the last navigation of each
     state, never before: `goto` remounts the shell and takes a manually
     stamped `data-theme` with it. */
  const dress = async () => {
    await settle('/settings');
    await page.locator('[data-palette-pick="trans"]').click();
    await page.locator(`[data-segment="${theme}"]`).click();
    await page.waitForFunction((want) => document.documentElement.dataset.theme === want, theme);
  };

  /* ---------- the demo persona: entries, scales, tags and presentations,
     and almost none of the dated areas (the fixture carries no doses or
     procedures). The middle state - a populated cross-area block above a
     short index - which is where a screen that works at both extremes
     falls between two stools. ---------- */
  await settle('/');
  await page.getByRole('button', { name: 'Reset demo state' }).click();
  await page.waitForTimeout(1500);
  await dress();
  await settle('/stats');
  await page.waitForSelector('[data-chart-card="day-by-day"]');
  await page.waitForTimeout(1200);
  await shoot('01-entries-only');

  /* ---------- every feature. Sixteen areas' worth of index under a full
     cross-area block, which is the screen the rethink exists for. The seed
     resolves by navigating to /more, so that URL is the signal it finished
     rather than a timeout. ---------- */
  await settle('/');
  await page.locator('[data-fill-every-feature]').click();
  await page.waitForURL('**/more', { timeout: 180000 });
  await page.waitForTimeout(2000);
  await dress();
  await settle('/stats');
  await page.waitForSelector('[data-chart-card="day-by-day"]');
  await page.waitForTimeout(2000);
  await shoot('02-every-feature');

  /* The two halves on their own, at reading size, since the whole screen at
     this state is several thousand pixels tall and the detail is what the
     sign-off is about. */
  const shootFrom = async (name, selector, until, edge = 'span') => {
    await strip();
    /* Grow the viewport to the whole screen *first*, then measure. Measuring
       against the 844px viewport and cropping afterwards reads the
       rectangles of a layout that no longer exists, which is how the first
       run of this crop caught one card instead of eleven. */
    const tall = await page.evaluate(() => {
      const scroller = document.querySelector('[data-app-scroll-region]');
      /* Back to the top before measuring. Clicking a control scrolls it into
         view inside the region, and a region left part-way down hands back
         negative rectangles that crop to a sliver. */
      scroller.scrollTop = 0;
      return Math.min(window.innerHeight + (scroller.scrollHeight - scroller.clientHeight) + 40, 12000);
    });
    await page.setViewportSize({ width: 390, height: tall });
    await page.waitForTimeout(600);
    await page.evaluate(() => {
      document.querySelector('[data-app-scroll-region]').scrollTop = 0;
    });
    const clip = await page.evaluate(
      ([from, to, edge]) => {
        const head = document.querySelector(from);
        const foot = document.querySelector(to) ?? head;
        const a = head.getBoundingClientRect();
        const b = foot.getBoundingClientRect();
        const top = (edge === 'after' ? a.bottom : a.top) + window.scrollY;
        const bottom = (edge === 'after' ? b.top : b.bottom) + window.scrollY;
        return {
          x: 0,
          y: Math.max(0, top - 12),
          width: 390,
          height: Math.min(Math.max(bottom - top + 24, 100), 11000)
        };
      },
      [selector, until, edge]
    );
    await page.screenshot({ path: `${outDir}/${name}-trans-${theme}.png`, clip });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(300);
    shots.push(`${name}-trans-${theme}`);
  };

  /* ---------- the shortest range, where a trend card has the least to draw
     with and falls back to its row rather than to an empty plot. The persona
     still clears the five-entry floor at seven days, so the summary panels'
     own empty states are not reachable from a demo build; the node tests
     hold those branches instead. ---------- */
  await page.locator('[data-segment="7"]').click();
  await page.waitForTimeout(1200);
  await shoot('05-seven-days');
  await page.locator('[data-segment="30"]').click();
  await page.waitForTimeout(1200);

  await shootFrom('03-cross-area', '[data-chart-card="day-by-day"]', '[data-chart-card="custom-interval"]');
  /* Everything between the last cross-area card and the Look back list,
     which is the index however many cards it happens to have - anchored on
     two things that are always there rather than on a card that may have
     fallen back to a row. */
  await shootFrom('04-area-index', '[data-chart-card="custom-interval"]', '[data-list-row="wrapped-month"]', 'after');

  await page.close();
}

await app.httpServer.close();
await browser.close();

console.log(`${shots.length} shot(s) in ${outDir}`);
for (const shot of shots) console.log(' ', shot);
