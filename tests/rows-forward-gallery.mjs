/* Screenshots of what phase 11 all-four-doors ticket 02 changed, and nothing
   else (Alicja, 2026-09-07: a review page shows the things the ticket
   touched, not the whole app again).

   Three crops per look, because three blocks of rows changed and no whole
   screen did: the Body group and the Health group on the Transition door,
   the Steps group under them, and Today's pinned block. Each is shot in the
   default palette, light and dark (Alicja, 2026-09-14: sign-off renders are
   the default palette crossed with the two themes, and nothing else), plus
   the two door groups in Polish, which is where a line is longest and where
   the row's chevron leaves least room for it.

   Run: VITE_DEMO=1 npm run build first, then
        node tests/rows-forward-gallery.mjs [outDir]
   Default outDir is .claude/rows-forward-shots/after. BEFORE=1 names the
   other directory, so the same script can be pointed at a build of the
   commit before the ticket - nothing here is after-only, since every crop is
   of rows that already existed and only changed what they say. */
import { preview } from 'vite';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { launchChromium } from './browser-harness.mjs';

const before = process.env.BEFORE === '1';
const outDir = resolve(process.argv[2] ?? `.claude/rows-forward-shots/${before ? 'before' : 'after'}`);

await mkdir(outDir, { recursive: true });
const browser = await launchChromium();
const app = await preview({ preview: { port: 0 } });
const base = `http://localhost:${app.httpServer.address().port}`;
const shots = [];

const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const width = 390;

async function open(path, { strip = true } = {}) {
  await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-app-root][data-boot="ready"]');
  if (await page.locator('[data-leave-setup]').count()) {
    await page.locator('[data-leave-setup]').click();
    await page.waitForSelector('[data-home-hello]');
    await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-app-root][data-boot="ready"]');
  }
  if (!strip) return;
  await page.evaluate(() => {
    for (const toast of document.querySelectorAll('[data-toast]')) toast.remove();
    for (const bar of document.querySelectorAll('.demo-bar')) bar.remove();
    /* Headless Chromium draws a classic scrollbar gutter beside the scroll
       region; a phone draws an overlay one over the content. Hidden for the
       shot so a row's right edge is the screen's, as it is on a device. */
    if (!document.getElementById('rows-shot-css')) {
      const style = document.createElement('style');
      style.id = 'rows-shot-css';
      style.textContent =
        '[data-app-scroll-region]{scrollbar-width:none}[data-app-scroll-region]::-webkit-scrollbar{display:none}';
      document.head.append(style);
    }
  });
}

/** The whole document, with the viewport grown to the scroll region's height
    so nothing is clipped and every element rect is a page coordinate. */
async function grow() {
  const tall = await page.evaluate(() => {
    const s = document.querySelector('[data-app-scroll-region]');
    return Math.min(window.innerHeight + (s.scrollHeight - s.clientHeight) + 40, 8000);
  });
  await page.setViewportSize({ width, height: tall });
  await page.waitForTimeout(150);
}

/** A crop from the top of one element to the bottom of another. `@n` picks
    the nth match, which is how a group is named here: no attribute says
    "the Health group", and the order is the registry's. */
async function crop(name, fromSel, toSel = fromSel) {
  await grow();
  const box = await page.evaluate(
    ([from, to]) => {
      const pick = (spec) => {
        const [sel, at] = spec.split('@');
        const all = [...document.querySelectorAll(sel)];
        if (at === undefined) return all[0];
        const n = Number(at);
        return n < 0 ? all[all.length + n] : all[n];
      };
      const first = pick(from);
      const last = pick(to);
      if (!first || !last) return null;
      return { top: first.getBoundingClientRect().top, bottom: last.getBoundingClientRect().bottom };
    },
    [fromSel, toSel]
  );
  if (!box) {
    console.log(`skip ${name}: ${fromSel} or ${toSel} is not on the screen`);
    return;
  }
  const top = Math.max(0, Math.floor(box.top) - 10);
  const height = Math.min(Math.ceil(box.bottom - top) + 12, 4000);
  await page.screenshot({ path: `${outDir}/${name}.png`, clip: { x: 0, y: top, width, height } });
  shots.push(name);
  await page.setViewportSize({ width, height: 844 });
}

/* Every line here is a read of a real journal, so the seed comes first and
   the look comes after it: `resetDemoFull()` writes the preferences back, so
   a palette set before the click is gone by the time the rows are drawn. */
await open('/', { strip: false });
await page.locator('[data-fill-every-feature]').dispatchEvent('click');
await page.waitForURL('**/more', { timeout: 300000 });
await page.waitForTimeout(3000);

async function wear(theme, locale = 'en') {
  await open('/settings');
  await page.locator('[data-palette-pick="trans"]').click();
  await page.locator(`[data-segment="${theme}"]`).click();
  await page.waitForFunction((want) => document.documentElement.dataset.theme === want, theme);
  await page.locator(`[data-segment="${locale}"]`).click();
  await page.waitForTimeout(800);
}

/* Body is the first group and Health the second; Steps is the third. The
   Media group is not shot: its three rows changed nothing. */
const BODY = ['[data-section-heading]@0', '[data-list-card]@0'];
const HEALTH = ['[data-section-heading]@1', '[data-list-card]@1'];
const STEPS = ['[data-section-heading]@2', '[data-list-card]@2'];

for (const theme of ['light', 'dark']) {
  await wear(theme);

  await open('/more');
  await page.waitForSelector('[data-list-row="measurements"]');
  await crop(`door-body-${theme}`, ...BODY);
  await crop(`door-health-${theme}`, ...HEALTH);
  await crop(`door-steps-${theme}`, ...STEPS);

  await open('/');
  await page.waitForSelector('[data-pinned-row]');
  /* The pinned block only: its heading down to the last row in the card. */
  await crop(`today-pinned-${theme}`, '[data-home-pinned] [data-section-heading]', '[data-home-pinned] [data-list-card]');
}

/* Polish, light only. This is the width check the ticket asks for - a
   Polish line is the longest one the catalogue produces, and these rows
   carry a chevron on the same line. */
await wear('light', 'pl');
await open('/more');
await page.waitForSelector('[data-list-row="measurements"]');
await crop('door-health-pl', ...HEALTH);
await crop('door-steps-pl', ...STEPS);
await wear('light', 'en');

console.log(`${shots.length} shots in ${outDir}`);
for (const name of shots) console.log(`  ${name}.png`);

await browser.close();
await app.close();
