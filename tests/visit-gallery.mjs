/* Sign-off renders for the visit screen (phase 11 all-four-doors ticket 12):
   the whole screen, end to end, in trans light and trans dark, on the full
   fixture and on a journal with no appointments.

   Two builds, one gallery. The ticket merges two screens into one, so
   "before" is /health/appointments and /health/appointment-prep side by side
   and "after" is the single screen that replaced them - which means the shots
   have to come from two different bundles. Run this once inside each
   worktree with its own `--tag`, pointing both at the same `--out`; each run
   serves the build sitting next to it (`vite preview` serves the output
   directory of the project it is started in).

   The height is printed with every shot, because the ticket's acceptance
   criterion is a number: the whole screen on the full fixture inside 1300px.

   Run: VITE_DEMO=1 npm run build first, then
        node tests/visit-gallery.mjs --tag after --out <dir> */
import { preview } from 'vite';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './browser-harness.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const arg = (name, fallback) => {
  const at = process.argv.indexOf(`--${name}`);
  return at === -1 ? fallback : process.argv[at + 1];
};
const tag = arg('tag', 'after');
const outDir = resolve(arg('out', resolve(here, '../.claude/visit-shots')));

const VIEWPORT = { width: 390, height: 844 };
/** Long enough for the screen's own arrival to land (--dur-slow) and for a
    live read to have painted. Every frame here wants the resting state. */
const SETTLED = 600;

await mkdir(outDir, { recursive: true });

const app = await preview({ preview: { port: 0 } });
const base = `http://localhost:${app.httpServer.address().port}`;
const browser = await launchChromium();
const measured = [];

async function freshPage() {
  const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 2 });
  await page.goto(`${base}/`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-app-root][data-boot="ready"]');
  if (await page.locator('[data-leave-setup]').count()) {
    await page.locator('[data-leave-setup]').click();
    await page.waitForSelector('[data-home-hello]');
  }
  return page;
}

async function goto(page, path) {
  await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-app-root][data-boot="ready"]');
  await page.waitForTimeout(SETTLED);
}

/** The palette and theme are set after any state jump, never before: a demo
    reset writes the preferences back. */
async function setLook(page, palette, theme) {
  await goto(page, '/settings');
  await page.locator(`[data-palette-pick="${palette}"]`).click();
  await page.locator(`[data-segment="${theme}"]`).first().click();
  await page.waitForFunction((want) => document.documentElement.dataset.theme === want, theme);
}

/** A journal with no appointments on it, made by deleting the demo
    persona's two through the screen's own editor.

    There is no demo control for this: every jump the bar offers seeds the
    persona, and the persona has a visit ahead and one behind. Deleting them
    the way a person would is the only honest way to reach the state, and it
    exercises the delete path on the new screen while it is at it - including
    on the opening block, which is a record and not a summary of one. */
async function clearAppointments(page) {
  await goto(page, '/health/appointments');
  for (let guard = 0; guard < 20; guard += 1) {
    const rows = await page.locator('[data-appointment]').count();
    if (rows === 0) break;
    await page.locator('[data-appointment]').first().click();
    await page.locator('[data-delete-appointment]').click();
    await page.locator('[data-confirm-delete-appointment]').click();
    await page.waitForFunction(
      (before) => document.querySelectorAll('[data-appointment]').length < before,
      rows
    );
  }
  await page.waitForTimeout(SETTLED);
}

/** Everything the app can hold, written by the demo bar's own control. */
async function fill(page) {
  await goto(page, '/body/measurements');
  await page.locator('[data-fill-every-feature]').click();
  await page.waitForURL('**/more');
  await page.waitForSelector('[data-app-root][data-boot="ready"]');
  await page.waitForTimeout(SETTLED);
}

/** The whole screen however far past the fold it runs, with the viewport
    grown to hold it. Grown until it stops growing rather than once: a
    section that opens its own height answers the first grow by needing more
    of it, and a single pass photographs that mid-flight. */
async function shootWhole(page, name) {
  let tall = 0;
  for (let pass = 0; pass < 4; pass += 1) {
    const want = await page.evaluate(() => {
      const scroller = document.querySelector('[data-app-scroll-region]');
      return Math.min(window.innerHeight + (scroller.scrollHeight - scroller.clientHeight), 8000);
    });
    if (want <= tall) break;
    tall = want;
    await page.setViewportSize({ width: VIEWPORT.width, height: tall });
    await page.waitForTimeout(400);
  }
  /* Headless Chromium never grants persistent storage, so the app's own
     "export backups regularly" toast sits over the foot of every screen. It
     is a true notice about this browser and not what these are of. */
  await page.evaluate(() => {
    for (const toast of document.querySelectorAll('[data-toast]')) toast.remove();
  });
  await page.locator('[data-app-root]').screenshot({ path: resolve(outDir, `${name}.png`) });
  await page.setViewportSize(VIEWPORT);
  measured.push({ name, height: tall });
  console.log(`  ${name}: ${VIEWPORT.width}x${tall}`);
}

/* The screens this build has. Before the merge the visit was two addresses;
   after it there is one, and the prep address is a redirect stub. */
const ROUTES =
  tag === 'before'
    ? [
        ['/health/appointments', 'appointments'],
        ['/health/appointment-prep', 'prep']
      ]
    : [['/health/appointments', 'appointments']];

for (const theme of ['light', 'dark']) {
  /* The full fixture: one visit ahead, one behind, the surgery journey's
     consults among them, and a standing prep list with three questions. */
  const filled = await freshPage();
  await fill(filled);
  await setLook(filled, 'trans', theme);
  for (const [path, slug] of ROUTES) {
    await goto(filled, path);
    await shootWhole(filled, `${slug}-full-trans-${theme}-${tag}`);
  }
  await filled.close();

  /* A journal with no appointments at all, which on the persona is also a
     journal with no prep list: both halves of the screen on their empty
     state at once. */
  const bare = await freshPage();
  await clearAppointments(bare);
  await setLook(bare, 'trans', theme);
  for (const [path, slug] of ROUTES) {
    await goto(bare, path);
    await shootWhole(bare, `${slug}-none-trans-${theme}-${tag}`);
  }
  await bare.close();
}

/* Merged rather than written fresh, because the two tags run as two
   processes against two builds and the sign-off page wants one table. */
const heightsPath = resolve(outDir, 'heights.json');
const existing = await readFile(heightsPath, 'utf8').then(JSON.parse, () => ({}));
for (const { name, height } of measured) existing[name] = height;
await writeFile(heightsPath, `${JSON.stringify(existing, null, 2)}\n`);

console.log(`\n${measured.length} shots in ${outDir}`);
for (const { name, height } of measured) {
  const over = height > 1300 ? '  OVER 1300px' : '';
  console.log(`  ${name}  ${height}px${over}`);
}

await browser.close();
await app.close();
