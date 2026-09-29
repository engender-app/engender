/* Sign-off render for ux-carpet ticket 280: the Journal's open month. Crops
   of the grid only (the header, the controls and the day cards are not what
   changed), trans palette, light and dark.

   Run against a demo build (VITE_DEMO=1 npm run build):
     node tests/journal-month-gallery.mjs --tag after --out /abs/dir
   `--build <dir>` serves another build directory from this checkout's own
   config, which is how the before shots come from a saved copy of main's
   build without a second worktree. `--probe` prints each month's cell shapes
   instead of shooting, to pick the month worth looking at. */
import { preview } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { launchChromium } from './browser-harness.mjs';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? args[at + 1] : fallback;
};
const tag = flag('tag', 'after');
const outDir = resolve(flag('out', '/tmp/journal-month-shots'));
const buildDir = flag('build', undefined);
const monthsBack = Number(flag('months-back', '0'));
const probe = args.includes('--probe');
const THEMES = ['light', 'dark'];

await mkdir(outDir, { recursive: true });
const app = await preview({ preview: { port: 0 }, ...(buildDir ? { build: { outDir: resolve(buildDir) } } : {}) });
const base = `http://localhost:${app.httpServer.address().port}`;
const browser = await launchChromium();
const context = await browser.newContext({
  viewport: { width: 390, height: 900 },
  deviceScaleFactor: 2,
  reducedMotion: 'no-preference'
});
const page = await context.newPage();
const shots = [];

const strip = () =>
  page.evaluate(() => {
    for (const toast of document.querySelectorAll('[data-toast]')) toast.remove();
    for (const bar of document.querySelectorAll('.demo-bar')) bar.remove();
    document.body.classList.remove('has-demo-bar');
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
  await strip();
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

const openMonth = async () => {
  await settle('/calendar');
  await page.waitForSelector('[data-cal-open]');
  for (let i = 0; i < monthsBack; i++) await page.locator('[data-cal-step="prev"]').click();
  await page.locator('[data-cal-open]').click();
  await page.waitForSelector('[data-cal-month-state="grid"]');
  await page.waitForFunction(() => document.querySelector('[data-cal-grid]')?.getAttribute('aria-busy') === 'false');
  await page.waitForTimeout(1200);
};

/** The grid and what sits under it, down to the end of the month body. */
const cropGrid = async (name) => {
  await page.mouse.move(4, 4);
  await strip();
  await page.locator('[data-cal-month-body]').scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  const box = await page.evaluate(() => {
    const frame = document.querySelector('[data-app-root]').getBoundingClientRect();
    const body = document.querySelector('[data-cal-month-body]').getBoundingClientRect();
    return { x: frame.x, y: body.top - 12, width: frame.width, height: body.height + 24 };
  });
  await page.screenshot({ path: `${outDir}/${name}-${tag}.png`, clip: box });
  shots.push(`${name}-${tag}.png`);
};

/* The demo persona logs at most two readings a day, so the three shapes the
   ticket is about - a dip, a split of more than two readings, a same-step
   run - never occur in it; the persona's own two-reading same-step days
   cover the last. They are written here through the real editor,
   on the month's first empty past days, oldest reading first (the spread is
   ordered by timestamp, then id). The last empty day stays empty. */
const SEEDED = [
  { name: 'dip', moods: [5, 1, 5] },
  { name: 'split-of-four', moods: [2, 3, 4, 5] }
];

const seed = async () => {
  await openMonth();
  const empty = await page.$$eval('[data-hm-cell-empty] [data-cal-date]', (nums) =>
    nums.map((n) => Number(n.getAttribute('data-cal-date')))
  );
  if (empty.length < SEEDED.length + 1) throw new Error(`only ${empty.length} empty past days to seed into`);
  for (const [i, day] of SEEDED.entries()) {
    for (const mood of day.moods) {
      await page.goto(`${base}/entry/new/${empty[i]}`, { waitUntil: 'networkidle' });
      await page.waitForSelector('#ed-note');
      await page.locator(`[data-mood="${mood}"]`).first().click();
      await page.locator('[data-save]').click();
      await page.waitForURL((url) => !url.pathname.startsWith('/entry/new'), { timeout: 15000 });
    }
    console.log(`seeded ${day.name} on epoch day ${empty[i]}`);
  }
};

try {
  await settle('/');
  if (!probe) await seed();
  if (probe) {
    await openMonth();
    for (let back = 0; back < 8; back++) {
      const row = await page.evaluate(() => ({
        month: document.querySelector('[data-cal-month]')?.textContent?.trim(),
        filled: document.querySelectorAll('[data-hm-cell-filled]').length,
        split: document.querySelectorAll('[data-hm-cell-split]').length,
        multi: [...document.querySelectorAll('[data-hm-cell-filled]')].filter((a) =>
          /\b([2-9]|\d\d) (entries|wpisy|wpisów)/.test(a.getAttribute('aria-label') ?? '')
        ).length,
        stack: new Set([...document.querySelectorAll('[data-hm-cell-stack]')].map((c) => c.parentElement)).size
      }));
      console.log(back, JSON.stringify(row));
      await page.locator('[data-cal-step="prev"]').click();
      await page.waitForTimeout(900);
    }
  } else {
    for (const theme of THEMES) {
      await dress(theme);
      await openMonth();
      await cropGrid(`month-${theme}`);
    }
  }
} finally {
  await writeFile(`${outDir}/shots-${tag}.json`, JSON.stringify(shots, null, 2));
  await browser.close();
  await app.close();
}
