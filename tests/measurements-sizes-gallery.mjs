/* Renders for Measurements and sizes (phase 10 redesign ticket 61), for
   sign-off.

   Only what the ticket changed, in crops rather than whole screens (Alicja,
   on ticket 07's sign-off), and in the default palette crossed with the two
   themes and nothing else (Alicja, 2026-09-14) - the eight-palette cross
   product is `palette-contrast.test.ts`'s job, not something to look
   through by eye.

   What changed: the two screens became one, and each half gained a line
   that says what changed rather than only what was recorded. So the scenes
   are the head of the merged screen through the Start / Current / Change
   line, and the sizes half from its heading through the change lines and
   the first group of the log.

   A `before` is the same two bands off the two old screens, so the pair
   reads side by side.

   Run against a demo build:
     VITE_DEMO=1 npm run build
     node tests/measurements-sizes-gallery.mjs --tag after --out /abs/dir

   `--tag before` wants another checkout's build, and vite's `preview`
   serves the cwd rather than its own root flag, so run it with that
   checkout as the cwd:
     node -e "process.chdir('/path/to/main'); process.argv.push('--','--tag','before','--out','/abs/dir'); import('/abs/tests/measurements-sizes-gallery.mjs')"
   (the leading '--' stands where a script path would, since the flags are
   read from argv[2] on). */
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
const outDir = resolve(flag('out', resolve(here, '../.claude/measurements-sizes-shots')), tag);
const THEMES = ['light', 'dark'];

await mkdir(outDir, { recursive: true });
const browser = await launchChromium();
const app = await preview({ preview: { port: 0 } });
const base = `http://localhost:${app.httpServer.address().port}`;
const shots = [];
const errors = [];

const page = await browser.newPage({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 2 });
page.on('pageerror', (err) => errors.push(String(err)));

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

const strip = () =>
  page.evaluate(() => {
    for (const toast of document.querySelectorAll('[data-toast]')) toast.remove();
    for (const bar of document.querySelectorAll('.demo-bar')) bar.remove();
    document.body.classList.remove('has-demo-bar');
    if (!document.getElementById('ms-shot-css')) {
      const style = document.createElement('style');
      style.id = 'ms-shot-css';
      style.textContent =
        '[data-app-scroll-region]{scrollbar-width:none}[data-app-scroll-region]::-webkit-scrollbar{display:none}';
      document.head.append(style);
    }
  });

/** From the app frame's top edge to `pad` px under the first selector in
    `until` that matches. */
const cropTop = async (name, until, pad = 20, note = '') => {
  await page.mouse.move(4, 4);
  await strip();
  await page.waitForTimeout(700);
  const box = await page.evaluate(
    ([selectors, extra]) => {
      const frame = document.querySelector('[data-app-root]').getBoundingClientRect();
      const el = [].concat(selectors).map((s) => document.querySelector(s)).find(Boolean);
      if (!el) return null;
      return {
        x: frame.x,
        y: frame.y,
        width: frame.width,
        height: Math.min(el.getBoundingClientRect().bottom - frame.y + extra, frame.height)
      };
    },
    [until, pad]
  );
  if (!box) {
    errors.push(`${name}: nothing matched ${[].concat(until).join(' / ')}`);
    return;
  }
  await page.screenshot({ path: `${outDir}/${name}.png`, clip: box });
  shots.push({ name, note });
};

/** A band from `from`'s top to `to`'s bottom, scrolled into view first. */
const cropBand = async (name, from, to, note = '') => {
  await page.mouse.move(4, 4);
  await strip();
  if (!(await page.locator(from).count())) {
    errors.push(`${name}: nothing matched ${from}`);
    return;
  }
  await page.locator(from).first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(700);
  const box = await page.evaluate(
    ([a, b]) => {
      const frame = document.querySelector('[data-app-root]').getBoundingClientRect();
      const head = document.querySelector(a)?.getBoundingClientRect();
      const foot = document.querySelector(b)?.getBoundingClientRect();
      if (!head || !foot) return null;
      /* The floating bar sits over the page, so a band that ran to the
         frame's own bottom would be shot through it. */
      const bar = document.querySelector('[data-app-nav]')?.getBoundingClientRect();
      const floor = Math.min(frame.bottom, bar && bar.top > head.top ? bar.top - 8 : frame.bottom);
      const top = Math.max(head.top - 12, frame.top);
      return { x: frame.x, y: top, width: frame.width, height: Math.min(foot.bottom - top + 16, floor - top) };
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

const dress = async (theme) => {
  await settle('/settings');
  await page.locator('[data-palette-pick="trans"]').click();
  await page.locator(`[data-segment="${theme}"]`).click();
  await page.waitForFunction(
    (t) => document.documentElement.dataset.palette === 'trans' && document.documentElement.dataset.theme === t,
    theme
  );
};

const seed = async () => {
  await settle('/');
  await page.locator('[data-fill-every-feature]').click();
  await page.waitForURL('**/more', { timeout: 180000 });
  await page.waitForTimeout(2000);
};

try {
  await seed();

  for (const theme of THEMES) {
    await dress(theme);

    await settle('/body/measurements');
    if (tag === 'after') {
      await cropTop(
        `head-${theme}`,
        ['[data-measurement-span]'],
        16,
        'the merged screen down to the Start / Current / Change line'
      );
      /* The whole reading half: the span, the chart it was read off, and
         the first rows of the log under it. */
      await cropBand(`reading-${theme}`, '[data-measurement-span]', '[data-measurement]', 'the span over its chart');
      /* From the one heading on the page - the boundary between the two
         halves, which carries the size log's own add - down into the log,
         so the crop shows what the change lines sit under. */
      await page.evaluate(() => {
        document.querySelector('[data-add-size]')?.closest('[data-section-heading]')?.setAttribute('data-sizes-head', '');
      });
      await cropBand(
        `sizes-${theme}`,
        '[data-sizes-head]',
        '[data-size-record]',
        'the sizes half: its heading, the change lines and the log under them'
      );
      const said = await page.locator('[data-size-changes] p').allInnerTexts();
      shots.push({ name: 'change lines read', note: said.join(' | ') });
    } else {
      await cropTop(`head-${theme}`, ['[data-kit-chart]', '.kit-chart', '[data-measurement]'], 16, 'the old measurements screen');
      await settle('/body/sizes');
      await cropTop(`sizes-${theme}`, ['[data-size-record]'], 16, 'the old size log');
    }
  }
} finally {
  await writeFile(
    `${outDir}/shots.json`,
    JSON.stringify({ tag, shots, errors }, null, 2) + '\n'
  );
  await page.close();
  await browser.close();
  await app.close();
}

console.log(JSON.stringify({ tag, outDir, shots, errors }, null, 2));
if (errors.length) process.exitCode = 1;
