/* Renders for the permissions step and its screen (phase 10 redesign ticket
   31).

   Two sources, because the ticket has two kinds of thing to look at.

   The row states come from tests/browser-tier/permissions.html, which mounts
   the shipped `PermissionRow` against the app's real tokens and fonts and
   hands it every state `grantRows` can produce. A screenshot of the built
   web app cannot show four of those: a desktop browser has no notification
   permission and no exact alarms, so those two rows are permanently "Android
   only" there.

   The step and the screen come from the built demo app, driven the way
   setup-shape-gallery.mjs drives it - through the demo bar's first-run jump
   for setup, and by navigating for Settings.

   Run: VITE_DEMO=1 npm run build   first, then
        node tests/permissions-gallery.mjs
   Shots land in .claude/permission-shots/, gitignored and durable. */
import { createServer, preview } from 'vite';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './browser-harness.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, '../.claude/permission-shots');

/* Three palettes rather than eight: the row's one coloured element is the
   grant button, drawn in the area's own stripe, and these three are the
   spread that has caught colour bugs before - a light band, a saturated one
   and the one whose fill is nearly the surface. */
const PALETTES = ['trans', 'nonbinary', 'agender'];
const THEMES = ['light', 'dark'];
const PHONE = { width: 390, height: 844 };

await mkdir(outDir, { recursive: true });
const browser = await launchChromium();
const shots = [];

/* ---------- the row states, from the browser-tier fixture ---------- */
const fixtureServer = await createServer({
  configFile: `${here}/browser-tier/browser-tier.vite.config.ts`,
  server: { port: 0 }
});
await fixtureServer.listen();
const fixturePort = fixtureServer.config.server.port;

const rows = await browser.newPage({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 2 });
await rows.goto(`http://localhost:${fixturePort}/permissions.html`, { waitUntil: 'networkidle' });
await rows.waitForSelector('body[data-permissions-ready]', { state: 'attached' });

for (const palette of PALETTES) {
  for (const theme of THEMES) {
    await rows.selectOption('select[aria-label="Palette"]', palette);
    await rows.selectOption('select[aria-label="Theme"]', theme);
    await rows.waitForTimeout(400);
    for (const group of ['android-fresh', 'android-granted', 'android-refused', 'web', 'web-refused']) {
      const name = `rows-${group}-${palette}-${theme}`;
      await rows.locator(`[data-case="${group}"]`).screenshot({ path: `${outDir}/${name}.png` });
      shots.push(name);
    }
  }
}
await rows.close();
await fixtureServer.close();

/* ---------- the step and the screen, in the built app ---------- */
const app = await preview({ preview: { port: 0 } });
const base = `http://localhost:${app.httpServer.address().port}`;
const page = await browser.newPage({ viewport: PHONE, deviceScaleFactor: 2 });

const strip = () =>
  page.evaluate(() => {
    for (const toast of document.querySelectorAll('[data-toast]')) toast.remove();
    for (const bar of document.querySelectorAll('.demo-bar')) bar.remove();
    document.body.classList.remove('has-demo-bar');
    if (!document.getElementById('perm-shot-css')) {
      const style = document.createElement('style');
      style.id = 'perm-shot-css';
      style.textContent =
        '[data-app-scroll-region]{scrollbar-width:none}[data-app-scroll-region]::-webkit-scrollbar{display:none}';
      document.head.append(style);
    }
  });

const settle = async (path) => {
  await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-app-root][data-boot="ready"]');
  if (await page.locator('[data-leave-setup]').count()) {
    await page.locator('[data-leave-setup]').click();
    await page.waitForSelector('[data-home-hello]');
    await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-app-root][data-boot="ready"]');
  }
};

/* Set on every visit rather than once: a goto resets a manually stamped
   data-theme, so palette and theme are re-worn before each shot. */
const wear = async (palette, theme) => {
  await settle('/settings');
  await page.locator(`[data-palette-pick="${palette}"]`).click();
  await page.locator(`[data-segment="${theme}"]`).click();
  await page.waitForFunction(
    ([p, t]) =>
      document.documentElement.dataset.palette === p && document.documentElement.dataset.theme === t,
    [palette, theme]
  );
};

/** First run, walked forward to the permissions step, the name typed on the
    way so the finish has one. */
const ORDER = ['welcome', 'name', 'flag', 'scales', 'areas', 'lock', 'permissions', 'done'];
const stepTo = async (target) => {
  await settle('/');
  await page.selectOption('#demo-jump', 'first-run');
  await page.waitForSelector('[data-next]');
  for (const step of ORDER) {
    await page.waitForTimeout(400);
    if (step === 'name') await page.locator('#ob-name').fill('Ola');
    if (step === target) break;
    await page.locator('[data-next]').click();
  }
  await page.waitForTimeout(500);
};

const shoot = async (name) => {
  await strip();
  await page.waitForTimeout(400);
  await page.locator('[data-app-root]').screenshot({ path: `${outDir}/${name}.png` });
  shots.push(name);
};

for (const palette of PALETTES) {
  for (const theme of THEMES) {
    await wear(palette, theme);
    await stepTo('permissions');
    await shoot(`step-${palette}-${theme}`);

    await wear(palette, theme);
    await settle('/settings/permissions');
    await page.waitForSelector('[data-permission-list]');
    await shoot(`screen-${palette}-${theme}`);
  }
}

/* The settings row that leads there, cropped to the group it joined. */
await wear('trans', 'light');
await settle('/settings');
await page.locator('[data-list-row="permissions"]').scrollIntoViewIfNeeded();
await strip();
await page.waitForTimeout(300);
await page.locator('[data-list-row="security"]').evaluate((el) => {
  el.closest('[data-list-card]').setAttribute('data-shot-crop', '');
});
await page.locator('[data-shot-crop]').screenshot({ path: `${outDir}/settings-row.png` });
shots.push('settings-row');

await page.close();
await app.close();
await browser.close();

console.log(`${shots.length} shots in ${outDir}`);
