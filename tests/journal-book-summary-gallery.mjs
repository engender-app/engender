/* Sign-off render for phase 12 final-audit ticket 20: the journal book shows
   a summary, not the whole book. Only the changed surface - the "What goes
   in" block, the counts line this ticket puts under it and the fold that now
   holds the pages - not the pages themselves, which are unchanged and which
   tests/journal-book-print-diff.mjs is what actually proves.

   Default palette (trans), light and dark, before and after.

   Run against a built tree in the current working directory:
     node tests/journal-book-summary-gallery.mjs --tag after --out /abs/dir
   `--tag before` wants the other checkout's build, and `vite preview` serves
   the cwd rather than any root it is handed, so run it with that checkout as
   the cwd (photo-grid-batching-gallery.mjs's own note):
     node -e "process.chdir('/path/to/before'); process.argv.push('--','--tag','before','--out','/abs/dir'); import('/abs/tests/journal-book-summary-gallery.mjs')"
*/
import { preview } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fillDate, launchChromium } from './browser-harness.mjs';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? args[at + 1] : fallback;
};
const tag = flag('tag', 'after');
const outDir = resolve(flag('out', '/tmp/journal-book-20-shots'));
const THEMES = ['light', 'dark'];

await mkdir(outDir, { recursive: true });
const app = await preview({ preview: { port: 0 } });
const base = `http://localhost:${app.httpServer.address().port}`;
const browser = await launchChromium();
const context = await browser.newContext({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 2 });
const page = await context.newPage();
const shots = [];
const errors = [];

const strip = () =>
  page.evaluate(() => {
    for (const toast of document.querySelectorAll('[data-toast]')) toast.remove();
    for (const bar of document.querySelectorAll('.demo-bar')) bar.remove();
    document.body.classList.remove('has-demo-bar');
    if (!document.getElementById('book-shot-css')) {
      const style = document.createElement('style');
      style.id = 'book-shot-css';
      style.textContent =
        '[data-app-scroll-region]{scrollbar-width:none}[data-app-scroll-region]::-webkit-scrollbar{display:none}';
      document.head.append(style);
    }
  });

const settle = async (path, { keepDemoBar = false } = {}) => {
  await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-app-root][data-boot="ready"]', { timeout: 30000 });
  if (await page.locator('[data-leave-setup]').count()) {
    await page.locator('[data-leave-setup]').click();
    await page.waitForSelector('[data-home-hello]');
    await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-app-root][data-boot="ready"]');
  }
  if (!keepDemoBar) await strip();
};

/** A band of `height` px from `from`'s own top, scrolled into view first
    (photo-grid-batching-gallery.mjs's own crop). */
const cropFixed = async (name, from, height, note = '') => {
  await page.mouse.move(4, 4);
  await strip();
  if (!(await page.locator(from).count())) {
    errors.push(`${name}: nothing matched ${from}`);
    return;
  }
  await page.locator(from).first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(600);
  const box = await page.evaluate(
    ([a, tall]) => {
      const frame = document.querySelector('[data-app-root]').getBoundingClientRect();
      const head = document.querySelector(a)?.getBoundingClientRect();
      if (!head) return null;
      const top = Math.max(head.top - 12, frame.top);
      const bar = document.querySelector('[data-app-nav]')?.getBoundingClientRect();
      const floor = bar && bar.top > head.top ? bar.top - 8 : frame.bottom;
      return { x: frame.x, y: top, width: frame.width, height: Math.min(tall, floor - top) };
    },
    [from, height]
  );
  if (!box) {
    errors.push(`${name}: nothing matched ${from}`);
    return;
  }
  await page.screenshot({ path: `${outDir}/${name}-${tag}.png`, clip: box });
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

/** Moves the start of the range `days` back from the end the screen opened
    on, typed into the picker's foot (browser-harness.mjs's fillDate). */
const setStartDaysBack = async (days) => {
  const end = await page.inputValue('#journal-book-end');
  const start = new Date(new Date(`${end}T12:00:00`).getTime() - days * 86_400_000);
  await fillDate(page, '#journal-book-start', start.toLocaleDateString('sv-SE'));
  await page.waitForTimeout(4000);
};

try {
  await settle('/', { keepDemoBar: true });
  await page.locator('[data-fill-every-feature]').click();
  await page.waitForURL('**/more', { timeout: 180000 });

  for (const theme of THEMES) {
    await dress(theme);
    await settle('/settings/journal-book');
    /* Long enough for the book's read to have answered, the chunked entry
       list to have finished growing and the photos to have been drawn -
       before that, `main`'s screen is still assembling under the switches. */
    await page.waitForTimeout(4000);

    /* From the last switch down, which is where the two builds part: one
       answers the seven ticks with a line, the other starts the book. */
    await cropFixed(
      `counts-${theme}`,
      '[data-inclusion="sideEffects"]',
      440,
      tag === 'after'
        ? 'The last switch, the counts the seven ticks come to, and the fold the pages sit behind.'
        : 'The last switch, and the book itself starting immediately under it.'
    );

    if (await page.locator('[data-book-preview-toggle]').count()) {
      await page.locator('[data-book-preview-toggle]').click();
      await page.waitForTimeout(1200);
      await cropFixed(
        `pages-${theme}`,
        '[data-book-preview]',
        620,
        'The fold opened: the same pages, in the same order, that printed before this ticket.'
      );
      await page.locator('[data-book-preview-toggle]').click();
      await page.waitForTimeout(1200);

      /* Three years, where the range holds milestones as well: the line
         names each part it actually carries and leaves out the ones it does
         not, and the screen is the same length it was at one year. */
      await setStartDaysBack(365 * 3);
      await cropFixed(
        `longer-${theme}`,
        '[data-inclusion="sideEffects"]',
        440,
        'The same screen over three years instead of one.'
      );
    }
  }
} catch (error) {
  errors.push(`the run itself: ${String(error)}`);
} finally {
  await writeFile(`${outDir}/shots-${tag}.json`, JSON.stringify({ tag, shots, errors }, null, 2) + '\n');
  await page.close();
  await browser.close();
  await app.close();
}

console.log(JSON.stringify({ tag, outDir, shots, errors }, null, 2));
if (errors.length) process.exitCode = 1;
