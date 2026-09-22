/* Sign-off render for phase 12 final-audit ticket 13: the photo grid batches
   its DOM instead of rendering every photo. Only the changed surface - the
   grid itself, right where the batch boundary and the "Show more" control
   sit - not the chips, the rail, the wipe or anything else ticket 14 already
   covers and this ticket doesn't touch. Default palette (trans), light and
   dark, before and after.

   The demo persona alone rarely clears one batch (BATCH=30, batchedList.ts),
   so both runs top it up with a hundred extra hair-progress photos after
   seeding - enough that `main`'s grid renders every one of them in a single
   pass while this ticket's never gets past a couple of batches, wherever the
   tail shot below happens to land.

   Run against the dev server (no build needed - vite.config.ts turns
   `__DEMO__` on for every `serve` command, not only a `VITE_DEMO=1` build):
     node tests/photo-grid-batching-gallery.mjs --tag after --out /abs/dir

   The dev server rather than `preview` for one more reason beyond skipping
   the build: seeding the extra photos below dynamic-imports
   `/src/lib/data/live/journal.svelte.ts` directly (photo-browse-compare.mjs's
   own trick), which only a dev server serves - `preview` only has the built
   bundle's hashed chunks.

   `--tag before` wants another checkout's dev server, and vite's `root`
   is fixed at construction, so run it with that checkout as the cwd
   (photo-library-gallery.mjs's own note, same trick, for `preview`):
     node -e "process.chdir('/path/to/main-checkout'); process.argv.push('--','--tag','before','--out','/abs/dir'); import('/abs/tests/photo-grid-batching-gallery.mjs')"
*/
import { createServer } from 'vite';
import { realpathSync } from 'node:fs';
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
const outDir = resolve(flag('out', resolve(here, '../.claude/photo-grid-batching-shots')), tag);
const THEMES = ['light', 'dark'];
/* Past two batches (BATCH=30, batchedList.ts), so even after the
   IntersectionObserver's own 50%-rootMargin prefetch grows the grid once
   while scrolling to the tail shot below, it is still nowhere near every
   photo - the thing the tail shot has to show plainly. */
const EXTRA_PHOTOS = 100;

await mkdir(outDir, { recursive: true });
const browser = await launchChromium();
const app = await createServer({ server: { port: 0, fs: { allow: [process.cwd(), realpathSync('node_modules')] } } });
await app.listen();
const base = app.resolvedUrls.local[0].replace(/\/$/, '');
const shots = [];
const errors = [];

const page = await browser.newPage({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 2 });
page.on('pageerror', (err) => {
  const message = String(err);
  // Deleting IntersectionObserver below is a manipulation this script
  // introduces, not a fault of anything this ticket touched - and it
  // surfaces a real but unrelated pre-existing gap while "fill every
  // feature" seeds through other screens in passing: hair-progress's own
  // scroll-jump observer (src/routes/body/hair-progress/+page.svelte:261)
  // has no `typeof IntersectionObserver === 'undefined'` guard, unlike
  // every other observer in this codebase. Worth its own ticket; not this
  // script's job to fail on, since it never touches the photo grid.
  if (message.includes('IntersectionObserver is not defined')) return;
  errors.push(message);
});

/* No IntersectionObserver, the app's own documented fallback (PhotoThumb.svelte,
   BatchedList.svelte's own sentinel effect: "No observer means no way to
   tell: draw everything" / the effect just returns). Real scrolling would
   otherwise grow the grid mid-scroll every time the sentinel crosses its
   own 50%-rootMargin prefetch band, a moving target no fixed scroll-and-crop
   can land on deterministically. This way the tail shot always lands on the
   batch boundary exactly as it renders at rest, reached the same way a
   keyboard or a screen reader would - the "Show more" control. */
await page.addInitScript(() => {
  delete window.IntersectionObserver;
});

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
    if (!document.getElementById('batching-shot-css')) {
      const style = document.createElement('style');
      style.id = 'batching-shot-css';
      style.textContent =
        '[data-app-scroll-region]{scrollbar-width:none}[data-app-scroll-region]::-webkit-scrollbar{display:none}';
      document.head.append(style);
    }
  });

/** A band of `height` px from `from`'s own top, scrolled into view first
    (photo-library-gallery.mjs's own crop). */
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
  /* A cold dev server re-optimizes its dependency cache on first touching
     an unbundled one (pdfjs-dist here) and reloads the page mid-navigation
     to pick it up - which lands mid-fill on a fresh server and drops the
     click's async work along with the page it was running on. One
     throwaway visit lets that happen before anything is timed. */
  await settle('/');
  await page.waitForTimeout(1000);

  await settle('/');
  await page.locator('[data-fill-every-feature]').click();
  await page.waitForURL('**/more', { timeout: 180000 });
  await page.waitForTimeout(2000);

  /* A hundred more, past what any demo persona alone clears, so the grid
     always has several batches' worth to show regardless of how the fixture
     changes under later tickets. */
  const total = await page.evaluate(async (extra) => {
    const { journal: j } = await import('/src/lib/data/live/journal.svelte.ts');
    for (let i = 0; i < extra; i++) {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 16;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = `hsl(${(i * 29) % 360} 55% 55%)`;
      ctx.fillRect(0, 0, 16, 16);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg'));
      const full = new Uint8Array(await blob.arrayBuffer());
      await j.hairProgress.addPhoto(19000 + i, { full, thumb: full });
    }
    return (await j.photoLibrary.inJournal()).length;
  }, EXTRA_PHOTOS);
  return total;
};

try {
  const total = await seed();

  for (const theme of THEMES) {
    await dress(theme);

    await settle('/media/photos');
    await page.waitForSelector('[data-photo-cell] img, [data-photo-video]');
    await page.waitForTimeout(800);

    /* The natural landing view: what arriving at the screen looks like,
       which is the thing this ticket must not change - the grid's first
       screenful is the same tiles in the same order either way, only the
       DOM behind it differs. */
    await cropFixed(
      `head-${theme}`,
      '[data-photo-count]',
      460,
      'the grid as it lands - unchanged from main to look at (this ticket only bounds the DOM behind it)'
    );

    /* Where the two builds actually diverge: scrolled to the end of what
       has rendered. `main` just keeps drawing tiles; this ticket ends in a
       "Show more" control - and scrolling this far can itself grow the
       batch once more first (the sentinel's own 50%-rootMargin prefetch,
       BatchedList.svelte's pattern), which is fine: the point is what is
       and isn't still in the DOM, not landing on an exact count. */
    const tailAnchor = tag === 'after' ? '[data-photo-grid-more]' : '.photo-grid > .photo-cell-wrap:last-child';
    await cropFixed(`tail-${theme}`, tailAnchor, 400, '');
    const renderedAtTail = await page.locator('[data-photo-key]').count();
    if (shots.at(-1)?.name === `tail-${theme}`) {
      shots[shots.length - 1].note =
        tag === 'after'
          ? `${renderedAtTail} of ${total} photos rendered at the "Show more" control - still far short of every photo`
          : `${renderedAtTail} of ${total} photos rendered at the last tile - main draws every one, no control`;
    }
  }
} catch (error) {
  errors.push(`the run itself: ${String(error)}`);
} finally {
  await writeFile(`${outDir}/shots.json`, JSON.stringify({ tag, shots, errors }, null, 2) + '\n');
  await page.close();
  await browser.close();
  await app.close();
}

console.log(JSON.stringify({ tag, outDir, shots, errors }, null, 2));
if (errors.length) process.exitCode = 1;
