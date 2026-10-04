/* The yearly grid's days, for somebody who cannot see the cells (phase 14
   pre-release ticket 30, accessibility audit A06).

   The grid on /wrapped/year is 365 painted spans, and a day's date and
   value lived only in a `title`, which a screen reader does not reach and a
   finger or a keyboard cannot raise. This drives YearRows on its fixture
   page (tests/browser-tier/mood-year.html, a seeded year) and holds what the
   audit asked for, read off the accessibility tree rather than the DOM:

   - the painted grid is out of the tree, and none of its cells is a tab stop;
   - one button under it opens the days as a list, by keyboard and by touch;
   - every day of the year can be read there, its date and its value, and a
     day nothing was logged on says so, checked against the fixture's own
     series rather than against the cells;
   - the month is changed by two buttons, so the whole card is three tab
     stops, and the ends of the year say they go no further;
   - the tree names one month at a time, also in the middle of the
     crossfade that paints two;
   - nothing yanks: the list opens by its height growing frame by frame, and
     a month change keeps the panel's height on every frame.

   Run on its own with `node tests/year-days-list.mjs`; part of
   `npm run test:guards`. */
import { createServer } from 'vite';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './browser-harness.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const failures = [];
function check(ok, what) {
  if (!ok) failures.push(what);
}

const server = await createServer({
  configFile: `${here}/browser-tier/browser-tier.vite.config.ts`,
  server: { port: 0 }
});
await server.listen();
const port = server.config.server.port;
const browser = await launchChromium();

async function open(options) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, ...options });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`http://localhost:${port}/mood-year.html`, { waitUntil: 'networkidle' });
  await page.waitForSelector('body[data-ready]', { state: 'attached' });
  return { page, errors };
}

/** The fixture's own series, keyed by epoch day: the independent answer
    to what each day should read. */
async function fixtureDays(page) {
  return page.evaluate(() => window.__yearFixture);
}

/** What the open list says, as the accessibility tree has it, once a
    step's crossfade has let go of the month before. */
async function readMonth(page) {
  await page.waitForFunction(() => document.querySelectorAll('[data-year-days-list]').length === 1);
  const panel = page.locator('[data-year-days]');
  return {
    title: (await page.locator('[data-year-days-month]').textContent()).trim(),
    tree: await panel.ariaSnapshot()
  };
}

try {
  /* --- reduced motion: the semantics and the keyboard --- */
  {
    const { page, errors } = await open({ reducedMotion: 'reduce' });
    const fixture = await fixtureDays(page);

    const grid = await page.evaluate(() => {
      const chart = document.querySelector('[data-chart="year-rows"]');
      return {
        hidden: chart?.getAttribute('aria-hidden') === 'true',
        cells: chart?.querySelectorAll('[data-year-cell]').length ?? 0,
        focusableCells: [...(chart?.querySelectorAll('[data-year-cell]') ?? [])].filter((c) => c.tabIndex >= 0).length
      };
    });
    check(grid.hidden, 'the painted grid is aria-hidden');
    check(grid.cells === 365, `the grid still paints 365 days (${grid.cells})`);
    check(grid.focusableCells === 0, `no cell is a tab stop (${grid.focusableCells})`);

    /* Keyboard: the first tab stop on the page is the toggle. */
    await page.keyboard.press('Tab');
    const first = await page.evaluate(() => document.activeElement?.hasAttribute('data-year-days-toggle'));
    check(first, 'the first tab stop is the days toggle');
    const toggle = page.locator('[data-year-days-toggle]');
    check((await toggle.getAttribute('aria-expanded')) === 'false', 'the toggle starts folded');
    await page.keyboard.press('Enter');
    await page.waitForSelector('[data-year-days]');
    check((await toggle.getAttribute('aria-expanded')) === 'true', 'Enter opens the days');

    /* Three tab stops in the card and no more. */
    const stops = [];
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press('Tab');
      stops.push(await page.evaluate(() => {
        const el = document.activeElement;
        return el?.closest('.kit-chart') ? (el.dataset.yearDaysStep ?? el.tagName) : 'outside';
      }));
    }
    check(
      JSON.stringify(stops) === JSON.stringify(['prev', 'next', 'outside']),
      `the open card has three tab stops: toggle, previous, next (${JSON.stringify(stops)})`
    );

    /* Every month, stepped by keyboard from the next button. */
    const prev = page.locator('[data-year-days-step="prev"]');
    const next = page.locator('[data-year-days-step="next"]');
    check((await prev.getAttribute('aria-disabled')) === 'true', 'January cannot step back');
    await next.focus();
    const seen = [];
    for (let month = 0; month < 12; month++) {
      const { title, tree } = await readMonth(page);
      const expected = new Date(fixture.year, month, 1).toLocaleDateString('en-GB', { month: 'long' });
      check(title === expected, `month ${month} is titled ${expected} (${title})`);
      const items = tree.split('\n').filter((line) => line.trim().startsWith('- listitem'));
      const length = new Date(fixture.year, month + 1, 0).getDate();
      check(items.length === length, `${expected} lists ${length} days (${items.length})`);
      for (let day = 1; day <= length; day++) {
        const date = new Date(fixture.year, month, day);
        const epochDay = fixture.startEpochDay + Math.round((date - new Date(fixture.year, 0, 1)) / 86400000);
        const value = fixture.values[epochDay];
        const want = value === undefined ? 'Not logged' : value.toFixed(1);
        const dayText = date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' });
        const line = items[day - 1] ?? '';
        check(line.includes(dayText) && line.includes(want), `${expected} ${day} reads "${dayText}" and "${want}" (${line.trim()})`);
        seen.push(epochDay);
      }
      if (month < 11) await page.keyboard.press('Enter');
    }
    check(new Set(seen).size === 365, `every day of the year is read once (${new Set(seen).size})`);
    check((await next.getAttribute('aria-disabled')) === 'true', 'December cannot step on');
    await page.keyboard.press('Enter');
    check((await readMonth(page)).title === 'December', 'Enter on the last month changes nothing');
    check(await page.evaluate(() => document.activeElement?.dataset.yearDaysStep === 'next'), 'focus stays on the button at the end');

    /* The month heading is a live region, so a step is announced. */
    check(
      (await page.locator('[data-year-days-month]').getAttribute('aria-live')) === 'polite',
      'the month name is announced when it changes'
    );
    check(errors.length === 0, `no page errors (${errors.join('; ')})`);
    await page.close();
  }

  /* --- touch: the toggle opens on a tap, no hover anywhere --- */
  {
    const { page } = await open({ reducedMotion: 'reduce', hasTouch: true, isMobile: true });
    await page.locator('[data-year-days-toggle]').tap();
    await page.waitForSelector('[data-year-days]');
    await page.locator('[data-year-days-step="next"]').tap();
    check((await readMonth(page)).title === 'February', 'a tap steps the month');
    const box = await page.locator('[data-year-days-step="next"]').boundingBox();
    check(box && box.width >= 47.5 && box.height >= 47.5, `the month buttons are 48px targets (${JSON.stringify(box)})`);
    await page.close();
  }

  /* --- motion: sampled every frame --- */
  {
    /* Tall enough that the panel's bottom edge is on screen: `resize`
       travels only what the viewport shows, and a change below the fold is
       nobody's yank. */
    const { page } = await open({ reducedMotion: 'no-preference', viewport: { width: 390, height: 1400 } });
    const opening = await page.evaluate(async () => {
      const heights = [];
      document.querySelector('[data-year-days-toggle]').click();
      const start = performance.now();
      await new Promise((done) => {
        const tick = () => {
          const panel = document.querySelector('[data-year-days]');
          heights.push(panel ? panel.getBoundingClientRect().height : 0);
          if (performance.now() - start < 700) requestAnimationFrame(tick);
          else done();
        };
        requestAnimationFrame(tick);
      });
      return heights;
    });
    const final = opening[opening.length - 1];
    const firstFrame = opening.find((h) => h > 0) ?? 0;
    const monotonic = opening.every((h, i) => i === 0 || h >= opening[i - 1] - 0.5);
    const between = opening.filter((h) => h > 1 && h < final - 1).length;
    check(firstFrame < final / 2, `the list grows from nothing rather than landing whole (first ${firstFrame}, final ${final})`);
    check(monotonic, `the list only grows while it opens (${opening.map((h) => h.toFixed(0)).join(',')})`);
    check(between >= 4, `the opening takes several frames (${between} in between)`);

    const swap = await page.evaluate(async () => {
      const panel = document.querySelector('[data-year-days]');
      const samples = [];
      /* February: the shortest month, so a height change would show here. */
      document.querySelector('[data-year-days-step="next"]').click();
      const start = performance.now();
      /* Read from a task each frame queues rather than in the frame's rAF
         callback: a rAF read comes before the frame's ResizeObserver, which
         is where `resize` starts its travel, so it would record a height
         that was never painted (the repo's sampler gotcha). */
      await new Promise((done) => {
        const tick = () => {
          setTimeout(() => {
            const lists = [...panel.querySelectorAll('[data-year-days-list]')];
            samples.push({
              height: panel.getBoundingClientRect().height,
              opacities: lists.map((l) => Number(getComputedStyle(l).opacity))
            });
            if (performance.now() - start < 600) requestAnimationFrame(tick);
            else done();
          });
        };
        requestAnimationFrame(tick);
      });
      return samples;
    });
    /* Mid-crossfade, two months are painted and one is named. */
    await page.locator('[data-year-days-step="next"]').click();
    await page.waitForTimeout(40);
    const midFade = await page.evaluate(() => document.querySelectorAll('[data-year-days-list]').length);
    const heading = await page.locator('[data-year-days] h4').ariaSnapshot();
    check(midFade === 2, `the check below ran mid-crossfade (${midFade} lists painted)`);
    check(
      /^- heading "March" \[level=4\]$/.test(heading.trim()),
      `mid-crossfade the heading names one month (${JSON.stringify(heading)})`
    );

    /* Constant is the usual case. Where a row wraps, the two months can
       differ in height, and then the panel has to travel: no one frame may
       take more than 40% of the change, and it spreads over several. */
    const heights = swap.map((s) => s.height);
    const change = Math.abs(heights[heights.length - 1] - heights[0]);
    const steps = heights.slice(1).map((h, i) => Math.abs(h - heights[i]));
    const biggest = Math.max(0, ...steps);
    const moving = steps.filter((d) => d > 0.25).length;
    check(
      change < 0.5 || (biggest <= change * 0.4 && moving >= 4),
      `a month change never moves the panel in one frame (change ${change.toFixed(1)}px, biggest step ${biggest.toFixed(1)}px over ${moving} frames: ${heights.map((h) => h.toFixed(0)).join(',')})`
    );
    const crossing = swap.filter((s) => s.opacities.length === 2 && s.opacities.every((o) => o > 0 && o < 1)).length;
    check(crossing >= 2, `the two months crossfade over several frames (${crossing})`);
    const blank = swap.filter((s) => s.opacities.every((o) => o < 0.05)).length;
    check(blank === 0, `no frame shows neither month (${blank})`);
    await page.close();
  }
} finally {
  await browser.close();
  await server.close();
}

if (failures.length) {
  for (const f of failures) console.log(`FAIL ${f}`);
  console.log(`${failures.length} failure(s)`);
  process.exit(1);
}
console.log('PASS Year grid days: out of the picture, into a list a screen reader, a keyboard and a finger all reach');
