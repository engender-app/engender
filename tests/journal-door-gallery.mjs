/* Renders for the Journal door (phase 10 redesign ticket 10), for sign-off.

   Only what the ticket changed, in crops rather than whole screens - a
   review page of whole screens across a half-done redesign is unreviewable
   (Alicja, on ticket 07's sign-off). What changed is the top of /calendar
   (the field carrying the month, the control line, and the month as a strip
   or as the grid) and the two blocks that arrived under it (the entries and
   the week). Nothing else on the screen is shot.

   Scenes: the strip and the opened month per palette and theme; the entries
   block; the week block; the day-one journal, where neither month nor week
   draws; the disguised screen; and the two widths that decide the layout -
   320, and the 1280 shell with the rail.

   Run against a demo build:
     VITE_DEMO=1 npm run build
     node tests/journal-door-gallery.mjs --tag after --out /abs/dir

   `--root <dir>` previews another checkout's build for the before column.
   vite's `preview({ root })` serves the *cwd's* build rather than root's, so
   run it with that checkout as the cwd (ticket 23 found this the hard way):
     node -e "process.chdir('/path/to/main'); process.argv.push('--tag','before','--out','/abs/dir'); import('/abs/path/to/tests/journal-door-gallery.mjs')" */
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
const root = resolve(flag('root', resolve(here, '..')));
const outDir = resolve(flag('out', resolve(here, '../.claude/journal-door-shots')), tag);
/* Four flags rather than eight: the field's own eight are ticket 23's
   renders. What this ticket needs from a palette is what its stripe does to
   a strip of thirty bars and to a grid - a pastel, the band that carries no
   small text, a named field, and a flag with shades in it. */
const PALETTES = flag('palettes', 'trans,nonbinary,rainbow,agender').split(',');
/* `--only month` shoots the first scene alone, which is what a before column
   is: the blocks the ticket added have no before, and the screen they were
   added to is the one thing there is to compare. */
const only = flag('only', 'all');
const THEMES = ['light', 'dark'];

await mkdir(outDir, { recursive: true });
const browser = await launchChromium();
const app = await preview({ root, preview: { port: 0 } });
const base = `http://localhost:${app.httpServer.address().port}`;
const shots = [];
const errors = [];

let page = await browser.newPage({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 2 });
/* The one thing every render of the built app has to be checked for before
   anything is read off it: an error at boot. */
const watch = (p) => p.on('pageerror', (err) => errors.push(String(err)));
watch(page);

const reopen = async (width, scale) => {
  await page.close();
  page = await browser.newPage({
    viewport: { width, height: width > 800 ? 1000 : 900 },
    deviceScaleFactor: scale
  });
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
  /* Off any control, or a shot taken after a click carries that control's
     hover ground - which is not a state anybody has on a phone. */
  await page.mouse.move(4, 4);
  return page.evaluate(() => {
    for (const toast of document.querySelectorAll('[data-toast]')) toast.remove();
    for (const bar of document.querySelectorAll('.demo-bar')) bar.remove();
    document.body.classList.remove('has-demo-bar');
    /* Headless Chromium draws a classic scrollbar gutter beside the scroll
       region; a phone draws an overlay one over the content. Hidden so the
       field's right edge is the screen's, as it is on device. */
    if (!document.getElementById('journal-shot-css')) {
      const style = document.createElement('style');
      style.id = 'journal-shot-css';
      style.textContent =
        '[data-app-scroll-region]{scrollbar-width:none}[data-app-scroll-region]::-webkit-scrollbar{display:none}';
      document.head.append(style);
    }
  });
};

/** From the app frame's top edge to `extra` px under the bottom of the first
    of `until`'s selectors that matches. A list rather than one comma-joined
    selector because `querySelector` answers in document order and not in the
    order asked, so a fallback written after a preference would win whenever
    both were on the screen. */
const cropTop = async (name, until, extra = 20, note = '') => {
  await strip();
  await page.waitForTimeout(700);
  const box = await page.evaluate(
    ([selectors, pad]) => {
      const frame = document.querySelector('[data-app-root]').getBoundingClientRect();
      const el = [].concat(selectors).map((s) => document.querySelector(s)).find(Boolean);
      const bottom = el ? el.getBoundingClientRect().bottom : frame.top + 320;
      return {
        x: frame.x,
        y: frame.y,
        width: frame.width,
        height: Math.min(bottom - frame.y + pad, frame.height)
      };
    },
    [until, extra]
  );
  await page.screenshot({ path: `${outDir}/${name}.png`, clip: box });
  shots.push({ name, note });
};

/** A band of the screen: from `from`'s top edge to `to`'s bottom, which is
    how a block that sits below the fold is shot without the screen above
    it. Scrolled to first, so a block below the viewport is in shot at all. */
const cropBand = async (name, from, to, note = '', last = false) => {
  await strip();
  await page.locator(from)[last ? 'last' : 'first']().scrollIntoViewIfNeeded();
  await page.waitForTimeout(700);
  const box = await page.evaluate(
    ([a, b, useLast]) => {
      const pick = (sel, wantLast) => {
        const all = document.querySelectorAll(sel);
        return (wantLast ? all[all.length - 1] : all[0])?.getBoundingClientRect();
      };
      const frame = document.querySelector('[data-app-root]').getBoundingClientRect();
      const head = pick(a, useLast);
      const foot = pick(b, useLast);
      if (!head || !foot) return null;
      const top = Math.max(head.top - 12, frame.top);
      return {
        x: frame.x,
        y: top,
        width: frame.width,
        height: Math.min(foot.bottom - top + 16, frame.bottom - top)
      };
    },
    [from, to, last]
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

/** The control this ticket added, opened. Absent on the before build, where
    the month is always the grid - a missing handle is not an error there. */
const openMonth = async () => {
  const toggle = page.locator('[data-cal-open]');
  if (!(await toggle.count())) return false;
  await toggle.click();
  await page.waitForTimeout(600);
  return true;
};

/** Which reading the month is shaded by. Mood is its own five faces and its
    own hexes (ADR-0025), so a mood month says nothing about the palette; a
    dimension is where the flag's own stripe is what a bar and a cell are
    drawn in, which is what a palette sweep is for. */
const shadeBy = async (which) => {
  const value = await page.evaluate((wantMood) => {
    const select = document.getElementById('calendar-metric');
    if (!select) return null;
    const options = [...select.options].map((o) => o.value);
    return wantMood ? 'mood' : (options.find((v) => v !== 'mood') ?? 'mood');
  }, which === 'mood');
  if (!value) return;
  await page.selectOption('#calendar-metric', value);
  await page.waitForTimeout(500);
};

const seed = async () => {
  await settle('/');
  await page.locator('[data-fill-every-feature]').click();
  await page.waitForURL('**/more', { timeout: 180000 });
  await page.waitForTimeout(2000);
};

try {
  await seed();

  /* 1. The month, folded and opened, per palette and theme, shaded by a
        dimension - which is where the flag's stripe is what the bars are
        drawn in. */
  for (const palette of PALETTES) {
    for (const theme of THEMES) {
      await dress(palette, theme);
      await settle('/calendar');
      await shadeBy('dimension');
      await cropTop(
        `month-strip-${palette}-${theme}`,
        ['[data-cal-grid]'],
        20,
        'The field with the month, the control line, and the month as a strip.'
      );
      if (await openMonth()) {
        await cropTop(
          `month-open-${palette}-${theme}`,
          ['[data-cal-month-body]', '[data-cal-grid]'],
          20,
          'The same month opened: the grid, its legend and its chips, and the chevron turned over.'
        );
      }
    }
  }

  /* 1b. And on mood, which is five faces on five hexes of its own whatever
         the flag is - the one metric a strip cannot say much about. */
  for (const [palette, theme] of [
    ['trans', 'light'],
    ['nonbinary', 'dark']
  ]) {
    await dress(palette, theme);
    await settle('/calendar');
    await shadeBy('mood');
    await cropTop(`mood-strip-${palette}-${theme}`, '[data-cal-ribbon]', 20, 'Shaded by mood.');
    if (await openMonth()) {
      await cropTop(`mood-open-${palette}-${theme}`, '[data-cal-grid]', 20, 'Mood, opened: the faces.');
    }
  }

  if (only === 'month') throw { skipRest: true };

  /* 2. The two blocks that arrived on this door. Two palettes: what they
        draw is a stripe on a date bar and one on a cell, and both were
        already signed off on Home - what is new is that they are here. */
  for (const [palette, theme] of [
    ['trans', 'light'],
    ['nonbinary', 'dark']
  ]) {
    await dress(palette, theme);
    await settle('/calendar');
    await cropBand(
      `entries-${palette}-${theme}`,
      '[data-section-heading]',
      '[data-day-card]',
      'The entries, uncapped, in the shape Home draws them.'
    );
    await cropBand(
      `week-${palette}-${theme}`,
      '[data-section-heading]',
      '[data-week-strip]',
      'The last seven days, which always end today and never page.',
      true
    );
  }

  /* 3. Day one: no month, no week, and the one thing the screen owes. */
  await dress('trans', 'light');
  await settle('/');
  await page.selectOption('#demo-jump', 'first-run');
  await page.waitForSelector('[data-leave-setup]');
  await page.locator('[data-leave-setup]').click();
  await page.waitForSelector('[data-home-hello]');
  await settle('/calendar');
  await cropTop('day-one-trans-light', '[data-notice]', 20, 'A journal with nothing in it.');

  /* 4. Disguise: a grey field, and everything still working. */
  await seed();
  await dress('trans', 'light');
  await settle('/settings');
  await page.getByRole('button', { name: /Disguise/i }).click();
  await page.getByRole('switch', { name: 'Disguise app' }).click();
  await page.waitForFunction(() => document.title === 'Notes', null, { timeout: 8000 });
  await settle('/calendar');
  await cropTop('disguise-strip', ['[data-cal-grid]'], 20, 'Under disguise.');
  if (await openMonth()) {
    await cropTop('disguise-open', '[data-cal-legend], [data-cal-grid]', 20, 'Under disguise, opened.');
  }
  await settle('/settings');
  await page.getByRole('button', { name: /Disguise/i }).click();
  await page.getByRole('switch', { name: 'Disguise app' }).click();
  await page.waitForFunction(() => document.title !== 'Notes', null, { timeout: 8000 });

  /* 5. The widths. 320 is the narrow floor the control line has to fit on;
        1280 is the shell with the rail, where the field is a banner. */
  for (const [width, scale, palette, theme] of [
    [320, 2, 'trans', 'light'],
    [320, 2, 'nonbinary', 'dark'],
    [1280, 1, 'trans', 'light']
  ]) {
    await reopen(width, scale);
    await dress(palette, theme);
    await settle('/calendar');
    /* The longest metric name this install has, because what a narrow line
       has to survive is the picker at its widest. */
    await shadeBy('dimension');
    await cropTop(
      `w${width}-strip-${palette}-${theme}`,
      ['[data-cal-grid]'],
      20,
      `At ${width}px.`
    );
    if (await openMonth()) {
      await cropTop(
        `w${width}-open-${palette}-${theme}`,
        '[data-cal-legend], [data-cal-grid]',
        20,
        `At ${width}px, opened.`
      );
    }
  }
} catch (thrown) {
  if (!thrown?.skipRest) throw thrown;
} finally {
  await writeFile(`${outDir}/manifest.json`, JSON.stringify({ tag, shots, errors }, null, 2));
  await browser.close();
  await app.close();
}

console.log(`${shots.length} shot(s) in ${outDir}`);
if (errors.length) {
  console.error(`\n${errors.length} page error(s):`);
  for (const err of errors) console.error(`  ${err}`);
  process.exit(1);
}
