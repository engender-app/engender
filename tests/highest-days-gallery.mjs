/* Screenshots of the "Your highest days" card on the stats hub (phase 9 UX
   carpet ticket 11).

   `gallery:stats` shoots the whole screen, several thousand pixels of it,
   and this card is nine rows somewhere in the middle. What this ticket's
   sign-off is about is the card on its own: the chooser on its heading line,
   and how tight the rows under it read.

   Three shots per theme: the card as the persona lands on it, the card after
   the chooser has been moved to another scale, and the card at the seven-day
   range, where the ranking has the fewest days to pick from.

   The demo persona keeps euphoria and femininity, so the chooser has three
   options - mood, euphoria, femininity - which is the shape the control has
   to work at. "Reset demo state" is enough here: the card ranks days off
   entry readings and wants no dated area at all, so the twenty-minute fill
   would buy this card nothing.

   Run: VITE_DEMO=1 npm run build   first, then
        node tests/highest-days-gallery.mjs [outDir]
   Default outDir is .claude/highest-days-shots, gitignored and durable. */
import { preview } from 'vite';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './browser-harness.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(process.argv[2] ?? resolve(here, '../.claude/highest-days-shots'));

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

  /* The seed is ~145 entries and takes the better part of half a minute on
     this machine. Home's count line is the signal it has started - it renders
     only once there are entries to count - and the line going quiet for two
     reads in a row is the signal it has finished. Both halves are needed:
     navigating away mid-seed leaves the next boot hanging before
     `data-boot="ready"`, and pacing off a timeout instead shoots a screen
     whose every panel still says "not enough data in this range yet". */
  const seeded = async () => {
    await page.waitForSelector('[data-home-count]', { timeout: 180000 });
    let last = null;
    for (let quiet = 0; quiet < 2; ) {
      await page.waitForTimeout(1000);
      const now = await page.locator('[data-home-count]').textContent();
      quiet = now === last ? quiet + 1 : 0;
      last = now;
    }
  };

  /* The card alone, cropped off its own rectangle inside the scroll region.
     The app scrolls `[data-app-scroll-region]` rather than the document, so
     the card is scrolled into view first and then measured against the
     viewport it is now inside. */
  const shootCard = async (name) => {
    await page.evaluate(() => {
      for (const toast of document.querySelectorAll('[data-toast]')) toast.remove();
      for (const bar of document.querySelectorAll('.demo-bar')) bar.remove();
      document
        .querySelector('[data-chart-card="highest-days"]')
        .scrollIntoView({ block: 'center', behavior: 'instant' });
    });
    await page.waitForTimeout(900);
    const file = `${outDir}/${name}-trans-${theme}.png`;
    await page.locator('[data-chart-card="highest-days"]').screenshot({ path: file });
    shots.push(`${name}-trans-${theme}`);
  };

  /* Palette and theme after the last navigation of each state, never before:
     `goto` remounts the shell and takes a manually stamped `data-theme`. */
  const dress = async () => {
    await settle('/settings');
    await page.locator('[data-palette-pick="trans"]').click();
    await page.locator(`[data-segment="${theme}"]`).click();
    await page.waitForFunction((want) => document.documentElement.dataset.theme === want, theme);
  };

  await settle('/');
  await page.getByRole('button', { name: 'Reset demo state' }).click();
  await seeded();
  await dress();
  await settle('/stats');
  await page.waitForSelector('[data-chart-card="highest-days"]');
  await page.waitForTimeout(1500);
  await shootCard('01-default');

  const picker = page.locator('[data-chart-picker="highest-metric"]');
  if (await picker.count()) {
    await picker.selectOption('mood');
    await page.waitForTimeout(1200);
    await shootCard('02-mood');
    await picker.selectOption('femininity');
    await page.waitForTimeout(1200);
    await shootCard('03-femininity');
  }

  await page.locator('[data-segment="7"]').click();
  await page.waitForTimeout(1500);
  await shootCard('04-seven-days');

  await page.close();
}

await app.httpServer.close();
await browser.close();

console.log(`${shots.length} shot(s) in ${outDir}`);
for (const shot of shots) console.log(' ', shot);
