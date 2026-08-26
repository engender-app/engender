/* Screenshots of every More-hub screen with the full fixture loaded (phase
   5 ticket 36), for the sign-off round the ticket exists to enable - a
   review pass through these screens used to be "a tour of empty states
   with a few exceptions" (Alicja, 2026-08-26).

   Drives a running demo build (`VITE_DEMO=1`), clicks the demo bar's "Fill
   every feature" control, then walks the same route list
   feature-screen-shots.mjs already uses for ticket 25's sign-off - the
   more-hub screens this ticket fills in, at phone width, on both themes.

   Run: node scripts/full-fixture-screen-shots.mjs <baseUrl> [outDir]
   Default outDir is .claude/ticket-36-shots, which is gitignored and
   durable - a session scratchpad under /tmp is deleted when the process
   exits. */
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from '../tests/browser-harness.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const base = process.argv[2] ?? 'http://127.0.0.1:5199';
const outDir = resolve(process.argv[3] ?? resolve(here, '../.claude/ticket-36-shots'));

const ROUTES = [
  ['body', '/settings/photos'],
  ['body', '/settings/measurements'],
  ['body', '/settings/sizes'],
  ['body', '/settings/hair-progress'],
  ['body', '/settings/hair-removal'],
  ['health', '/settings/labs'],
  ['health', '/settings/regimen'],
  ['health', '/settings/hormone-curve'],
  ['health', '/doses'],
  ['health', '/settings/cycle-events'],
  ['health', '/settings/side-effects'],
  ['health', '/settings/surgery'],
  ['health', '/settings/appointment-prep'],
  ['health', '/settings/clinician-summary'],
  ['transition', '/settings/milestones'],
  ['transition', '/settings/roadmap'],
  ['transition', '/settings/letters'],
  ['transition', '/settings/tryouts'],
  ['practice', '/settings/voice'],
  ['practice', '/settings/wear'],
  ['practice', '/settings/effects'],
  ['practice', '/settings/resources'],
  ['in-context', '/settings/stock']
];

const THEMES = ['dark', 'light'];
const slug = (route) => route.replace(/^\//, '').replaceAll('/', '-');

await mkdir(outDir, { recursive: true });

const browser = await launchChromium();
const page = await browser.newPage({ viewport: { width: 390, height: 1400 }, deviceScaleFactor: 1 });

async function useTheme(theme) {
  await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
}

async function hideScaffolding() {
  await page.addStyleTag({ content: '.demo-bar { display: none !important; }' });
}

async function settled() {
  await page.waitForSelector('[data-screen-header]', { timeout: 30_000 });
  await page
    .waitForFunction(() => document.querySelector('.skeleton-stack') === null, null, { timeout: 30_000 })
    .catch(() => {});
  await page.waitForTimeout(900);
}

page.on('pageerror', (error) => process.stdout.write(`  page error: ${error.message}\n`));

// Seed the full fixture once, up front - the same DemoBar control a
// reviewer would click by hand.
await page.goto(`${base}/`, { waitUntil: 'networkidle' });
await page.waitForSelector('[data-app-root][data-boot="ready"]', { timeout: 30_000 });
await page.click('[data-fill-every-feature]');
await page.waitForURL('**/more');
await page.waitForSelector('[data-app-root][data-boot="ready"]', { timeout: 30_000 });
process.stdout.write('fixture filled\n');

const shots = [];
const broken = [];

async function captureBoth(group, route, name) {
  for (const theme of THEMES) {
    await useTheme(theme);
    await page.waitForTimeout(250);
    const file = `${outDir}/${name}-${theme}.png`;
    await page.locator('[data-app-root]').screenshot({ path: file });
    shots.push({ group, route, theme, file });
  }
}

async function visit(group, route) {
  await page.goto(`${base}${route}`, { waitUntil: 'networkidle' });
  await hideScaffolding();
  await settled();
  await captureBoth(group, route, slug(route));
}
for (const [group, route] of ROUTES) {
  try {
    await visit(group, route);
    process.stdout.write(`${route}\n`);
  } catch (error) {
    try {
      await visit(group, route);
      process.stdout.write(`${route} (retried)\n`);
    } catch {
      broken.push(route);
      process.stdout.write(`BROKEN ${route} - ${String(error).split('\n')[0]}\n`);
    }
  }
}

// The tryout detail is reached from inside the tryouts list, so it is
// captured by opening the first row rather than by a URL this script would
// have to invent an id for.
await page.goto(`${base}/settings/tryouts`, { waitUntil: 'networkidle' });
await hideScaffolding();
await settled();
const firstTryout = page.locator('[data-tryout] a').first();
if (await firstTryout.count()) {
  await firstTryout.click();
  await hideScaffolding();
  await settled();
  await captureBoth('transition', '/settings/tryouts/[id]', 'settings-tryouts-detail');
  process.stdout.write('/settings/tryouts/[id]\n');
}

await browser.close();
process.stdout.write(`\n${shots.length} shots in ${outDir}\n`);
if (broken.length) process.stdout.write(`BROKEN: ${broken.join(', ')}\n`);
