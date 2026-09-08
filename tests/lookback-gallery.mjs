/* Renders for the Look back door (phase 10 redesign ticket 11), for sign-off.

   Only what the ticket changed, in crops rather than whole screens (Alicja,
   on ticket 07's sign-off). What changed is the top of /stats - the title on
   the field, the span as the subtitle, the quick picks, the rail with its
   handles, the line under it and the two look-back tiles that moved here
   from Home - and the ways-out list at the foot, which gained the timeline
   and lost three wrapped rows. Nothing else on the screen is shot; the
   charts between read the span now but draw as they did.

   The demo persona has no eras, and the rail is largely about them, so the
   script writes three through the eras screen's own editor first: one
   reaching back before the journal, one closed, one still running.

   Scenes: the top of the door per palette and theme at the default span;
   the span after an era is picked, after a milestone is picked, and a span
   under the wrapped floor; the ways-out list; Home's band where the tiles
   used to be; day one; disguise; 320, 195 (200% zoom) and the 1280 shell.

   Run against a demo build:
     VITE_DEMO=1 npm run build
     node tests/lookback-gallery.mjs --tag after --out /abs/dir

   `--tag before` against another checkout's build shoots the two crops a
   before has (the top of the door, Home's band). vite's `preview({ root })`
   serves the cwd's build, so run it with that checkout as the cwd:
     node -e "process.chdir('/path/to/main'); process.argv.push('--','--tag','before','--out','/abs/dir'); import('/abs/tests/lookback-gallery.mjs')"
   (the leading '--' stands where a script path would, since the flags are
   read from argv[2] on). */
import { preview } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fillDate, launchChromium } from './browser-harness.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? args[at + 1] : fallback;
};
const tag = flag('tag', 'after');
const outDir = resolve(flag('out', resolve(here, '../.claude/lookback-shots')), tag);
const PALETTES = flag('palettes', 'trans,nonbinary,rainbow,agender').split(',');
const THEMES = ['light', 'dark'];
const DAY_MS = 86400000;

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
  page = await browser.newPage({ viewport: { width, height: width > 800 ? 1000 : 900 }, deviceScaleFactor: scale });
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
    if (!document.getElementById('lookback-shot-css')) {
      const style = document.createElement('style');
      style.id = 'lookback-shot-css';
      style.textContent =
        '[data-app-scroll-region]{scrollbar-width:none}[data-app-scroll-region]::-webkit-scrollbar{display:none}';
      document.head.append(style);
    }
  });
};

/** From the app frame's top edge to `extra` px under the first of `until`'s
    selectors that matches, in document order of the list. */
const cropTop = async (name, until, extra = 20, note = '') => {
  await strip();
  await page.waitForTimeout(700);
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

/** A band of the screen from `from`'s top to `to`'s bottom, scrolled into
    view first. */
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
      return { x: frame.x, y: top, width: frame.width, height: Math.min(foot.bottom - top + 16, frame.bottom - top) };
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

const seed = async () => {
  await settle('/');
  await page.locator('[data-fill-every-feature]').click();
  await page.waitForURL('**/more', { timeout: 180000 });
  await page.waitForTimeout(2000);
};


/** The milestone mark farthest from either handle, as a locator: a mark
    under a handle's target is the handle's to drag, not a tap. */
const farMark = async (p) => {
  const index = await p.evaluate(() => {
    const at = (el) => { const r = el.getBoundingClientRect(); return r.x + r.width / 2; };
    const handles = [...document.querySelectorAll('[data-span-handle]')].map(at);
    const marks = [...document.querySelectorAll('[data-span-milestone]')].map(at);
    let best = 0;
    let bestGap = -1;
    marks.forEach((x, i) => {
      const gap = Math.min(...handles.map((h) => Math.abs(h - x)));
      if (gap > bestGap) { bestGap = gap; best = i; }
    });
    return best;
  });
  return p.locator('[data-span-milestone]').nth(index);
};

const iso = (epochDay) => new Date(epochDay * DAY_MS).toISOString().slice(0, 10);

/** Three eras through the screen's own editor, placed off the rail's
    actual span so they land wherever the persona's history is. */
const seedEras = async () => {
  await settle('/stats');
  await page.waitForSelector('[data-span-timeline]');
  const rail = await page.evaluate(() => {
    const el = document.querySelector('[data-span-timeline]');
    return { start: Number(el.dataset.railStart), today: Number(el.dataset.spanEnd) };
  });
  const cut1 = Math.max(rail.start + 30, rail.today - 700);
  const cut2 = Math.max(cut1 + 30, rail.today - 260);
  const eras = [
    { name: 'Before I knew', start: null, end: cut1 },
    { name: 'First year', start: cut1 + 1, end: cut2 },
    { name: 'Since moving', start: cut2 + 1, end: null }
  ];
  for (const era of eras) {
    await settle('/transition/eras');
    await page.locator('[data-add]').click();
    await page.waitForSelector('input[name="era-name"]');
    await page.fill('input[name="era-name"]', era.name);
    if (era.start === null) {
      await page.locator('[data-segmented="era-start"] [data-segment="open"]').click();
    } else {
      await page.locator('[data-segmented="era-start"] [data-segment="day"]').click();
      await page.waitForSelector('input[name="era-start"]', { state: 'attached' });
      await fillDate(page, 'input[name="era-start"]', iso(era.start));
    }
    if (era.end === null) {
      await page.locator('[data-segmented="era-end"] [data-segment="open"]').click();
    } else {
      await page.locator('[data-segmented="era-end"] [data-segment="day"]').click();
      await page.waitForSelector('input[name="era-end"]', { state: 'attached' });
      await fillDate(page, 'input[name="era-end"]', iso(era.end));
    }
    await page.waitForTimeout(200);
    await page.locator('[data-save-era]').click();
    await page.waitForSelector('[data-save-era]', { state: 'detached', timeout: 10000 });
  }
};

/** The top of the door: field, subtitle, quick picks, rail, line, tiles. */
const railTop = (name, note) => cropTop(name, ['[data-tile-grid]', '[data-lookback-rail]', '[data-stats-caption]', '[data-segmented]'], 20, note);

try {
  await seed();
  const isAfter = (await (await settle('/stats'), page.locator('[data-span-timeline]').count())) > 0;
  if (isAfter) await seedEras();

  /* 1. The top of the door, per palette and theme, at the default span. */
  for (const palette of PALETTES) {
    for (const theme of THEMES) {
      await dress(palette, theme);
      await settle('/stats');
      await railTop(`top-${palette}-${theme}`, 'The door as it opens: the last thirty days.');
    }
  }

  /* 2. Home's band where the two tiles used to sit. */
  await dress('trans', 'light');
  await settle('/');
  await cropBand(
    'home-band-trans-light',
    '[data-home-tiles-fold], [data-live-tile-grid]',
    '[data-section-heading]:has(a[href="/timeline"])',
    'Home, from the live tiles to the milestones heading: the two tiles sat between them.'
  );

  if (!isAfter) throw { skipRest: true };

  /* 3. The span, moved three ways. */
  await dress('trans', 'light');
  await settle('/stats');
  await page.waitForSelector('[data-span-era]');
  await (await farMark(page)).click();
  await page.waitForTimeout(800);
  await railTop('span-milestone-trans-light', 'A milestone tapped from the default span: the nearer handle went to it.');
  await page.locator('[data-span-era]').nth(1).click();
  await page.waitForTimeout(800);
  await railTop('span-era-trans-light', 'The middle era tapped: the span is the era.');
  await page.locator('[data-span-handle="start"]').focus();
  await page.keyboard.press('End');
  await page.waitForTimeout(800);
  await railTop('span-thin-trans-light', 'The start handle sent to today: a one-day span, under the wrapped floor.');
  await page.locator('[data-span-handle="start"]').focus();
  await page.keyboard.press('Home');
  await page.waitForTimeout(800);
  await railTop('span-all-trans-light', 'And to the rail\'s start: the whole history.');

  await dress('nonbinary', 'dark');
  await settle('/stats');
  await page.waitForSelector('[data-span-era]');
  await page.locator('[data-span-era]').nth(0).click();
  await page.waitForTimeout(800);
  await railTop('span-era-nonbinary-dark', 'The open-start era, on nonbinary dark.');

  /* 4. The ways out. */
  await dress('trans', 'light');
  await settle('/stats');
  await cropBand('ways-out-trans-light', '[data-section-heading]', '[data-list-row]', 'The ways out: the timeline joins, the wrapped rows are gone.', true);

  /* 5. Day one. */
  await settle('/');
  await page.selectOption('#demo-jump', 'first-run');
  await page.waitForSelector('[data-leave-setup]');
  await page.locator('[data-leave-setup]').click();
  await page.waitForSelector('[data-home-hello]');
  await settle('/stats');
  await cropTop('day-one-trans-light', ['[data-notice]'], 20, 'A journal with nothing dated yet.');

  /* 6. Disguise. */
  await seed();
  await seedEras();
  await dress('trans', 'light');
  await settle('/settings');
  await page.getByRole('button', { name: /Disguise/i }).click();
  await page.getByRole('switch', { name: 'Disguise app' }).click();
  await page.waitForFunction(() => document.title === 'Notes', null, { timeout: 8000 });
  await settle('/stats');
  await railTop('disguise', 'Under disguise: a grey field, every band the one accent.');
  await settle('/settings');
  await page.getByRole('button', { name: /Disguise/i }).click();
  await page.getByRole('switch', { name: 'Disguise app' }).click();
  await page.waitForFunction(() => document.title !== 'Notes', null, { timeout: 8000 });

  /* 7. The widths. A fresh page per width for the device scale; the eras
        live in the journal and survive it, the palette does not and is set
        again. */
  for (const [width, scale, palette, theme] of [
    [320, 2, 'trans', 'light'],
    [320, 2, 'nonbinary', 'dark'],
    [195, 2, 'trans', 'light'],
    [1280, 1, 'trans', 'light']
  ]) {
    await reopen(width, scale);
    await dress(palette, theme);
    await settle('/stats');
    /* A fresh page came up on a re-seeded persona, without the eras. */
    if (!(await page.locator('[data-span-era]').count())) {
      await seedEras();
      await settle('/stats');
    }
    await railTop(`w${width}-${palette}-${theme}`, `At ${width}px.`);
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
