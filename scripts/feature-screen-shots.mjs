/* Screenshots of the 26 feature screens (phase 5 UX ticket 25), for the
   sign-off round that happens before a UI ticket merges.

   Drives a running demo build (`VITE_DEMO=1`) across every route the ticket
   redesigns, at phone width, on both themes. The demo persona is what puts
   real content on them; a screen with an empty state is captured as it
   ships, because the empty states are a designed surface here.

   Run: node scripts/feature-screen-shots.mjs <baseUrl> [outDir]
   Default outDir is .claude/ticket-25-shots, which is gitignored and
   durable - a session scratchpad under /tmp is deleted when the process
   exits. */
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from '../tests/browser-harness.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const base = process.argv[2] ?? 'http://127.0.0.1:5199';
const outDir = resolve(process.argv[3] ?? resolve(here, '../.claude/ticket-25-shots'));

/** SCREENS.md's own list, in its own grouping. */
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
  ['practice', '/settings/personal-effects'],
  ['practice', '/settings/resources'],
  ['in-context', '/settings/stock'],
  ['in-context', '/settings/exposure'],
  ['in-context', '/settings/photos/export']
];

const THEMES = ['dark', 'light'];
const slug = (route) => route.replace(/^\//, '').replaceAll('/', '-');

await mkdir(outDir, { recursive: true });

const browser = await launchChromium();
const page = await browser.newPage({ viewport: { width: 390, height: 1400 }, deviceScaleFactor: 2 });

/* The theme is a preference, not a URL, so it is set on the document the
   same way the shell sets it and then left alone - reloading between
   routes would put it back to the persona's own. */
async function useTheme(theme) {
  await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
}

/* The demo bar is scaffolding, not the app: it sits above `[data-app-root]`
   and offsets everything under it, which is the same thing the walkthrough's
   geometry checks have to allow for. Hidden rather than cropped around, so
   what is captured is the screen at the top of the frame. */
async function hideScaffolding() {
  await page.addStyleTag({ content: '.demo-bar { display: none !important; }' });
}

/* A screen is not itself until the worker has answered and its own content
   has replaced the skeleton. Waiting on a timeout alone caught a skeleton on
   the first run, which is a screenshot of the loading state filed under the
   screen's name. */
async function settled() {
  await page.waitForSelector('[data-screen-header]', { timeout: 30_000 });
  await page
    .waitForFunction(() => document.querySelector('.skeleton-stack') === null, null, { timeout: 30_000 })
    .catch(() => {});
  await page.waitForTimeout(900);
}

/* A route that will not render is the thing this script exists to find, so
   it is reported and stepped over rather than taking the whole run down
   with it. */
page.on('pageerror', (error) => process.stdout.write(`  page error: ${error.message}\n`));

const shots = [];
const broken = [];

/** One route, both themes, filed under the name the route gives it. */
async function captureBoth(group, route, name) {
  for (const theme of THEMES) {
    await useTheme(theme);
    await page.waitForTimeout(250);
    const file = `${outDir}/${name}-${theme}.png`;
    await page.locator('[data-app-root]').screenshot({ path: file });
    shots.push({ group, route, theme, file });
  }
}

/** Navigate, wait for the screen to be itself, and shoot it. */
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
    /* A dev server re-optimizing its dependencies drops the module graph
       out from under whatever navigated during it, which reads exactly
       like a broken route and is not one. One retry tells the two apart. */
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
