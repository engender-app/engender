/* Renders for phase 11 ticket 19 (the editor asks what happened first):
   the spike before the build's sign-off, and the sign-off itself.

   Only what the ticket changed, over the full fixture: a new entry's fold
   and its whole height, an existing entry's fold and whole height (its
   chips carrying their states), one section opened from its chip, and the
   save bar in both of its states (no mood picked, mood picked). trans,
   light and dark, only (2026-09-14 standing rule).

   `--tag after` is this checkout. The "before" is the 15 September audit's
   own renders of the editor at 8436ce25 (.claude/audit-2026-09-15/entry-*),
   which is what the ticket cites; `--tag before` here re-shoots the fold,
   full and save bar from a checkout at the merge base for the sign-off
   page, run with that checkout as the cwd (vite's preview serves the cwd's
   build):

     VITE_DEMO=1 npm run build
     node tests/ticket-19-sign-off-gallery.mjs --tag after --out /abs/dir

   manifest.json records each full render's height, which is acceptance
   criterion 7 ("at most 1200px" for a new entry, dark, nothing open). */
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
const outDir = resolve(flag('out', resolve('.claude/ticket-19-sign-off-shots')), tag);
const width = 390;
const foldHeight = 844;

await mkdir(outDir, { recursive: true });
const browser = await launchChromium();
const app = await preview({ preview: { port: 0 } });
const base = `http://localhost:${app.httpServer.address().port}`;
const shots = [];
const heights = {};
const errors = [];

const page = await browser.newPage({ viewport: { width, height: foldHeight }, deviceScaleFactor: 2 });
page.on('pageerror', (err) => errors.push(String(err)));

async function settle(path) {
  await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-app-root][data-boot="ready"]', { timeout: 30000 });
  if (await page.locator('[data-leave-setup]').count()) {
    await page.locator('[data-leave-setup]').click();
    await page.waitForSelector('[data-home-hello]');
    await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-app-root][data-boot="ready"]');
  }
}

async function strip() {
  await page.evaluate(() => {
    for (const toast of document.querySelectorAll('[data-toast]')) toast.remove();
    for (const bar of document.querySelectorAll('.demo-bar')) bar.remove();
    if (!document.getElementById('sign-off-shot-css')) {
      const style = document.createElement('style');
      style.id = 'sign-off-shot-css';
      style.textContent =
        '[data-app-scroll-region]{scrollbar-width:none}[data-app-scroll-region]::-webkit-scrollbar{display:none}';
      document.head.append(style);
    }
  });
}

async function fillEveryFeature() {
  await settle('/');
  await page.locator('[data-fill-every-feature]').click();
  await page.waitForURL('**/more', { timeout: 180000 });
  await page.waitForTimeout(1000);
}

async function setLook(palette, theme) {
  await settle('/settings');
  await page.locator(`[data-palette-pick="${palette}"]`).click();
  await page.locator(`[data-segment="${theme}"]`).first().click();
  await page.waitForFunction((t) => document.documentElement.dataset.theme === t, theme);
}

/** The whole screen: the viewport grown until the scroll region no longer
    scrolls, so one shot holds it all (growing once measures a panel
    mid-animation, so this grows until the height stops moving). */
async function grow() {
  let last = -1;
  for (let i = 0; i < 6; i++) {
    const tall = await page.evaluate(() => {
      const s = document.querySelector('[data-app-scroll-region]');
      return Math.min(window.innerHeight + (s.scrollHeight - s.clientHeight), 8000);
    });
    if (tall === last) break;
    last = tall;
    await page.setViewportSize({ width, height: tall });
    await page.waitForTimeout(200);
  }
  return last;
}

async function fold(name) {
  await strip();
  await page.setViewportSize({ width, height: foldHeight });
  await page.waitForTimeout(150);
  await page.screenshot({ path: `${outDir}/${name}.png` });
  shots.push(name);
  process.stdout.write(`  ${name}\n`);
}

async function full(name) {
  await strip();
  const tall = await grow();
  await page.screenshot({ path: `${outDir}/${name}.png` });
  heights[name] = tall;
  shots.push(name);
  process.stdout.write(`  ${name} (${tall}px)\n`);
  await page.setViewportSize({ width, height: foldHeight });
}

async function crop(name, fromSel, toSel = fromSel) {
  await strip();
  await grow();
  const box = await page.evaluate(
    ([from, to]) => {
      const first = document.querySelector(from);
      const last = document.querySelector(to);
      if (!first || !last) return null;
      return { top: first.getBoundingClientRect().top, bottom: last.getBoundingClientRect().bottom };
    },
    [fromSel, toSel]
  );
  if (!box) {
    errors.push(`${name}: ${fromSel} or ${toSel} not found`);
    await page.setViewportSize({ width, height: foldHeight });
    return;
  }
  const top = Math.max(0, Math.floor(box.top) - 10);
  const height = Math.min(Math.ceil(box.bottom - top) + 12, 4000);
  await page.screenshot({ path: `${outDir}/${name}.png`, clip: { x: 0, y: top, width, height } });
  shots.push(name);
  process.stdout.write(`  ${name}\n`);
  await page.setViewportSize({ width, height: foldHeight });
}

/** The save bar is hosted in the app column, outside the scroll region, so
    it is cropped at the fold rather than after growing. */
async function savebar(name) {
  await strip();
  await page.setViewportSize({ width, height: foldHeight });
  await page.waitForTimeout(150);
  const box = await page.evaluate(() => document.querySelector('[data-app-savebar]')?.getBoundingClientRect());
  if (!box) {
    errors.push(`${name}: no save bar`);
    return;
  }
  await page.screenshot({
    path: `${outDir}/${name}.png`,
    clip: { x: 0, y: Math.floor(box.top) - 8, width, height: Math.ceil(box.height) + 16 }
  });
  shots.push(name);
  process.stdout.write(`  ${name}\n`);
}

function todayEpochDay() {
  const now = new Date();
  return Math.floor(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86400000);
}

/** An existing entry from the fixture: the newest on today's day, or the
    first the calendar's last day links to. */
async function existingEntryHref() {
  await settle('/day/today');
  await page.waitForTimeout(500);
  let href = await page.evaluate(() => {
    const links = [...document.querySelectorAll('a[href^="/entry/"]:not([href*="/entry/new"])')];
    return links.length ? links[0].getAttribute('href') : null;
  });
  if (href) return href;
  await settle('/calendar');
  await page.waitForSelector('a[href^="/day/"]');
  const dayHref = await page.evaluate(() => [...document.querySelectorAll('a[href^="/day/"]')].pop()?.getAttribute('href'));
  await settle(dayHref);
  href = await page.evaluate(() => document.querySelector('a[href^="/entry/"]:not([href*="/entry/new"])')?.getAttribute('href'));
  return href;
}

async function openChip(section) {
  await page.locator(`[data-section-chip="${section}"]`).click();
  await page.waitForSelector(`[data-editor-section="${section}"]`);
  await page.waitForTimeout(600);
}

for (const theme of ['light', 'dark']) {
  await fillEveryFeature();
  await setLook('trans', theme);
  const existing = await existingEntryHref();
  if (!existing) errors.push(`${theme}: no existing entry in the fixture`);

  // 1. A new entry: the fold, the whole height, the unmet save bar.
  await settle(`/entry/new/${todayEpochDay()}`);
  await page.waitForSelector('#ed-note');
  await page.waitForTimeout(700);
  await fold(`entry-new-${theme}-fold`);
  await full(`entry-new-${theme}-full`);
  await savebar(`save-bar-no-mood-${theme}`);

  if (tag === 'after') {
    // 2. One section opened from its chip: tags, the longest.
    await openChip('tags');
    await crop(`entry-new-section-tags-${theme}`, '[data-editor-chips]', '[data-editor-section="tags"]');
    await openChip('gender');
    await crop(`entry-new-section-gender-${theme}`, '[data-editor-chips]', '[data-editor-section="gender"]');
    // 3. A mood picked on the bar.
    await page.locator('[data-save-moods] [data-mood="4"]').click();
    await page.waitForTimeout(900);
    await savebar(`save-bar-mood-${theme}`);
  } else {
    await page.locator('[data-mood="4"]').first().click();
    await page.waitForTimeout(900);
    await savebar(`save-bar-mood-${theme}`);
  }

  // 4. An existing entry: its chips carry their states.
  if (existing) {
    await settle(existing);
    await page.waitForSelector('#ed-note');
    await page.waitForTimeout(700);
    await fold(`entry-existing-${theme}-fold`);
    await full(`entry-existing-${theme}-full`);
    if (tag === 'after') {
      await crop(`entry-existing-chips-${theme}`, '.editor-date', '[data-editor-chips]');
    }
  }
}

await writeFile(`${outDir}/manifest.json`, JSON.stringify({ tag, shots, heights, errors }, null, 2));
await page.close();
await browser.close();
await app.close();

console.log(`${shots.length} shot(s) in ${outDir}`);
console.log(JSON.stringify(heights));
if (errors.length) {
  console.error(`${errors.length} error(s):`);
  for (const e of errors) console.error(`  ${e}`);
  process.exitCode = 1;
}
