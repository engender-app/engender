/* Sign-off shots for ticket 53 ("a running tryout becomes a card"). Crops of
   the three things the ticket changed - a running tryout, an ended one, and
   a running one with almost nothing recorded against it yet - before and
   after, in the trans palette, light and dark. Nothing else on the screen:
   the header, the empty state and the delete sheet are the ones they were.

   'before' is rendered by swapping the screen's own route file for the
   version at the ticket's base commit and building that, the shape
   roadmap-here-gallery.mjs uses, so the column is reproducible from a
   worktree that has already moved past it. Only the route file is swapped:
   the demo fixture keeps this branch's felt-sense readings in both columns,
   so the two shots are the same journal drawn two ways rather than two
   journals. One build per run, for that gallery's reason - two `vite
   preview` servers in one process left the second answering networkidle
   without ever reaching `[data-boot="ready"]`.

   Two journals, in two browser contexts. The first runs "Fill every
   feature", whose three tryouts are the ordinary case: one still running
   with a hundred days and nine readings behind it, two ended. The second is
   a fresh journal with two tryouts written through the app's own editor -
   one with a single reading, one with none - which is the pair the ticket's
   own acceptance criteria name and which no fixture has.

   Run: node tests/tryout-card-gallery.mjs before [outDir]
        node tests/tryout-card-gallery.mjs after [outDir]
   Default outDir is .claude/tryout-card-shots, gitignored and durable. */
import { preview } from 'vite';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { launchChromium, fillDate } from './browser-harness.mjs';

const tag = process.argv[2];
if (tag !== 'before' && tag !== 'after') {
  console.error('Usage: node tests/tryout-card-gallery.mjs <before|after> [outDir]');
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const outDir = resolve(process.argv[3] ?? resolve(root, '.claude/tryout-card-shots'));
const ROUTE = 'src/routes/transition/tryouts/+page.svelte';
const BASE_COMMIT = '789382e2'; // the ticket branch's own base

const THEMES = ['light', 'dark'];
const PALETTE = 'trans';

/** Long enough for a block to be uncovered and the arc to be revealed
    (--dur-slow), so every frame here is the resting state. */
const SETTLED = 700;

const run = (command, args, env) =>
  new Promise((done, fail) => {
    const child = spawn(command, args, { cwd: root, stdio: 'inherit', env: { ...process.env, ...env } });
    child.on('exit', (code) => (code === 0 ? done() : fail(new Error(`${command} exited ${code}`))));
  });

const git = (args) =>
  new Promise((done, fail) => {
    let out = '';
    const child = spawn('git', args, { cwd: root });
    child.stdout.on('data', (d) => (out += d));
    child.on('exit', (code) => (code === 0 ? done(out) : fail(new Error(`git ${args.join(' ')} exited ${code}`))));
  });

await mkdir(outDir, { recursive: true });

if (tag === 'before') {
  const current = await readFile(resolve(root, ROUTE), 'utf8');
  const wasThere = await git(['show', `${BASE_COMMIT}:${ROUTE}`]);
  try {
    await writeFile(resolve(root, ROUTE), wasThere);
    await run('npx', ['vite', 'build'], { VITE_DEMO: '1' });
  } finally {
    await writeFile(resolve(root, ROUTE), current);
  }
} else {
  await run('npx', ['vite', 'build'], { VITE_DEMO: '1' });
}

const app = await preview({ preview: { port: 0 } });
const base = `http://localhost:${app.httpServer.address().port}`;
const browser = await launchChromium();
const shots = [];

const iso = (offsetDays) => {
  const day = new Date();
  day.setDate(day.getDate() + offsetDays);
  return day.toISOString().slice(0, 10);
};

async function freshPage() {
  /* A phone's width, and a viewport tall enough that a crop of a card is
     never clipped by the foot or by the scroll region's own edge. */
  const page = await browser.newPage({ viewport: { width: 390, height: 1200 }, deviceScaleFactor: 2 });
  await settle(page, '/');
  return page;
}

async function settle(page, path) {
  await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-app-root][data-boot="ready"]');
  if (await page.locator('[data-leave-setup]').count()) {
    await page.locator('[data-leave-setup]').click();
    await page.waitForSelector('[data-home-hello]');
    await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-app-root][data-boot="ready"]');
  }
}

/* The palette and theme are set after any state jump, never before: a demo
   reset writes the preferences back. */
async function setLook(page, theme) {
  await settle(page, '/settings');
  await page.locator(`[data-palette-pick="${PALETTE}"]`).click();
  await page.locator(`[data-segment="${theme}"]`).first().click();
  await page.waitForFunction((want) => document.documentElement.dataset.theme === want, theme);
}

/** One tryout, through the screen's own editor, exactly as a person writes
    one. */
async function addTryout(page, { label, start }) {
  await settle(page, '/transition/tryouts/new');
  await page.waitForSelector('#tr-label');
  await page.fill('#tr-label', label);
  await fillDate(page, '#tr-start', start);
  await page.locator('[data-save-tryout]').click();
  /* Saving a new tryout goes to its own detail route, which is the same
     glob `/new` already matches - so the wait is on leaving `/new` rather
     than on arriving anywhere. */
  await page.waitForFunction(() => !location.pathname.endsWith('/new'));
  await page.waitForTimeout(SETTLED);
}

/** One felt-sense reading, through the detail screen's own editor - the one
    path that exists in both columns. It dates itself to today, which is
    what makes this the single-reading case and not a second shape. */
async function addReading(page, label, mood) {
  await settle(page, '/transition/tryouts');
  await page.locator('[data-tryout]', { hasText: label }).first().locator('a').first().click();
  await page.waitForSelector('[data-add-feeling]');
  await page.locator(`[data-mood="${mood}"]`).click();
  await page.locator('[data-add-feeling]').click();
  await page.waitForSelector('[data-feeling]');
  await page.waitForTimeout(SETTLED);
}

async function shoot(page, selector, name) {
  /* Headless Chromium never grants persistent storage, so the app's own
     "export backups regularly" toast sits over the foot of every screen,
     and a demo build carries the demo bar. Both are true of this browser
     and neither is what these are of. */
  await page.evaluate(() => {
    for (const toast of document.querySelectorAll('[data-toast]')) toast.remove();
    for (const bar of document.querySelectorAll('.demo-bar')) bar.remove();
    document.body.classList.remove('has-demo-bar');
  });
  await page.waitForTimeout(150);
  await page.locator(selector).first().screenshot({ path: `${outDir}/${name}-${tag}.png` });
  shots.push(`${name}-${tag}`);
  process.stdout.write(`  ${name}-${tag}\n`);
}

try {
  for (const theme of THEMES) {
    /* The fixture's three tryouts: 'she/her' running since today - 100 with
       nine readings across it, 'layered look' and 'Alex' both ended. */
    const filled = await freshPage();
    await settle(filled, '/settings');
    await filled.locator('[data-fill-every-feature]').click();
    await filled.waitForURL('**/more', { timeout: 120000 });
    await setLook(filled, theme);
    await settle(filled, '/transition/tryouts');
    await filled.waitForSelector('[data-tryout]');
    await filled.waitForTimeout(SETTLED);

    await shoot(filled, '[data-tryout]:has-text("she/her")', `tryout-running-trans-${theme}`);
    await shoot(filled, '[data-tryout]:has-text("Alex")', `tryout-ended-trans-${theme}`);
    await filled.close();

    /* The two thin cases, on their own journal so they cannot disturb the
       pair above: one reading, and none at all. */
    const thin = await freshPage();
    await addTryout(thin, { label: 'Robin', start: iso(-30) });
    await addReading(thin, 'Robin', 4);
    await addTryout(thin, { label: 'Kit', start: iso(-9) });
    await setLook(thin, theme);
    await settle(thin, '/transition/tryouts');
    await thin.waitForSelector('[data-tryout]');
    await thin.waitForTimeout(SETTLED);

    await shoot(thin, '[data-list-card]', `tryout-thin-trans-${theme}`);
    await thin.close();
  }
} finally {
  await browser.close();
  await app.close();
}

process.stdout.write(`\n${shots.length} shot(s) in ${outDir}\n`);
