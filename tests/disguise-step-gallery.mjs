/* Renders for setup's disguise step (phase 10 redesign ticket 32).

   Only what this ticket changed, per the sign-off note on ticket 07: the
   step itself, which did not exist before, and the Settings sheet the
   preview block was lifted out of, which has to look exactly as it did.
   Nothing else in setup and nothing else in the app.

   The Android shots spoof `window.Capacitor` before the app boots, which
   is the whole of what `isAndroid()` reads (platform.ts). That is honest
   for a copy render - the same component, its other branch - and it is the
   only way to see the Android wording in a browser. It is not a device
   render and nothing about the launcher is real in it; the restart itself
   is proven on the emulator, not here.

   Run: VITE_DEMO=1 npm run build   first, then
        node tests/disguise-step-gallery.mjs
   Shots land in .claude/disguise-step-shots/, gitignored and durable, with
   a scroll.json recording the overflow per shot - rule 14 says no step
   scrolls, and this is the step's own measurement of it. */
import { preview } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './browser-harness.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, '../.claude/disguise-step-shots');

/* 390x844 is the phone the renders are read on; 320x568 is the narrow
   floor; 390x360 stands in for a raised keyboard, which is rule 14's short
   form even though this step has nothing to type. */
const SIZES = {
  phone: { width: 390, height: 844 },
  narrow: { width: 320, height: 568 },
  short: { width: 390, height: 360 }
};

await mkdir(outDir, { recursive: true });
const browser = await launchChromium();
const app = await preview({ preview: { port: 0 } });
const base = `http://localhost:${app.httpServer.address().port}`;
const scroll = {};
const shots = [];

/** A fresh context per platform: the Capacitor spoof has to be in place
    before the app's first script runs, and a context cannot un-spoof. */
async function open(android) {
  const context = await browser.newContext({ viewport: SIZES.phone, deviceScaleFactor: 2 });
  if (android) {
    await context.addInitScript(() => {
      // Only what platform.ts asks for. Nothing here pretends a plugin
      // exists; the Android plugin registry answers a missing one on its
      // own, and no plugin is called by the step being shot.
      window.Capacitor = { getPlatform: () => 'android' };
    });
  }
  return context.newPage();
}

const strip = (page) =>
  page.evaluate(() => {
    for (const toast of document.querySelectorAll('[data-toast]')) toast.remove();
    for (const bar of document.querySelectorAll('.demo-bar')) bar.remove();
    document.body.classList.remove('has-demo-bar');
    if (!document.getElementById('shot-css')) {
      const style = document.createElement('style');
      style.id = 'shot-css';
      style.textContent =
        '[data-app-scroll-region]{scrollbar-width:none}[data-app-scroll-region]::-webkit-scrollbar{display:none}';
      document.head.append(style);
    }
  });

const shoot = async (page, name, selector = '[data-app-root]') => {
  await strip(page);
  await page.waitForTimeout(400);
  scroll[name] = await page.evaluate(() => {
    const s = document.querySelector('[data-app-scroll-region]');
    if (s) s.scrollTop = 0;
    return {
      overflow: s ? s.scrollHeight - s.clientHeight : 0,
      viewport: window.innerHeight
    };
  });
  await page.locator(selector).screenshot({ path: `${outDir}/${name}.png` });
  shots.push(name);
};

const settle = async (page, path) => {
  await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-app-root][data-boot="ready"]');
  if (await page.locator('[data-leave-setup]').count()) {
    await page.locator('[data-leave-setup]').click();
    await page.waitForSelector('[data-home-hello]');
    await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-app-root][data-boot="ready"]');
  }
};

/* Palette and theme are set from Settings and then read back, rather than
   stamped onto <html> by hand: a goto resets a manual data-theme. */
const wear = async (page, palette, theme) => {
  await settle(page, '/settings');
  await page.locator(`[data-palette-pick="${palette}"]`).click();
  await page.locator(`[data-segment="${theme}"]`).click();
  await page.waitForFunction(
    ([p, t]) => document.documentElement.dataset.palette === p && document.documentElement.dataset.theme === t,
    [palette, theme]
  );
};

/** First run, walked to the disguise step, which is the last question. */
const BEFORE_DISGUISE = ['welcome', 'name', 'flag', 'scales', 'areas', 'lock', 'checkin'];
const stepToDisguise = async (page) => {
  await settle(page, '/');
  await page.selectOption('#demo-jump', 'first-run');
  await page.waitForSelector('[data-next]');
  for (const step of BEFORE_DISGUISE) {
    await page.waitForTimeout(400);
    if (step === 'name') await page.locator('#ob-name').fill('Ola');
    await page.locator('[data-next]').click();
  }
  await page.waitForSelector('[data-list-row="disguise"]');
  await page.waitForTimeout(500);
};

const turnOn = async (page) => {
  await page.getByRole('switch', { name: /Disguise app|Przebranie/ }).click();
  await page.waitForSelector('.disguise-preview.is-on');
  await page.waitForTimeout(400);
};

/* ---------- the step, web copy, off and on ---------- */
const web = await open(false);
for (const [palette, theme] of [
  ['trans', 'light'],
  ['trans', 'dark'],
  ['nonbinary', 'light'],
  ['agender', 'dark']
]) {
  await web.setViewportSize(SIZES.phone);
  await wear(web, palette, theme);
  await stepToDisguise(web);
  await shoot(web, `step-off-${palette}-${theme}`);
  await turnOn(web);
  await shoot(web, `step-on-${palette}-${theme}`);
}

/* ---------- rule 14: the step at the two sizes it must not scroll at ---------- */
for (const key of ['narrow', 'short']) {
  await web.setViewportSize(SIZES[key]);
  await stepToDisguise(web);
  await shoot(web, `step-${key}`);
}

/* ---------- the Settings sheet the preview came out of ---------- */
await web.setViewportSize(SIZES.phone);
await wear(web, 'trans', 'light');
await settle(web, '/settings');
await web.getByRole('button', { name: /Disguise/i }).click();
await web.waitForSelector('.disguise-preview');
await shoot(web, 'settings-sheet');
await web.close();

/* ---------- the same step with the Android wording ---------- */
const android = await open(true);
await wear(android, 'trans', 'light');
await stepToDisguise(android);
await shoot(android, 'step-off-android');
await turnOn(android);
await shoot(android, 'step-on-android');
await android.close();

await writeFile(`${outDir}/scroll.json`, JSON.stringify(scroll, null, 2));
await app.close();
await browser.close();

console.log(`${shots.length} shots in ${outDir}`);
for (const [name, m] of Object.entries(scroll)) {
  if (m.overflow > 0) console.log(`  scrolls: ${name} by ${m.overflow}px`);
}
