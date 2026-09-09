/* Renders for the shared fixes the cohesion sweep made (redesign ticket 20),
   for sign-off.

   Only the surfaces this ticket changed, cropped to the surface. A review
   page of whole screens across a half-done redesign is unreviewable
   (Alicja, ticket 07's sign-off), and this ticket changed twelve rules
   rather than a screen, so every scene here is one of those rules with
   enough of its neighbours to read it against - never a whole screen.

   Each scene names the rule it shows and the route it was found on by the
   sweep. Four of them are transient (a toast, two popups, a held control)
   and are put into their state before the shot, because those are exactly
   the surfaces a route walk cannot see and where the elevation survived
   longest.

   Run against a demo build, once per side. The before side has to be run
   with its own checkout as the *working directory*, not just as --root:
   vite's preview server resolves .svelte-kit/output relative to the cwd
   whatever root it is handed, so running it from here served this branch's
   build under the before tag and produced two identical columns.
     VITE_DEMO=1 npm run build
     node tests/cohesion-fix-gallery.mjs --tag after --out /abs/path
     cd /path/to/main && node /abs/path/to/tests/cohesion-fix-gallery.mjs \
       --tag before --root /path/to/main --out /abs/path
   An absolute --out outside either worktree is what survives them being
   removed after the merge. */
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
const outDir = resolve(flag('out', resolve(here, '../.claude/cohesion-fix-shots')), tag);
const THEMES = ['light', 'dark'];

await mkdir(outDir, { recursive: true });
const browser = await launchChromium();
const app = await preview({ root, preview: { port: 0 } });
const base = `http://localhost:${app.httpServer.address().port}`;
const shots = [];
const errors = [];

/* A fresh context per theme, not one page dressed twice. Several of these
   surfaces are raised by a once-only action - the toast is raised by
   dismissing Today's backup notice, and a dismissed notice stays dismissed
   - so the second theme had nothing to photograph. Each browser context
   seeds its own demo journal, so a new one puts the notice back. */
let page;
const openContext = async () => {
  if (page) await page.close();
  page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
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

/* `keepToasts` only for the toast's own scene. The app raises a storage
   toast at boot, and it sits over whatever is being photographed: it landed
   across the slider's held state in both columns of the first run, which is
   the one scene where something had to be read underneath it. */
const strip = (keepToasts = false) =>
  page.evaluate((keepToasts) => {
    for (const bar of document.querySelectorAll('.demo-bar')) bar.remove();
    if (!keepToasts) for (const toast of document.querySelectorAll('.toast, [data-toast]')) toast.remove();
    if (!document.getElementById('fix-shot-css')) {
      const style = document.createElement('style');
      style.id = 'fix-shot-css';
      style.textContent =
        '[data-app-scroll-region]{scrollbar-width:none}[data-app-scroll-region]::-webkit-scrollbar{display:none}';
      document.head.append(style);
    }
  }, keepToasts);

const dress = async (palette, theme) => {
  await settle('/settings');
  await page.locator(`[data-palette-pick="${palette}"]`).click();
  await page.locator(`[data-segment="${theme}"]`).click();
  await page.waitForFunction(
    ([p, t]) => document.documentElement.dataset.palette === p && document.documentElement.dataset.theme === t,
    [palette, theme]
  );
};

/* The crop: the box of the first element `sel` matches, with `pad` px of the
   page around it, clamped to the app frame. An elevation is drawn *outside*
   a box, so the pad is what the shot is actually about - too tight and the
   shadow being retired is cropped off with it. */
const crop = async (name, sel, note, pad = 22, keepToasts = false) => {
  await strip(keepToasts);
  /* Wait for the thing itself. /doubt's counterevidence entries arrive
     through a ReadGate, so a fixed pause photographed its skeleton and the
     scene reported that nothing matched. */
  await page.waitForSelector(sel, { timeout: 9000, state: 'attached' }).catch(() => {});
  await page.waitForTimeout(700);
  const box = await page.evaluate(
    ([sel, pad]) => {
      const frame = document.querySelector('[data-app-root]').getBoundingClientRect();
      const el = document.querySelector(sel);
      if (!el) return null;
      const b = el.getBoundingClientRect();
      const x = Math.max(frame.x, b.x - pad);
      const y = Math.max(frame.y, b.y - pad);
      return {
        x,
        y,
        width: Math.min(b.right + pad, frame.right) - x,
        height: Math.min(b.bottom + pad, frame.bottom) - y
      };
    },
    [sel, pad]
  );
  if (!box || box.width < 8 || box.height < 8) {
    errors.push(`${name}: nothing matched ${sel}`);
    return;
  }
  await page.screenshot({ path: `${outDir}/${name}.png`, clip: box });
  shots.push({ name, sel, note });
};

/* Seed the demo persona. Without it /doubt has no counterevidence entry
   and the photo screens have no photo, so three scenes matched nothing at
   all on the first run; the seed ends by navigating to /more. */
const seed = async () => {
  await settle('/');
  await page.locator('[data-fill-every-feature]').click();
  await page.waitForURL('**/more', { timeout: 180000 });
  await page.waitForTimeout(2000);
};

for (const theme of THEMES) {
  await openContext();
  await seed();
  await dress('trans', theme);

  /* 1. `.card`, the widest reach: 13 screens. */
  await settle('/settings/access-mode');
  await crop(`card-${theme}`, '.card', '.card - 13 screens - /settings/access-mode');

  /* 2. `.entry-card`. The sweep found it on /doubt and on a tryout's own
        screen; the tryout is the one of the two that a seeded demo journal
        always has, since /doubt's copy arrives through a ReadGate over a
        counterevidence query the persona does not always fill. */
  await settle('/transition/tryouts');
  const tryout = page.locator('a[href^="/transition/tryouts/"]').first();
  if (await tryout.count()) {
    await tryout.click();
    await crop(`entry-card-${theme}`, '.entry-card', '.entry-card - a tryout\'s screen');
  }

  /* 3. The slider's thumb at rest, then held: the hold ring has to survive
        the elevation being taken from under it. */
  await settle('/settings/dimension');
  await crop(`slider-thumb-${theme}`, '.slider-thumb', '.slider-thumb at rest - /settings/dimension');
  const lane = page.locator('.slider').first();
  if (await lane.count()) {
    const box = await lane.boundingBox();
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(260);
    await crop(`slider-held-${theme}`, '.slider', '.slider held - the 9px accent ring stays, the shadow under it goes', 16);
    await page.mouse.up();
  }

  /* 4. The save bar's button, on four screens' primary action. Named
        `.app-savebar` since carpet 26 moved the foot out of the column and
        into the frame; the shot is the same button on the same screen. */
  await settle('/settings/dimension');
  await crop(`savebar-${theme}`, '[data-app-savebar]', '.app-savebar .btn - 4 screens - /settings/dimension', 18);

  /* 5. Wrapped's card and its stat tiles. */
  await settle('/wrapped/year/share');
  await crop(`wrapped-card-${theme}`, '.wrapped-card', '.wrapped-card and .wrapped-stat - /wrapped/year/share', 18);

  /* 6. The toast: ink, and nothing under it. Raised by dismissing the
        notice on Today, which is what puts one on screen without a save. */
  await settle('/');
  const dismiss = page.locator('.kit-notice-x').first();
  if (await dismiss.count()) {
    await dismiss.click();
    await page.waitForSelector('.toast', { timeout: 6000 }).catch(() => {});
    await crop(`toast-${theme}`, '.toast', '.toast - the ink block, --shadow-3 retired', 26, true);
  }

  /* 7. flatpickr's popup, which is every date field in the app. The input
        is readonly and set through the picker instance, so the popup is
        opened by clicking rather than by typing (see DatePicker.svelte).
        /body/measurements is a screen that has one. */
  await settle('/body/measurements');
  /* The date field lives in an editor the screen opens, not on the screen
     itself, so the add control comes first. Guarding on the field's presence
     without opening the editor skipped this scene silently on the first two
     runs - a scene that matches nothing has to say so. */
  const add = page.locator('[data-add]').first();
  if (await add.count()) await add.click();
  const dateField = page.locator('input.input').first();
  await dateField.waitFor({ timeout: 6000 }).catch(() => {});
  if (await dateField.count()) {
    await dateField.click();
    await page.waitForSelector('.flatpickr-calendar.open', { timeout: 6000 }).catch(() => {});
    await crop(`flatpickr-${theme}`, '.flatpickr-calendar.open', "flatpickr's popup - a 1px --outline, no shadow", 12);
    await page.keyboard.press('Escape');
  } else {
    errors.push(`flatpickr-${theme}: no date field on /body/measurements`);
  }

  /* 8. The two 22px discs that knock a photo's own control out of the photo
        behind it: one on the photo grid, one on the starred list. They are
        the same drawing in two stylesheets, which is why both are here. */
  await settle('/media/photos');
  await crop(`photo-disc-${theme}`, '.photo-edit-day', 'the 22px disc behind a photo control - /media/photos', 14);
  /* The same drawing lives a second time as .starred-photo-unstar::before
     in screens.css and took the same change; it is not shot here because
     it needs a starred photo, which the demo persona does not seed. */
}

await writeFile(`${outDir}/manifest.json`, JSON.stringify({ tag, shots, errors }, null, 2));
await page.close();
await browser.close();
await app.close();
console.log(`${shots.length} shot(s) in ${outDir}`);
if (errors.length) {
  console.error(`${errors.length} problem(s):`);
  for (const e of errors) console.error(`  ${e}`);
}
