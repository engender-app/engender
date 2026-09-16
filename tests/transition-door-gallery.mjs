/* Screenshots of what phase 10 redesign ticket 15 changed on the Transition
   door, and nothing else on it (Alicja, 2026-09-07: a review page shows the
   things the ticket touched, not the whole app again).

   Four things changed, so there are four kinds of shot: the field, which now
   holds a search box; the group heading, which reads Steps; the search
   itself, in its three states; and the foot of the list, which no longer
   points at preferences. Each is a crop, and each has a before wherever a
   before exists.

   Run: VITE_DEMO=1 npm run build first, then
        node tests/transition-door-gallery.mjs [outDir]
   Default outDir is .claude/transition-door-shots/after; BEFORE=1 skips the
   shots of things that only exist after the ticket, so the same script can
   be pointed at a build of the commit before it. */
import { preview } from 'vite';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { launchChromium } from './browser-harness.mjs';

const before = process.env.BEFORE === '1';
const outDir = resolve(process.argv[2] ?? `.claude/transition-door-shots/${before ? 'before' : 'after'}`);

await mkdir(outDir, { recursive: true });
const browser = await launchChromium();
const app = await preview({ preview: { port: 0 } });
const base = `http://localhost:${app.httpServer.address().port}`;
const shots = [];

let page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
let width = 390;

async function open(path) {
  await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-app-root][data-boot="ready"]');
  if (await page.locator('[data-leave-setup]').count()) {
    await page.locator('[data-leave-setup]').click();
    await page.waitForSelector('[data-home-hello]');
    await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-app-root][data-boot="ready"]');
  }
  await page.evaluate(() => {
    for (const toast of document.querySelectorAll('[data-toast]')) toast.remove();
    for (const bar of document.querySelectorAll('.demo-bar')) bar.remove();
    /* Headless Chromium draws a classic scrollbar gutter beside the scroll
       region; a phone draws an overlay one over the content. Hidden for the
       shot so the field's right edge is the screen's, as it is on a device
       (the same rule direction-swing-gallery.mjs adds, and the same note
       Alicja made on the round-one renders). */
    if (!document.getElementById('door-shot-css')) {
      const style = document.createElement('style');
      style.id = 'door-shot-css';
      style.textContent =
        '[data-app-scroll-region]{scrollbar-width:none}[data-app-scroll-region]::-webkit-scrollbar{display:none}';
      document.head.append(style);
    }
  });
}

/** The whole document, with the viewport grown to the scroll region's height
    so nothing is clipped and every element rect is a page coordinate (the
    app does not scroll its document; `[data-app-scroll-region]` does). */
async function grow() {
  const tall = await page.evaluate(() => {
    const s = document.querySelector('[data-app-scroll-region]');
    return Math.min(window.innerHeight + (s.scrollHeight - s.clientHeight) + 40, 8000);
  });
  await page.setViewportSize({ width, height: tall });
  await page.waitForTimeout(150);
}

/** A crop from the top of one element to the bottom of another, with a
    little of the page either side so an edge is visible as an edge.

    A selector may end in `@n` to mean the nth match (negative counts from
    the end), because what these crops are cutting to is "the third group's
    heading" and "the last list on the screen", which no attribute says. */
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
      const a = first.getBoundingClientRect();
      const b = last.getBoundingClientRect();
      return { top: a.top, bottom: b.bottom };
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

/* The third group is the one this ticket renames, and the third list card is
   its rows; the fifth group is the last one, and the last card on the screen
   is either its rows (after) or the Settings row under them (before). */
const STEPS = ['[data-section-heading]@2', '[data-list-card]@2'];
const FOOT = ['[data-section-heading]@4', '[data-list-card]@-1'];

async function wear(palette, theme, locale = 'en') {
  await open('/settings');
  await page.locator(`[data-palette-pick="${palette}"]`).click();
  await page.locator(`[data-segment="${theme}"]`).click();
  await page.waitForFunction((want) => document.documentElement.dataset.theme === want, theme);
  /* The language segmented control on the same screen. Its values are
     system/en/pl and the theme's are system/light/dark, so `pl` and `en` are
     unambiguous; picking one reloads the app (setLocale), which `open` below
     waits out anyway. */
  await page.locator(`[data-segment="${locale}"]`).click();
  await page.waitForTimeout(800);
  await open('/more');
  await page.waitForSelector('[data-list-row="measurements"]');
}

/* ---------- 1. the field ----------

   Before: this door hid its title and had no field at all, so the header
   painted nothing and the first group heading was the top of the screen.
   After: a solid block of the flag's second colour with the search box on
   it, a block of the page's own colour (DIRECTION.md rule 7). Four flags,
   because the box has to sit legibly on a light field and a dark one, and
   both themes on the one this app is most often wearing. */
for (const [palette, theme] of [
  ['trans', 'light'],
  ['trans', 'dark'],
  ['nonbinary', 'light'],
  ['pansexual', 'light'],
  ['agender', 'dark']
]) {
  await wear(palette, theme);
  await crop(`field-${palette}-${theme}`, '[data-screen-header]', '[data-section-heading]');
}

/* ---------- 2. the group heading ----------

   "Transition inside Transition says nothing", so the group is Steps. The
   crop is the heading with its nine rows, in both languages, because the
   Polish word is a different word and not a translation of the tab's. */
await wear('trans', 'light');
await crop('steps-en', ...STEPS);

await wear('trans', 'light', 'pl');
await crop('steps-pl', ...STEPS);
await wear('trans', 'light', 'en');

/* ---------- 3. the foot of the list ----------

   Before: a Settings row sat under the last group, on its own, pointing at
   preferences. After: the list ends with Media, and preferences are reached
   from the gear in Today's header. */
await crop('foot', ...FOOT);

if (!before) {
  /* ---------- 4. the search, in its three states ----------

     Only after: none of this existed. An area matched by name, a record
     matched inside an area, and a query nothing answers. */
  await wear('trans', 'light');
  await page.locator('[data-hub-search]').fill('wear');
  await page.waitForSelector('[data-hub-results] [data-list-row="wear"]');
  await page.waitForTimeout(600);
  await crop('search-area', '[data-screen-header]', '[data-hub-results]');

  await page.locator('[data-hub-search]').fill('endo');
  await page.waitForSelector('[data-search-hit]');
  await page.waitForTimeout(700);
  await crop('search-records', '[data-screen-header]', '[data-hub-results]');

  /* Both halves answering at once, which is the only state where the two
     lists meet: the areas in role 0, the heading that names what is not an
     area, and the records in role 1 under it. */
  await page.locator('[data-hub-search]').fill('log');
  await page.waitForSelector('[data-search-hit]');
  await page.waitForTimeout(700);
  await crop('search-both', '[data-screen-header]', '[data-hub-results]');

  /* Not shot: a page of records with more behind it. No query the demo
     journal answers reaches twenty records, so the control that asks for the
     next twenty has no state to be photographed in - the search screen's own
     `list_more` is the same control, on the same copy. */

  await page.locator('[data-hub-search]').fill('qqzzxx');
  await page.waitForSelector('[data-notice="hub-search-none"]');
  await page.waitForTimeout(600);
  await crop('search-nothing', '[data-screen-header]', '[data-hub-results]');

  /* ---------- 5. the field under disguise ----------

     Rule 3's disguise clause: the field falls to --surface-2 and its ink to
     --text, so the search box is a --bg block on a grey band rather than on
     a stripe. The one state where the box's own 1.5px edge is what makes it
     a box at all, which is why it is shot. */
  await wear('trans', 'light');
  await open('/settings');
  await page.locator('[data-list-row="disguise"]').click();
  await page.locator("[data-sheet] .switch").first().click();
  await page.waitForTimeout(500);
  await open('/more');
  await page.waitForSelector('[data-list-row="measurements"]');
  await crop('field-disguised', '[data-screen-header]', '[data-section-heading]');
  await page.locator('[data-hub-search]').fill('wear');
  await page.waitForSelector('[data-hub-results] [data-list-row="wear"]');
  await page.waitForTimeout(500);
  await crop('search-disguised', '[data-screen-header]', '[data-hub-results]');
  // Back off, so nothing after this shoots a disguised app.
  await open('/settings');
  await page.locator('[data-list-row="disguise"]').click();
  await page.locator("[data-sheet] .switch").first().click();
  await page.waitForTimeout(500);

  /* ---------- 6. the floor: 320px, and 200% zoom in Polish ----------

     The accessibility floor DIRECTION.md names, on the one surface this
     ticket adds: the box has to hold its target and its placeholder at
     320px, and at 200% zoom on a 390px phone, which leaves about 195. */
  await page.close();
  width = 320;
  page = await browser.newPage({ viewport: { width, height: 844 }, deviceScaleFactor: 2 });
  await wear('trans', 'light');
  await page.locator('[data-hub-search]').fill('wear');
  await page.waitForSelector('[data-hub-results] [data-list-row="wear"]');
  await crop('floor-320-en', '[data-screen-header]', '[data-hub-results]');

  await page.close();
  width = 195;
  page = await browser.newPage({ viewport: { width, height: 844 }, deviceScaleFactor: 2 });
  await wear('trans', 'light', 'pl');
  await crop('floor-195-pl-rest', '[data-screen-header]', '[data-section-heading]');
  // An area whose Polish name is nothing like its English one: Depilacja.
  await page.locator('[data-hub-search]').fill('depilacj');
  await page.waitForSelector('[data-hub-results] [data-list-row="hair-removal"]');
  await page.waitForTimeout(600);
  await crop('floor-195-pl-search', '[data-screen-header]', '[data-hub-results]');
}

await page.close();
await app.close();
await browser.close();

console.log(`${shots.length} shots in ${outDir}`);
