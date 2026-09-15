/* Renders for the words reading (phase 10 redesign ticket 62), for sign-off.

   Only what the ticket changed, in crops rather than whole screens (Alicja,
   on ticket 07's sign-off), and in the default palette light and dark and
   nothing else (Alicja, 2026-09-14). What changed is one card on the Look
   back door, the word sheet behind a tap, the ways-out list at the foot of
   that door which lost its words row, and the ignore list, which is a
   Settings screen now.

   `--tag before` shoots the same three places on a build that predates the
   ticket: the ranked list at /transition/words, and the ways-out list with
   its words row still on it. vite's `preview({ root })` serves the cwd's
   build, so run it with that checkout as the cwd:
     node -e "process.chdir('/path/to/main'); process.argv.push('--','--tag','before','--out','/abs/dir'); import('/abs/tests/words-reading-gallery.mjs')"

   Run against a demo build:
     VITE_DEMO=1 npm run build
     node tests/words-reading-gallery.mjs --tag after --out /abs/dir */
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
const outDir = resolve(flag('out', resolve(here, '../.claude/words-shots')), tag);
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

const strip = async () => {
  await page.mouse.move(4, 4);
  return page.evaluate(() => {
    for (const toast of document.querySelectorAll('[data-toast]')) toast.remove();
    for (const bar of document.querySelectorAll('.demo-bar')) bar.remove();
    document.body.classList.remove('has-demo-bar');
    if (!document.getElementById('words-shot-css')) {
      const style = document.createElement('style');
      style.id = 'words-shot-css';
      style.textContent =
        '[data-app-scroll-region]{scrollbar-width:none}[data-app-scroll-region]::-webkit-scrollbar{display:none}';
      document.head.append(style);
    }
  });
};

/** One element's own box, scrolled into view, plus a little air. */
const cropOne = async (name, selector, note = '', pad = 10) => {
  await strip();
  if (!(await page.locator(selector).count())) {
    errors.push(`${name}: nothing matched ${selector}`);
    return;
  }
  await page.locator(selector).first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(700);
  const box = await page.evaluate(
    ([sel, air]) => {
      const frame = document.querySelector('[data-app-root]').getBoundingClientRect();
      const el = document.querySelector(sel).getBoundingClientRect();
      const top = Math.max(el.top - air, frame.top);
      return {
        x: frame.x,
        y: top,
        width: frame.width,
        height: Math.min(el.bottom - top + air, frame.bottom - top)
      };
    },
    [selector, pad]
  );
  await page.screenshot({ path: `${outDir}/${name}.png`, clip: box });
  shots.push({ name, note });
};

/** A band from the top of `from` to the bottom of `to`, both scrolled into
    view first. */
const cropBand = async (name, from, to, note = '', pad = 12) => {
  await strip();
  if (!(await page.locator(from).count()) || !(await page.locator(to).count())) {
    errors.push(`${name}: nothing matched ${from} / ${to}`);
    return;
  }
  await page.locator(to).last().scrollIntoViewIfNeeded();
  await page.waitForTimeout(700);
  const box = await page.evaluate(
    ([a, b, air]) => {
      const frame = document.querySelector('[data-app-root]').getBoundingClientRect();
      const heads = document.querySelectorAll(a);
      const head = heads[heads.length - 1].getBoundingClientRect();
      const all = document.querySelectorAll(b);
      const foot = all[all.length - 1].getBoundingClientRect();
      const top = Math.max(head.top - air, frame.top);
      return { x: frame.x, y: top, width: frame.width, height: Math.min(foot.bottom - top + air, frame.bottom - top) };
    },
    [from, to, pad]
  );
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

/** Pick one option out of the card's own era/mode picker by its label. */
const pick = async (label) => {
  await page.selectOption('#words-value-filter', { label });
  await page.waitForTimeout(800);
};

try {
  await seed();

  for (const theme of THEMES) {
    await dress(theme);

    if (tag === 'before') {
      await settle('/transition/words');
      await cropOne(
        `words-list-${theme}`,
        '[data-kit-surface]',
        'Before: the whole journal ranked by raw count. long, whole, day, call, name - four of the first five carry nothing.'
      );
      await settle('/stats');
      await cropBand(
        `ways-out-${theme}`,
        '[data-section-heading]',
        '[data-list-row]',
        'Before: the ways-out list at the foot of Look back, with the words row on it.'
      );
      continue;
    }

    await settle('/stats');
    await page.waitForSelector('[data-cloud-word]', { timeout: 20000 });
    await pick('First year on HRT');
    await cropOne(
      `words-era-a-${theme}`,
      '[data-chart-card="words"]',
      'After: one era, weighed against the journal. again, practice, ran, skipped, tired, work - the words of the stretch, at the size of their weight.'
    );
    await pick('Full time');
    await cropOne(
      `words-era-b-${theme}`,
      '[data-chart-card="words"]',
      'After: the other era in the same card. Nothing is placed beside anything - one stretch at a time, weighed against the journal and never against the era above.'
    );

    await page.locator('[data-segment="presentation"]').click();
    await page.waitForTimeout(800);
    await cropOne(
      `words-mode-${theme}`,
      '[data-chart-card="words"]',
      'After: the same card by mode. The femme entries read excuse, home, miss, said, smiled, someone, tram - the tram note - where the ranked list read long and whole.'
    );

    await page.locator('[data-cloud-word]').first().click();
    await page.waitForTimeout(700);
    await strip();
    await page.screenshot({ path: `${outDir}/word-sheet-${theme}.png` });
    shots.push({
      name: `word-sheet-${theme}`,
      note: 'After: the count and the one action a word has, behind a tap. The drawing carries no number, so nothing here invites reading down a list.'
    });

    await settle('/stats');
    await cropBand(
      `ways-out-${theme}`,
      '[data-section-heading]',
      '[data-list-row]',
      'After: the same ways-out list. The words row is gone - the reading draws on this screen, so there is nothing for a row to open.'
    );

    /* The ignore list wants a row in it, and the only way a word gets in is
       the way somebody would put one there. */
    await settle('/stats');
    await page.waitForSelector('[data-cloud-word]', { timeout: 20000 });
    await page.locator('[data-cloud-word]').first().click();
    await page.waitForTimeout(500);
    await page.locator('[data-ignore-word]').click();
    await page.waitForTimeout(800);

    await settle('/settings/words');
    await cropBand(
      `settings-words-${theme}`,
      '[data-screen-header]',
      '[data-list-card]',
      'After: the ignore list, in Settings as a reference area (ADR-0084). A word starts being skipped from the reading; this is where it can be let back in.',
      0
    );
  }

  await writeFile(`${outDir}/shots.json`, JSON.stringify({ tag, shots, errors }, null, 2));
  console.log(`${shots.length} shots in ${outDir}`);
  if (errors.length) console.log('errors:\n' + errors.join('\n'));
} finally {
  await browser.close();
  await app.close();
}
