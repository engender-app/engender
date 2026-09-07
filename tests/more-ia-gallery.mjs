/* Screenshots of the reorganised More tree (phase 9 carpet ticket 16).

   Six screens, which are the six the reorg touches: the hub itself, and the
   five that host a row that left it. The hub is the point - it went from
   twenty-seven top-level rows in five groups to twenty in five, one of them
   new - but a hosted row nobody can find is the failure this is looking for,
   so each host is shot too.

   Every-feature state only. A row's second line is a reading, and the demo
   persona writes in almost none of these areas, so on that state most of the
   hub says what is behind the row instead and the shot would be about the
   fixture rather than about the tree.

   Default flag only, both themes.

   Run: VITE_DEMO=1 npm run build   first, then
        node tests/more-ia-gallery.mjs [outDir]
   Default outDir is .claude/more-ia-shots, which is gitignored and durable. */
import { preview } from 'vite';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './browser-harness.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(process.argv[2] ?? resolve(here, '../.claude/more-ia-shots'));

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
     the whole screen is captured by growing the viewport to the content and
     shrinking it back - stats-gallery.mjs's own note on why fullPage does
     not do it. */
  const shoot = async (name) => {
    await strip();
    const tall = await page.evaluate(() => {
      const scroller = document.querySelector('[data-app-scroll-region]');
      scroller.scrollTop = 0;
      return Math.min(window.innerHeight + (scroller.scrollHeight - scroller.clientHeight) + 40, 12000);
    });
    await page.setViewportSize({ width: 390, height: tall });
    await page.waitForTimeout(600);
    await page.locator('[data-app-root]').screenshot({ path: `${outDir}/${name}-trans-${theme}.png` });
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

  /* The palette and the theme go on after the last navigation, never before:
     `goto` remounts the shell and takes a manually stamped `data-theme` with
     it. */
  const dress = async () => {
    await settle('/settings');
    await page.locator('[data-palette-pick="trans"]').click();
    await page.locator(`[data-segment="${theme}"]`).click();
    await page.waitForFunction((want) => document.documentElement.dataset.theme === want, theme);
  };

  /* The seed resolves by navigating to /more, so that URL is the signal it
     finished rather than a timeout. */
  await settle('/');
  await page.locator('[data-fill-every-feature]').click();
  await page.waitForURL('**/more', { timeout: 180000 });
  await page.waitForTimeout(2000);
  await dress();

  for (const [name, path, waitFor] of [
    ['01-more', '/more', '[data-hub-section="support"]'],
    ['02-care', '/care', '[data-list-row="effects"]'],
    ['03-changes', '/practice/personal-effects', '[data-list-row="side-effects"]'],
    ['04-surgery', '/health/surgery', '[data-list-row="dilation"]'],
    ['05-stats-look-back', '/stats', '[data-list-row="words"]'],
    ['06-settings', '/settings', '[data-list-row="entry-templates"]']
  ]) {
    await settle(path);
    await page.waitForSelector(waitFor, { timeout: 20000 });
    await page.waitForTimeout(1200);
    await shoot(name);
  }

  await page.close();
}

await browser.close();
await app.close();
console.log(`${shots.length} shot(s) in ${outDir}:`);
for (const shot of shots) console.log(`  ${shot}.png`);
