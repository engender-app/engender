/* Renders for setup's disguise step (phase 10 redesign ticket 32).

   Only what this ticket changed, per the sign-off note on ticket 07: the
   step itself, which did not exist before, and the Settings sheet the
   preview block was lifted out of, which has to look exactly as it did.
   Nothing else in setup and nothing else in the app.

   Web only, deliberately. The step's row and note branch on isAndroid(),
   and there is no honest way to see the Android branch here: the app
   bundles Capacitor, so `window.Capacitor` exists in a browser already and
   answers "web", and an init script that redefines it is overwritten on
   boot. Faking it harder would mean a render whose platform is a lie in
   every other respect too. The Android wording is shot on the emulator
   instead, through the WebView's own devtools endpoint, where it is real.

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

async function open() {
  const context = await browser.newContext({ viewport: SIZES.phone, deviceScaleFactor: 2 });
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
  await page.waitForSelector('[data-disguise-preview][data-on="true"]');
  await page.waitForTimeout(400);
};

/* ---------- the step, web copy, off and on ---------- */
const web = await open();
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
await web.waitForSelector('[data-disguise-preview]');
await shoot(web, 'settings-sheet');
await web.close();

await writeFile(`${outDir}/scroll.json`, JSON.stringify(scroll, null, 2));
await app.close();
await browser.close();

console.log(`${shots.length} shots in ${outDir}`);
for (const [name, m] of Object.entries(scroll)) {
  if (m.overflow > 0) console.log(`  scrolls: ${name} by ${m.overflow}px`);
}
