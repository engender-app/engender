/* Sign-off renders for phase 11 ticket 04: one front-page editor.

   Only what this ticket changed, in the default palette and the two themes
   (Alicja, 2026-09-14) - the editor's new Tiles section, the screen the
   tiles left, and the Settings card that lost its four floating toggles.
   Nothing else about Today, the editor's pins or the agenda kinds is shot
   here; those are redesign ticket 14's and `today-editor-gallery.mjs` still
   holds them.

   Run twice, once per build, because "before" is a different checkout:

     VITE_DEMO=1 npm run build
     node tests/front-page-editor-gallery.mjs --tag after --out /abs/dir

   and the same with `--tag before` from a worktree at the branch point. A
   process per build rather than two `preview()` calls in one: vite caches
   the built document in process and would serve one build's index.html
   against the other's asset hashes.

   The Tiles section only exists in the after build, so that shot is skipped
   rather than failed when its heading is not there. */
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
const tag = flag('tag', 'after');
const outDir = resolve(flag('out', resolve(here, '../.claude/front-page-editor-shots')));
const THEMES = ['light', 'dark'];

await mkdir(outDir, { recursive: true });
const browser = await launchChromium();
const app = await preview({ preview: { port: 0 } });
const base = `http://localhost:${app.httpServer.address().port}`;
const shots = [];
const errors = [];

let page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
page.on('pageerror', (err) => errors.push(String(err)));

/** A narrower phone, for the width where a switch row and a wrapping title
    have to share 195 CSS px (390 at 200% zoom - the accessibility floor this
    app holds itself to). A new context rather than a resize: the app reads
    its width at mount. */
const reopen = async (width) => {
  await page.close();
  page = await browser.newPage({ viewport: { width, height: 844 }, deviceScaleFactor: 2 });
  page.on('pageerror', (err) => errors.push(String(err)));
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

/** Palette and theme from the real controls, after any seeding: a demo jump
    reassigns the whole preference store, so anything dressed before one is
    thrown away. */
const dress = async (theme) => {
  await settle('/settings');
  await page.locator('[data-palette-pick="trans"]').click();
  await page.locator(`[data-segment="${theme}"]`).click();
  await page.waitForFunction(
    (t) => document.documentElement.dataset.palette === 'trans' && document.documentElement.dataset.theme === t,
    theme
  );
};

/** The document does not scroll and `[data-app-root]` is not the scroller,
    so a band taller than the phone can only be photographed by growing the
    viewport to the scroll region's content and shrinking it back - the
    layout stays the 390px one and only the height is unreal. Clipping to
    844 instead is how six byte-identical tops of a screen once reached a
    sign-off gallery. */
const grow = async () => {
  await page.evaluate(() => {
    const region = document.querySelector('[data-app-scroll-region]');
    if (region) region.scrollTop = 0;
  });
  /* Until it stops growing, rather than once: a panel that opened with a
     clip animation (the editor) is still short when the first measurement
     is taken, and one round would photograph a frame 1100px shorter than
     its own content. */
  let last = 0;
  for (let round = 0; round < 5; round += 1) {
    await page.waitForTimeout(500);
    const tall = await page.evaluate(() => {
      const region = document.querySelector('[data-app-scroll-region]');
      if (!region) return window.innerHeight;
      return Math.min(window.innerHeight + (region.scrollHeight - region.clientHeight) + 40, 8000);
    });
    if (tall <= last + 4) break;
    last = tall;
    await page.setViewportSize({ width: page.viewportSize().width, height: tall });
  }
  await page.waitForTimeout(400);
};

const shrink = () => page.setViewportSize({ width: page.viewportSize().width, height: 844 });

/** `sel` or `sel@n` for the nth match, which is how a section heading is
    named here: the kit's heading takes no handle of its own, and reading it
    by its words would tie these shots to the copy. */
const at = (page, spec) => {
  const [sel, index] = spec.split('@');
  return index === undefined ? page.locator(sel).first() : page.locator(sel).nth(Number(index));
};

/** A band from `from`'s top to `to`'s bottom, measured against the app frame
    rather than the viewport, since the frame is what a phone shows. */
const cropBand = async (name, from, to, note, { optional = false } = {}) => {
  await strip();
  if (!(await at(page, from).count()) || !(await at(page, to).count())) {
    if (!optional) errors.push(`${name}: nothing matched ${from} / ${to}`);
    return;
  }
  await grow();
  const box = await page.evaluate(
    ([a, b]) => {
      const pick = (spec, last) => {
        const [sel, index] = spec.split('@');
        const all = [...document.querySelectorAll(sel)];
        if (index !== undefined) return all[Number(index)];
        return last ? all[all.length - 1] : all[0];
      };
      const frame = document.querySelector('[data-app-root]').getBoundingClientRect();
      const head = pick(a, false)?.getBoundingClientRect();
      const foot = pick(b, true)?.getBoundingClientRect();
      if (!head || !foot) return null;
      const top = Math.max(head.top - 12, frame.top);
      return { x: frame.x, y: top, width: frame.width, height: Math.min(foot.bottom - top + 16, frame.bottom - top) };
    },
    [from, to]
  );
  if (process.env.GALLERY_DEBUG) console.log(name, JSON.stringify(box));
  if (!box) {
    await shrink();
    errors.push(`${name}: could not measure ${from} / ${to}`);
    return;
  }
  /* Shot while the viewport is still the tall one: a clip is in page
     coordinates, so shrinking first puts most of the band outside the
     page and Playwright refuses the zero-height rect that is left. */
  await page.screenshot({ path: `${outDir}/${name}.png`, clip: box });
  await shrink();
  shots.push({ name, note, file: `${name}.png` });
};

/** A whole screen, the same way. */
const wholeScreen = async (name, note) => {
  await strip();
  await grow();
  await page.locator('[data-app-root]').screenshot({ path: `${outDir}/${name}.png` });
  await shrink();
  shots.push({ name, note, file: `${name}.png` });
};

const openEditor = async () => {
  await settle('/');
  await page.waitForSelector('[data-home-hello]');
  await page.locator('[data-edit-today]').click();
  await page.waitForSelector('[data-today-editor]');
};

try {
  for (const theme of THEMES) {
    await dress(theme);

    /* 1. The editor's own new section. After only: before, there is nothing
          in this surface between the add list and the agenda kinds. */
    await openEditor();
    /* The third heading in the editor, by position: the kit's heading takes
       no handle, and reading it by its words would tie the shot to the
       copy. In the before build there is no such section at all, so the
       crop is not attempted rather than skipped by a selector that would
       quietly photograph the agenda kinds instead. */
    if (tag === 'after') {
      await cropBand(
        `${tag}-editor-tiles-${theme}`,
        '[data-today-editor] [data-section-heading]@2',
        '[data-edit-tile]',
        `trans ${theme}: the thirteen tiles in the editor, in the order Home draws them`
      );
    }
    /* The reset, which covers the tiles now and says so. */
    await page.locator('[data-edit-reset]').click();
    await page.waitForSelector('[data-confirm-edit-reset]');
    await page.waitForTimeout(500);
    await strip();
    await page.screenshot({ path: `${outDir}/${tag}-reset-${theme}.png` });
    shots.push({
      name: `${tag}-reset-${theme}`,
      note: `trans ${theme}: the one write behind a question, now covering the tiles as well as the pins and the agenda kinds`,
      file: `${tag}-reset-${theme}.png`
    });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    /* 2. The screen the tiles left, whole: thirteen rows shorter, with the
          four prompts that came off Settings under a heading of their own. */
    await settle('/settings/notifications');
    await wholeScreen(
      `${tag}-notifications-${theme}`,
      `trans ${theme}: /settings/notifications, whole`
    );

    /* 3. And the Settings card that lost them. */
    await settle('/settings');
    await cropBand(
      `${tag}-settings-tracking-${theme}`,
      '[data-cycle-tracking-toggle]',
      '[data-list-row="metric"]',
      `trans ${theme}: the Tracking section from cycle tracking down to the colour row`
    );
  }
  /* And the new section at the accessibility floor, where the row has 195
     CSS px for a wrapping title, a wrapping line and a 48px switch. */
  if (tag === 'after') {
    await reopen(195);
    await dress('light');
    await openEditor();
    await cropBand(
      `${tag}-editor-tiles-zoom`,
      '[data-today-editor] [data-section-heading]@2',
      '[data-edit-tile="surgery-countdown"]',
      'trans light at 195px (200% zoom on a 390px phone): the title and the line wrap, the switch keeps its 48'
    );
  }
} catch (err) {
  errors.push(String(err));
} finally {
  await writeFile(`${outDir}/index-${tag}.json`, JSON.stringify({ tag, shots, errors }, null, 2));
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
