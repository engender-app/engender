/* Screenshots of the constellation chart (phase 5 deepening ticket 19):
   the /stats card at rest, mid-scrub, with the axes swapped, and the two
   states that are not a chart - no modes at all, and modes with fewer than
   two ticked scales.

   Light and dark on the default palette rather than all eight. What a flag
   changes here is which stripe each mode takes, and the roles those come
   from are already swept across all eight by tests/kit-gallery.mjs; what
   this is for is the plot itself.

   The last shot is the reduced-motion one, which is a check and not a
   picture of a state: the sweep has to substitute rather than delete
   (DIRECTION.md's reduced-motion contract), so the whole path must be there
   in the first frame instead of walking to it. The line printed beside it
   says whether it was.

   Run: VITE_DEMO=1 npm run build first, then
        node tests/constellation-gallery.mjs [outDir]
   Default outDir is .claude/constellation-shots, gitignored and durable. */
import { preview } from 'vite';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { launchChromium } from './browser-harness.mjs';

const outDir = resolve(process.argv[2] ?? '.claude/constellation-shots');
const THEMES = ['dark', 'light'];

await mkdir(outDir, { recursive: true });
const browser = await launchChromium();
const app = await preview({ preview: { port: 0 } });
const base = `http://localhost:${app.httpServer.address().port}`;

const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });

async function settle(path) {
  await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-app-root][data-boot="ready"]');
  if (await page.locator('[data-leave-setup]').count()) {
    await page.locator('[data-leave-setup]').click();
    await page.waitForSelector('[data-home-hello]');
    await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-app-root][data-boot="ready"]');
  }
}

async function wear(theme) {
  await settle('/settings');
  await page.locator(`[data-segment="${theme}"]`).click();
  await page.waitForFunction((want) => document.documentElement.dataset.theme === want, theme);
}

/** The card, not the screen: the whole point is what one chart looks like. */
async function shootCard(name) {
  await page.evaluate(() => {
    for (const toast of document.querySelectorAll('[data-toast]')) toast.remove();
  });
  const card = page.locator('[data-chart-card="constellation"]');
  await card.scrollIntoViewIfNeeded();
  // The sweep takes --dur-authored; this is the resting state after it.
  await page.waitForTimeout(1200);
  await card.screenshot({ path: `${outDir}/${name}.png` });
  console.log(name);
}

for (const theme of THEMES) {
  await wear(theme);
  await settle('/stats');
  await shootCard(`constellation-rest-${theme}`);

  // Mid-scrub: the head walked back so the path ahead of it is gone and
  // the trail behind it is what is left.
  const slider = page.locator('[data-chart-card="constellation"] [data-slider]');
  await slider.focus();
  for (let i = 0; i < 12; i++) await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(200);
  await shootCard(`constellation-scrubbed-${theme}`);

  // The axes swapped, which is what picking the other scale on one of them
  // does.
  await page.selectOption('[data-chart-picker="constellation-x"]', 'femininity');
  await shootCard(`constellation-swapped-${theme}`);

  /* A year of it, which is the density the ticket asks about: 365 daily
     entries in a square about 230px across. */
  await settle('/stats');
  await page.locator('[data-segment="365"]').click();
  await shootCard(`constellation-year-${theme}`);

  /* The card in the company it keeps. A viewport shot rather than
     fullPage: the app scrolls inside [data-app-root] rather than the
     document, so fullPage captures one screen's worth and calls it the
     page. */
  await settle('/stats');
  await page.waitForTimeout(1200);
  await page.locator('[data-chart-card="constellation"]').scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${outDir}/stats-${theme}.png` });
  console.log(`stats-${theme}`);
}

/* The label declutter, checked rather than assumed (ticket CARPET-07): the
   density note's own worst case, 365 daily entries in one square, is
   exactly the collision risk the ticket named. Every label's own box
   gathered and checked pairwise, the same direct assertion the
   reduced-motion check below makes rather than trusting a screenshot to
   prove it. */
await wear('dark');
await settle('/stats');
await page.locator('[data-segment="365"]').click();
await page.waitForTimeout(1200);
const labelBoxes = await page.$$eval('[data-chart-card="constellation"] .cn-point-label', (nodes) =>
  nodes.map((n) => {
    const r = n.getBoundingClientRect();
    return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
  })
);
const overlaps = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
let collided = 0;
for (let i = 0; i < labelBoxes.length; i++) {
  for (let j = i + 1; j < labelBoxes.length; j++) {
    if (overlaps(labelBoxes[i], labelBoxes[j])) collided++;
  }
}
console.log(
  collided === 0
    ? `constellation-labels (${labelBoxes.length} labels, none collide)`
    : `constellation-labels FAILED: ${collided} pair(s) collide out of ${labelBoxes.length}`
);

/* The play button, checked rather than assumed: pressing it has to walk
   the head back to the start and out again, not just sit there. */
await settle('/stats');
await page.waitForTimeout(1200);
const slider = () => page.locator('[data-chart-card="constellation"] [data-slider]');
const valueNow = async () => Number(await slider().getAttribute('aria-valuenow'));
const before = await valueNow();
await page.locator('[data-chart-card="constellation"] [data-constellation-play]').click();
await page.waitForTimeout(50);
const early = await valueNow();
await page.waitForTimeout(1200);
const after = await valueNow();
console.log(
  early < before && after === before
    ? `constellation-play (walked ${before} -> ${early} -> ${after})`
    : `constellation-play FAILED: before ${before}, early ${early}, after ${after}`
);

/* The card with modes and fewer than two ticked scales, which is a state
   and not a fault: it says what would make a plot rather than drawing an
   empty square. Untick one scale in Settings and come back.

   The other state that is not a chart - a journal with no modes at all -
   has no picture: the card is inside one `{#if}` on the presentation count,
   so /stats for that person is the screen it was before this ticket. */
await wear('dark');
await settle('/settings');
await page.locator('[data-list-row="scales"]').click();
await page.locator('[data-list-row="scale-femininity"]').click();
await settle('/stats');
await page.locator('[data-chart-card="constellation"]').scrollIntoViewIfNeeded();
await page.waitForTimeout(400);
await page.locator('[data-chart-card="constellation"]').screenshot({
  path: `${outDir}/constellation-one-scale-dark.png`
});
console.log('constellation-one-scale-dark');

/* Reduced motion. The head starts at the last reading rather than walking
   to it, so the count of marks in the first frame is the count it settles
   at - tier 3's instant cut, and nothing is lost by it, because the whole
   picture is what the sweep arrives at. */
const reduced = await browser.newPage({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  reducedMotion: 'reduce'
});
await reduced.goto(`${base}/stats`, { waitUntil: 'networkidle' });
await reduced.waitForSelector('[data-app-root][data-boot="ready"]');
await reduced.waitForSelector('[data-chart-card="constellation"] svg');
const marks = () =>
  reduced.evaluate(() => document.querySelectorAll('[data-chart-card="constellation"] circle').length);
const atOnce = await marks();
await reduced.waitForTimeout(1200);
const settled = await marks();
await reduced.locator('[data-chart-card="constellation"]').screenshot({
  path: `${outDir}/constellation-reduced-motion.png`
});
console.log(
  atOnce === settled
    ? `constellation-reduced-motion (whole path in the first frame: ${atOnce} marks)`
    : `constellation-reduced-motion FAILED: ${atOnce} marks at first, ${settled} after`
);

await browser.close();
await app.close();
