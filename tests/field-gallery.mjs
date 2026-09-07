/* Renders for the field and the sun (redesign ticket 23), for sign-off.

   Only what the ticket changed: the top of the screen. Every shot is a crop
   from the window's top edge to the bottom of the header (and the first
   block under it, so the field's foot can be read against the page), never
   a whole screen - a review page of whole screens across a half-done
   redesign is unreviewable (Alicja, ticket 07's sign-off).

   Scenes: Today's header on all eight palettes in both themes; a deep
   screen's header (Stats, with a subtitle) on four; a deep screen the
   ticket never opened (tags, the entry editor) so the field is seen to
   arrive through ScreenHeader alone; onboarding's flag step, where the sun
   sits on the page rather than a field; the disguised header; and the
   three widths the ticket holds - 320, 195 (what 200% zoom leaves of a
   390px phone) and the 1280px shell with the rail.

   Run against a demo build. `--root <dir>` previews another checkout's
   build (main's tip, for the before column); `--out <dir>` names where the
   shots land, and an absolute path outside the worktree is what survives
   the worktree being removed after the merge:
     VITE_DEMO=1 npm run build
     node tests/field-gallery.mjs --tag after --out /abs/path/field-shots
     node tests/field-gallery.mjs --tag before --root /path/to/main --out ... */
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
const outDir = resolve(flag('out', resolve(here, '../.claude/field-shots')), tag);
const PALETTES = flag('palettes', 'trans,nonbinary,genderfluid,bisexual,lesbian,pansexual,rainbow,agender').split(',');
const THEMES = ['light', 'dark'];
/* The four that stress the field hardest: a pastel with black ink, the one
   band that cannot carry small text, the flag whose field is a named band,
   and the flag with three shades. */
const DEEP = ['trans', 'nonbinary', 'rainbow', 'agender'];

await mkdir(outDir, { recursive: true });
const browser = await launchChromium();
const app = await preview({ root, preview: { port: 0 } });
const base = `http://localhost:${app.httpServer.address().port}`;
const shots = [];
const errors = [];

let page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
/* The one thing every render of the built app has to be checked for before
   anything is read off it: an error at boot. activeFlag runs inside the
   shell's palette effect, and a read of its own state there loops the app
   until Svelte gives up, with nothing on screen to say so. */
const watch = (p) => p.on('pageerror', (err) => errors.push(String(err)));
watch(page);

const reopen = async (width, scale) => {
  await page.close();
  page = await browser.newPage({ viewport: { width, height: width > 800 ? 900 : 844 }, deviceScaleFactor: scale });
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

/* Just before a shot, never on arrival: the demo bar is what seeds the
   journal and opens onboarding, so it has to be there until it has been
   used. */
const strip = () =>
  page.evaluate(() => {
    for (const toast of document.querySelectorAll('[data-toast]')) toast.remove();
    for (const bar of document.querySelectorAll('.demo-bar')) bar.remove();
    /* Headless Chromium draws a classic scrollbar gutter beside the scroll
       region; a phone draws an overlay one over the content. Hidden so the
       field's right edge is the screen's, as it is on device. */
    if (!document.getElementById('field-shot-css')) {
      const style = document.createElement('style');
      style.id = 'field-shot-css';
      style.textContent =
        '[data-app-scroll-region]{scrollbar-width:none}[data-app-scroll-region]::-webkit-scrollbar{display:none}';
      document.head.append(style);
    }
  });

/* From the app frame's top edge to `extra` px under the bottom of the
   element `until` names. The sun's entrance is 700ms plus 0.11s per ring,
   so the wait lets the last ring land before the shot. */
const crop = async (name, until, extra = 24, note = '') => {
  await strip();
  await page.waitForTimeout(1600);
  const box = await page.evaluate(
    ([sel, extra]) => {
      const root = document.querySelector('[data-app-root]').getBoundingClientRect();
      const el = document.querySelector(sel);
      const bottom = el ? el.getBoundingClientRect().bottom : root.top + 320;
      return { x: root.x, y: root.y, width: root.width, height: Math.min(bottom - root.y + extra, root.height) };
    },
    [until, extra]
  );
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

/* Seed the demo persona, so the count line and the tiles have something to
   show; the seed ends by navigating to /more. */
await settle('/');
await page.locator('[data-fill-every-feature]').click();
await page.waitForURL('**/more', { timeout: 180000 });
await page.waitForTimeout(2000);

/* 1. Today and Stats, per palette and theme. */
for (const palette of PALETTES) {
  for (const theme of THEMES) {
    await dress(palette, theme);
    await settle('/');
    await crop(`home-${palette}-${theme}`, '[data-home-header]', 28);
    if (DEEP.includes(palette)) {
      await settle('/stats');
      await crop(`stats-${palette}-${theme}`, '[data-screen-header]', 72);
    }
  }
}

/* 2. Deep screens the ticket never opened: the field arrives through
   ScreenHeader alone. Tags is a settings leaf with a back control; the
   editor is a screen whose header sits inside a differently-shaped wrapper. */
for (const [palette, theme] of [['trans', 'light'], ['nonbinary', 'dark']]) {
  await dress(palette, theme);
  await settle('/settings/tags');
  await crop(`tags-${palette}-${theme}`, '[data-screen-header]', 72);
  await settle('/');
  await page.locator('[data-mood="4"]').click();
  await page.waitForSelector('#ed-note');
  await crop(`editor-${palette}-${theme}`, '[data-screen-header]', 72);
}

/* 3. The disguised header: a grey field, no sun, the assumed name. */
await dress('trans', 'light');
await settle('/settings');
await page.getByRole('button', { name: /Disguise/i }).click();
await page.getByRole('switch', { name: 'Disguise app' }).click();
await page.waitForFunction(() => document.title === 'Notes', null, { timeout: 8000 });
await settle('/');
await crop('disguise-home-trans-light', '[data-home-header]', 28);
await settle('/stats');
await crop('disguise-stats-trans-light', '[data-screen-header]', 72);
await settle('/settings');
await page.getByRole('button', { name: /Disguise/i }).click();
await page.getByRole('switch', { name: 'Disguise app' }).click();
await page.waitForFunction(() => document.title !== 'Notes', null, { timeout: 8000 });

/* 4. Onboarding's flag step: the sun on the page, gaps in the page's colour. */
for (const [palette, theme] of [['trans', 'light'], ['nonbinary', 'dark'], ['agender', 'dark'], ['rainbow', 'light']]) {
  await dress(palette, theme);
  await settle('/');
  await page.selectOption('#demo-jump', 'first-run');
  await page.waitForSelector('[data-next]');
  await page.locator('[data-next]').click();
  await page.locator('#ob-name').fill('Ola');
  await page.locator('[data-next]').click();
  await page.waitForSelector(`[data-palette-pick="${palette}"]`);
  await page.locator(`[data-palette-pick="${palette}"]`).click();
  await page.waitForFunction((p) => document.documentElement.dataset.palette === p, palette);
  await crop(`flag-step-${palette}-${theme}`, '[data-palette-pick]', 96);
  await page.locator('[data-leave-setup]').click();
  await page.waitForSelector('[data-home-hello]');
}

/* 5. The three widths. 195px is rendered at 4x so its pixels come out the
   size of the 390 shots'. */
for (const [width, scale, pairs] of [
  [320, 2, [['trans', 'light'], ['nonbinary', 'dark']]],
  [195, 4, [['trans', 'dark'], ['pansexual', 'light']]],
  [1280, 1, [['trans', 'light'], ['nonbinary', 'dark']]]
]) {
  await reopen(width, scale);
  for (const [palette, theme] of pairs) {
    await dress(palette, theme);
    await settle('/');
    await crop(`home-${width}-${palette}-${theme}`, '[data-home-header]', 28);
    if (width === 1280) {
      await settle('/stats');
      await crop(`stats-${width}-${palette}-${theme}`, '[data-screen-header]', 72);
    }
  }
}

await writeFile(`${outDir}/manifest.json`, JSON.stringify({ tag, shots, errors }, null, 2));
await page.close();
await browser.close();
await app.close();
console.log(`${shots.length} shot(s) in ${outDir}`);
if (errors.length) {
  console.error(`${errors.length} page error(s):`);
  for (const e of errors) console.error(`  ${e}`);
  process.exitCode = 1;
}
