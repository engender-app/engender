/* Renders for the edit mode that arranges Today (phase 10 redesign ticket
   14), for sign-off.

   Only what this ticket changed, in crops rather than whole screens
   (Alicja, on ticket 07's sign-off): the pinned block's new last row, the
   three lists of the edit mode, a row held mid-drag, the handle with the
   keyboard's focus on it, the empty arrangement, the row that a pin adds to
   Today, and the whole thing at 320 and at 200% zoom. Everything above the
   pinned block on Today is ticket 13's and is not shot here.

   Run against a demo build:
     VITE_DEMO=1 npm run build
     node tests/today-editor-gallery.mjs --out /abs/dir

   The demo persona resolves the default set (measurements, care,
   milestones, tryouts), so nothing needs seeding: the arrangement is
   already four rows and the add list already holds twenty-two. */
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
const outDir = resolve(flag('out', resolve(here, '../.claude/today-editor-shots')));
const PALETTES = flag('palettes', 'trans,nonbinary,rainbow,agender').split(',');
const THEMES = ['light', 'dark'];

await mkdir(outDir, { recursive: true });
const browser = await launchChromium();
const app = await preview({ preview: { port: 0 } });
const base = `http://localhost:${app.httpServer.address().port}`;
const shots = [];
const errors = [];

let page = await browser.newPage({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 2 });
const watch = (p) => p.on('pageerror', (err) => errors.push(String(err)));
watch(page);

const reopen = async (width, scale) => {
  await page.close();
  page = await browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: scale });
  watch(page);
};

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

const strip = async () => {
  await page.mouse.move(4, 4);
  return page.evaluate(() => {
    for (const toast of document.querySelectorAll('[data-toast]')) toast.remove();
    for (const bar of document.querySelectorAll('.demo-bar')) bar.remove();
    document.body.classList.remove('has-demo-bar');
    if (!document.getElementById('editor-shot-css')) {
      const style = document.createElement('style');
      style.id = 'editor-shot-css';
      style.textContent =
        '[data-app-scroll-region]{scrollbar-width:none}[data-app-scroll-region]::-webkit-scrollbar{display:none}';
      document.head.append(style);
    }
  });
};

/** A band of the screen from `from`'s top to `to`'s bottom, scrolled into
    view first - `today-gallery.mjs`'s own crop, since a band is measured
    against the app frame rather than the viewport (the frame is what a
    phone shows). */
const cropBand = async (name, from, to, note = '', settleMs = 700, scroll = true) => {
  /* A scene shot mid-gesture may neither strip nor scroll: `strip` parks
     the pointer at the top left corner, which for a drag in flight is a
     drag to the top left corner, and scrolling would move the rows out
     from under the pointer holding one of them. Such a scene strips before
     it takes hold instead. */
  if (scroll) await strip();
  if (scroll) await page.locator(from).first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(settleMs);
  const box = await page.evaluate(
    ([a, b]) => {
      const frame = document.querySelector('[data-app-root]').getBoundingClientRect();
      const head = document.querySelector(a)?.getBoundingClientRect();
      const foot = document.querySelector(b)?.getBoundingClientRect();
      if (!head || !foot) return null;
      const top = Math.max(head.top - 12, frame.top);
      return { x: frame.x, y: top, width: frame.width, height: Math.min(foot.bottom - top + 16, frame.bottom - top) };
    },
    [from, to]
  );
  if (!box) {
    errors.push(`${name}: nothing matched ${from} / ${to}`);
    return;
  }
  await page.screenshot({ path: `${outDir}/${name}.png`, clip: box });
  shots.push({ name, note });
};

const dress = async (palette, theme) => {
  await settle('/settings');
  await page.locator(`[data-palette-pick="${palette}"]`).click();
  await page.locator(`[data-segment="${theme}"]`).click();
  await page.waitForFunction(
    ([p, t]) => document.documentElement.dataset.palette === p && document.documentElement.dataset.theme === t,
    [palette, theme]
  );
};

const home = async () => {
  await settle('/');
  await page.waitForSelector('[data-home-hello]');
  await page.waitForSelector('[data-edit-today]');
};

const openEditor = async () => {
  await home();
  await page.locator('[data-edit-today]').click();
  await page.waitForSelector('[data-today-editor]');
};

/** The arrangement back to the default set and the switches back on, so a
    scene that pinned or unpinned something does not leak into the next. */
const resetAll = async () => {
  await openEditor();
  await page.locator('[data-edit-reset]').click();
  await page.waitForTimeout(400);
  await page.locator('[data-edit-done]').click();
  await page.waitForSelector('[data-pinned-row]');
};

try {
  /* 1. The way in, and the pins as the edit mode draws them, per palette
        and theme: the two crops where the flag's stripe reaches this
        surface. */
  for (const palette of PALETTES) {
    for (const theme of THEMES) {
      await dress(palette, theme);
      await home();
      await cropBand(
        `affordance-${palette}-${theme}`,
        '[data-home-pinned] [data-section-heading]',
        '[data-edit-today]',
        `${palette}, ${theme}: the pinned block with the edit row last`
      );
      await page.locator('[data-edit-today]').click();
      await page.waitForSelector('[data-today-editor]');
      await cropBand(
        `pins-${palette}-${theme}`,
        '[data-today-editor] [data-section-heading]',
        '[data-edit-pinned-row]:last-of-type',
        `${palette}, ${theme}: the arrangement, each row with its handle and its unpin`
      );
      await page.locator('[data-edit-done]').click();
      await page.waitForTimeout(300);
    }
  }

  await dress('trans', 'light');

  /* 2. The add list, the switches and the exits. */
  await openEditor();
  await cropBand('add-list', '[data-edit-add]', '[data-edit-add="appointments"]', 'The add list: the hub order, each row saying what it says there, a plus where the chevron would be');
  await cropBand('switches', '[data-edit-kind="appointment"]', '[data-edit-kind="doseSlot"]', "The agenda's five kinds, in the words the agenda draws them with");
  await page.locator('[data-edit-kind="doseSlot"] [role="switch"]').click();
  await page.waitForSelector('[data-edit-kind="doseSlot"] [role="switch"][aria-checked="false"]');
  await cropBand('switch-off', '[data-edit-kind="letterUnlock"]', '[data-edit-reset]', 'A kind switched off, and the two exits under it: Done, and the one reset');
  await page.locator('[data-edit-reset]').click();
  await page.waitForTimeout(400);

  /* 3. A row held mid-drag, and the handle with the keyboard on it. */
  const grip = page.locator('[data-edit-grip]').last();
  await grip.scrollIntoViewIfNeeded();
  const box = await grip.boundingBox();
  await strip();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y - 62, { steps: 14 });
  await page.waitForTimeout(200);
  await cropBand(
    'lifted',
    '[data-edit-pinned-row]:first-of-type',
    '[data-edit-pinned-row]:last-of-type',
    'A row held: its edge goes hard, the rows it has passed stand aside by its own height, and the slot it came from is still open',
    120,
    false
  );
  await page.mouse.up();
  await page.waitForTimeout(500);

  await page.locator('[data-edit-grip]').first().focus();
  await cropBand('grip-focus', '[data-edit-pinned-row]:first-of-type', '[data-edit-pinned-row]:nth-of-type(2)', "The handle with the keyboard's focus on it: the arrow keys move the row one place and the focus stays on the handle", 300);
  await resetAll();

  /* 4. What a pin does to Today, and what the block says with nothing in
        it at all. */
  await openEditor();
  await page.locator('[data-edit-add="doubt"]').click();
  await page.waitForSelector('[data-edit-pinned-row="doubt"]');
  await page.locator('[data-edit-done]').click();
  await page.waitForSelector('[data-pinned-row="doubt"]');
  await cropBand('pinned-after-add', '[data-home-pinned] [data-section-heading]', '[data-edit-today]', 'The row a pin added, last in the arrangement and carrying its own line, back on Today');

  await page.locator('[data-edit-today]').click();
  await page.waitForSelector('[data-today-editor]');
  for (let i = 0; i < 12; i += 1) {
    const first = page.locator('[data-edit-unpin]').first();
    if (!(await first.count())) break;
    await first.click();
    await page.waitForTimeout(200);
  }
  await cropBand('empty-editing', '[data-today-editor] [data-section-heading]', '[data-edit-add]', 'Nothing pinned, in the edit mode: an empty arrangement is an answer, not a fresh install');
  await page.locator('[data-edit-done]').click();
  await page.waitForTimeout(400);
  await cropBand('empty-today', '[data-home-pinned] [data-section-heading]', '[data-edit-today]', 'And on Today: the block holds the one row, and it asks for the first pin');
  await resetAll();

  /* 5. The narrow width and 200% zoom, where the handle and the unpin have
        to keep the touch floor beside a wrapping title. */
  await reopen(320, 2);
  await openEditor();
  await cropBand('pins-320', '[data-today-editor] [data-section-heading]', '[data-edit-pinned-row]:last-of-type', '320px: the two controls keep their 48px beside the titles');
  await page.locator('[data-edit-done]').click();

  await reopen(195, 2);
  await openEditor();
  await cropBand('pins-zoom', '[data-today-editor] [data-section-heading]', '[data-edit-pinned-row]:last-of-type', '200% zoom (195px CSS): the rows wrap, the controls do not shrink');
  await page.locator('[data-edit-done]').click();
} catch (err) {
  errors.push(String(err));
} finally {
  await writeFile(`${outDir}/index.json`, JSON.stringify({ shots, errors }, null, 2));
  console.log(`${shots.length} shot(s) in ${outDir}`);
  for (const shot of shots) console.log(' ', shot.name);
  if (errors.length) {
    console.log('errors:');
    for (const err of errors) console.log(' ', err);
  }
  await browser.close();
  await app.close();
  process.exit(errors.length ? 1 : 0);
}
