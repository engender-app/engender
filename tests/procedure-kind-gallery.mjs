/* Renders for the procedure kind picker (phase 9 carpet ticket 17), for
   sign-off. Only what this ticket changed: the Kind field on the procedure
   editor, the picker sheet it opens, the custom-kind dilation toggle, and
   the Dilation row on Surgery journey reacting to all three - nothing else
   on the screen is shot.

   Run against a demo build:
     VITE_DEMO=1 npm run build
     node tests/procedure-kind-gallery.mjs --out /abs/dir */
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
const root = resolve(flag('root', resolve(here, '..')));
const outDir = resolve(flag('out', resolve(here, '../.claude/procedure-kind-shots')));
const THEMES = ['light', 'dark'];

await mkdir(outDir, { recursive: true });
const browser = await launchChromium();
const app = await preview({ root, preview: { port: 0 } });
const base = `http://localhost:${app.httpServer.address().port}`;
const shots = [];
const errors = [];

let page = await browser.newPage({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 2 });
const watch = (p) => p.on('pageerror', (err) => errors.push(String(err)));
watch(page);

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
  });
};

const dress = async (theme) => {
  await settle('/settings');
  await page.locator(`[data-segment="${theme}"]`).click();
  await page.waitForFunction((t) => document.documentElement.dataset.theme === t, theme);
};

const seed = async () => {
  await settle('/');
  await page.locator('[data-fill-every-feature]').click();
  await page.waitForURL('**/more', { timeout: 180000 });
  await page.waitForTimeout(1000);
};

/** From the app frame's top edge to `extra` px under the bottom of the
    first matching selector - `cropTop` from journal-door-gallery.mjs. */
const cropTop = async (name, until, extra = 20, note = '') => {
  await strip();
  await page.waitForTimeout(400);
  const box = await page.evaluate(
    ([selectors, pad]) => {
      const frame = document.querySelector('[data-app-root]').getBoundingClientRect();
      const el = [].concat(selectors).map((s) => document.querySelector(s)).find(Boolean);
      if (!el) return null;
      const bottom = el.getBoundingClientRect().bottom;
      return { x: frame.x, y: frame.y, width: frame.width, height: Math.min(bottom - frame.y + pad, frame.height) };
    },
    [until, extra]
  );
  if (!box) {
    errors.push(`${name}: nothing matched ${[].concat(until).join(' / ')}`);
    return;
  }
  await page.screenshot({ path: `${outDir}/${name}.png`, clip: box });
  shots.push({ name, note });
};

/** A tight crop around one element, scrolled into view first - for the
    Dilation row, which sits well below the fold on an archived procedure
    and is invisible to `cropTop`'s "from the frame's top edge" framing. */
const cropRow = async (name, selector, note = '') => {
  await strip();
  await page.locator(selector).first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  const box = await page.evaluate((sel) => {
    const frame = document.querySelector('[data-app-root]').getBoundingClientRect();
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: frame.x, y: Math.max(r.top - 12, frame.top), width: frame.width, height: r.height + 24 };
  }, selector);
  if (!box) {
    errors.push(`${name}: nothing matched ${selector}`);
    return;
  }
  await page.screenshot({ path: `${outDir}/${name}.png`, clip: box });
  shots.push({ name, note });
};

/** Whether the Dilation row is anywhere on the page right now - checked in
    the DOM rather than guessed from a screenshot, since "absent" has
    nothing in a screenshot to point at. */
const hasDilationRow = () => page.locator('[data-list-row="dilation"]').count().then((n) => n > 0);

/** Whatever is on screen right now, clipped to the viewport rather than to
    an element - for "scrolled to the bottom, and there is nothing there"
    shots, where `cropTop`'s own framing (bound to an element's own
    bounding box, which can be taller than the viewport) is the wrong tool. */
const cropViewport = async (name, note = '') => {
  await strip();
  await page.screenshot({ path: `${outDir}/${name}.png` });
  shots.push({ name, note });
};

const openEditor = async () => {
  await settle('/health/surgery');
  await page.locator('[data-edit-procedure]').first().click();
  await page.waitForSelector('[data-procedure-kind]');
};

const pickKind = async (kind) => {
  await page.locator('[data-pick-procedure-kind]').click();
  const option = page.locator(`[data-procedure-kind-option="${kind}"]`);
  await option.waitFor();
  await option.click();
  await page.waitForSelector('[data-procedure-kind-option]', { state: 'detached' });
  await page.waitForTimeout(300);
  return kind;
};

try {
  await seed();

  for (const theme of THEMES) {
    await dress(theme);

    /* 1. The Kind field as it stands on the demo's own procedure - nothing
          set yet, so it reads Custom (the default this ticket gives an
          existing procedure it does not guess at). */
    await openEditor();
    await cropTop(`kind-field-default-${theme}`, ['[data-procedure-kind]'], 90, 'Kind, unset: reads Custom.');

    /* 2. The picker sheet, open over it. */
    await page.locator('[data-pick-procedure-kind]').click();
    await page.waitForSelector('[data-procedure-kind-option]');
    await page.waitForTimeout(300);
    await cropTop(`kind-picker-open-${theme}`, ['[data-sheet]'], 20, 'The kind picker.');
  }

  /* 3. Picking a compiled-in kind updates the field, and gates Dilation in.
        Vulvoplasty is picked first and proven NOT to gate it - the ticket's
        own named trap (no canal to keep) - before vaginoplasty is. */
  await dress('light');
  await openEditor();
  await pickKind('vulvoplasty');
  await cropTop('kind-field-vulvoplasty', ['[data-procedure-kind]'], 20, 'Vulvoplasty picked.');
  await page.locator('[data-sheet] .btn-primary').click();
  await page.waitForTimeout(500);
  if (await hasDilationRow()) errors.push('vulvoplasty gated Dilation in - it should not (no canal to keep)');
  // The wound album's own "Add" button, well above where Dilation would
  // render if it did - the last stable landmark before the gap.
  await page.locator('[data-add-photo]').last().scrollIntoViewIfNeeded();
  await cropViewport(
    'dilation-row-absent-vulvoplasty',
    'No Dilation row: vulvoplasty is deliberately not the gate (no canal to keep).'
  );

  await openEditor();
  await pickKind('vaginoplasty');
  await cropTop('kind-field-vaginoplasty', ['[data-procedure-kind]'], 20, 'Vaginoplasty picked.');
  await page.locator('[data-sheet] .btn-primary').click();
  await page.waitForSelector('[data-list-row="dilation"]', { timeout: 5000 });
  await cropRow('dilation-row-present-vaginoplasty', '[data-list-row="dilation"]', 'Dilation row appears.');

  /* Back to custom, so the next scene starts from the same place the demo
     procedure started. */
  await openEditor();
  await pickKind('custom');
  await page.locator('[data-sheet] .btn-primary').click();
  await page.waitForTimeout(300);

  /* 4. A custom procedure's own dilation toggle - off, then on, then the
        row it gates. A fresh procedure rather than reusing the demo's, so
        the toggle's default (off) is the state being shown. */
  await settle('/health/surgery');
  await page.locator('[data-add]').click();
  await page.waitForSelector('[data-procedure-kind]');
  await page.fill('#surgery-name', 'a procedure this build has no kind for');
  await cropTop('custom-toggle-off', ['[data-procedure-kind]'], 90, 'Custom, toggle off (the default).');

  await page.locator('[role="switch"]').click();
  await page.waitForTimeout(500);
  await cropTop('custom-toggle-on', ['[data-procedure-kind]'], 90, 'Custom, toggle on.');
  await page.locator('[data-sheet] .btn-primary').click();
  await page.waitForSelector('[data-list-row="dilation"]', { timeout: 5000 });
  await cropRow('dilation-row-present-custom-toggle', '[data-list-row="dilation"]', 'The same row, via the toggle.');
} catch (thrown) {
  if (!thrown?.skipRest) throw thrown;
} finally {
  await writeFile(`${outDir}/manifest.json`, JSON.stringify({ shots, errors }, null, 2));
  await browser.close();
  await app.close();
}

console.log(`${shots.length} shot(s) in ${outDir}`);
if (errors.length) {
  console.error(`\n${errors.length} page error(s):`);
  for (const err of errors) console.error(`  ${err}`);
  process.exit(1);
}
