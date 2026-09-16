/* Stills for Safe space's sign-off (phase 10 redesign ticket 47).

   Crops rather than screens, and only what the ticket changed: the opening
   view of /doubt, the run of ways down under it, and the top of each way
   down so that "nothing was cut" can be seen rather than asserted. The
   default palette (`trans`) crossed with the two themes and nothing else -
   the eight-palette cross product is palette-contrast.test.ts's job and not
   something to look through by eye.

   Run: node tests/safe-space-gallery.mjs [outDir]
   Serves the `build/` in the current working directory, so the before
   column comes from running this in a detached worktree of main. A route
   that does not exist on the build being served is skipped rather than
   photographed: a SvelteKit SPA answers an unknown route with the shell and
   a 200, so the shot would be of an error page. */
import { preview } from 'vite';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './browser-harness.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const outDir = resolve(process.argv[2] ?? resolve(root, '.claude/safe-space-shots'));

const VIEWPORT = { width: 390, height: 844 };
const THEMES = ['light', 'dark'];
/* The screens the ways down land on (safeSpaceWays.ts). Phase 11 ticket 15
   folded two of them into screens that already existed: the letters screen
   carries Safe space's letters and photos now, and the readings land on the
   Look back door, whose own stills are ticket 07's. */
const WAYS = ['/transition/letters', '/doubt/comfort', '/doubt/evidence'];

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

const app = await preview({ preview: { port: 0 } });
const base = `http://localhost:${app.httpServer.address().port}`;
const browser = await launchChromium();
const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2 });
const page = await context.newPage();
const shots = [];

const strip = () =>
  page.evaluate(() => {
    document.querySelector('.demo-bar')?.remove();
    document.body.classList.remove('has-demo-bar');
    for (const toast of document.querySelectorAll('[data-toast]')) toast.remove();
  });

const settle = async (path, { keepDemoBar = false } = {}) => {
  await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-app-root][data-boot="ready"]');
  if (await page.locator('[data-leave-setup]').count()) {
    await page.locator('[data-leave-setup]').click();
    await page.waitForSelector('[data-home-hello]');
    await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-app-root][data-boot="ready"]');
  }
  if (!keepDemoBar) await strip();
  await page.waitForTimeout(1600);
};

const dress = async (theme) => {
  await settle('/settings');
  await page.locator('[data-palette-pick="trans"]').click();
  await page.locator(`[data-segment="${theme}"]`).click();
  await page.waitForFunction((want) => document.documentElement.dataset.theme === want, theme);
};

/** One crop, named, with the note that says what it is for. `sel` is the
    element the shot is about; omitted, the shot is the phone's own frame,
    which is what an "opening view" means. */
async function shoot(name, note, sel, pad = 16) {
  const clip = await page.evaluate(
    ([sel, pad]) => {
      const frame = document.querySelector('[data-app-root]').getBoundingClientRect();
      if (!sel) return { x: frame.x, y: frame.y, width: frame.width, height: frame.height };
      const el = document.querySelector(sel);
      if (!el) return null;
      const b = el.getBoundingClientRect();
      const x = Math.max(frame.x, b.x - pad);
      const y = Math.max(frame.y, b.y - pad);
      return {
        x,
        y,
        width: Math.min(frame.right, b.right + pad) - x,
        height: Math.min(frame.bottom, b.bottom + pad) - y
      };
    },
    [sel ?? null, pad]
  );
  if (!clip || clip.height < 4) {
    console.warn(`${name}: nothing to shoot`);
    return;
  }
  await page.screenshot({ path: resolve(outDir, `${name}.png`), clip });
  shots.push({ name, note });
  console.log(`${name}: ${Math.round(clip.width)}x${Math.round(clip.height)}`);
}

/** A screen taller than the phone. `fullPage` catches the viewport and an
    element shot of the scroller is clipped to what is visible in it, so the
    viewport is grown to the content and shrunk back afterwards: the layout
    stays the 390px one and only the height is unreal. */
async function shootWhole(name, note) {
  const tall = await page.evaluate(() => {
    const scroller = document.querySelector('[data-app-scroll-region]');
    return Math.min(window.innerHeight + (scroller.scrollHeight - scroller.clientHeight) + 40, 8000);
  });
  await page.setViewportSize({ width: VIEWPORT.width, height: tall });
  await page.waitForTimeout(500);
  await page.locator('[data-app-root]').screenshot({ path: resolve(outDir, `${name}.png`) });
  shots.push({ name, note });
  console.log(`${name}: ${VIEWPORT.width}x${tall} (whole screen)`);
  await page.setViewportSize(VIEWPORT);
  await page.waitForTimeout(300);
}

/** A section that runs past the fold: the same grown viewport, then a crop
    from the top of one element to the bottom of another, since a section
    here is a heading and the run of cards under it rather than one box. */
async function shootSection(name, note, fromSel, toSel, pad = 16) {
  const tall = await page.evaluate(() => {
    const scroller = document.querySelector('[data-app-scroll-region]');
    return Math.min(window.innerHeight + (scroller.scrollHeight - scroller.clientHeight) + 40, 8000);
  });
  await page.setViewportSize({ width: VIEWPORT.width, height: tall });
  await page.waitForTimeout(500);
  const clip = await page.evaluate(
    ([fromSel, toSel, pad]) => {
      const frame = document.querySelector('[data-app-root]').getBoundingClientRect();
      const from = document.querySelector(fromSel);
      const tails = document.querySelectorAll(toSel);
      const to = tails[tails.length - 1] ?? from;
      if (!from) return null;
      const top = from.getBoundingClientRect().top - pad;
      const bottom = to.getBoundingClientRect().bottom + pad;
      return { x: frame.x, y: Math.max(frame.y, top), width: frame.width, height: bottom - top };
    },
    [fromSel, toSel, pad]
  );
  if (clip && clip.height >= 4) {
    await page.screenshot({ path: resolve(outDir, `${name}.png`), clip });
    shots.push({ name, note });
    console.log(`${name}: ${Math.round(clip.width)}x${Math.round(clip.height)}`);
  } else {
    console.warn(`${name}: nothing to shoot`);
  }
  await page.setViewportSize(VIEWPORT);
  await page.waitForTimeout(300);
}

try {
  await settle('/', { keepDemoBar: true });
  await page.locator('[data-fill-every-feature]').click();
  await page.waitForURL('**/more', { timeout: 60000 });

  for (const theme of THEMES) {
    await dress(theme);

    await settle('/doubt');
    await shoot(`opening-${theme}`, 'What /doubt opens on, at 390x844.');
    await shoot(`ways-${theme}`, 'The run of ways down, under the breath.', '[data-list-card]');

    for (const way of WAYS) {
      await settle(way);
      if (!(await page.locator('[data-screen-header]').count())) continue;
      const name = way.split('/').pop();
      await shoot(`${name}-${theme}`, `The top of ${way}, so that what moved can be seen to be intact.`);
    }

    /* The two things phase 11 ticket 15 changed, whole rather than cropped
       to the fold, because both are arguments about length: the good
       moments end at a control instead of at a twentieth card, and the
       letters screen's Open section holds the photographs the folded screen
       used to hold. */
    await settle('/doubt/evidence');
    await shootWhole(
      `evidence-whole-${theme}`,
      'The whole of the good moments: six cards, the save under them, then the way to the rest.'
    );

    await settle('/transition/letters');
    await shootSection(
      `letters-opened-${theme}`,
      'The letters screen\'s Open section: the unlocked letters and, beside them, the starred photographs.',
      '#opened',
      '[data-safe-space-photos], [data-letter-open]'
    );

    /* Only on a build that still has it: the screen this ticket folded
       away, so the before column can show what was on it. On a build that
       folded it the address redirects, and a redirect draws a header of its
       own - the letters screen's - so the address is what says whether the
       screen is there, not the header. */
    await settle('/doubt/moments');
    if (page.url().includes('/doubt/moments')) {
      await shootWhole(`moments-whole-${theme}`, 'The screen that was: Safe space\'s own letters and photos.');
    }
  }
} finally {
  await writeFile(resolve(outDir, 'manifest.json'), JSON.stringify({ shots }, null, 2));
  await browser.close();
  await app.close();
}

console.log(`\nshots in ${outDir}`);
