/* Sign-off shots for ticket 57 ("changes you've noticed gets a time axis").
   Crops of the top of /practice/personal-effects - the part the ticket
   changed - before and after, in the trans palette, light and dark. The
   groups, their bands, the manage sheet and the two hosted rows underneath
   are the ones they were and are not shot.

   Two journals. The first runs "Fill every feature", whose eight visible
   markers carry both shapes the axis has to handle: four noticed inside
   three weeks, which stack into lanes, and four standing alone with months
   between them. The second is a fresh journal with no regimen at all, which is the
   axis's calendar fallback - and which the screen used to replace with a
   notice, so in the 'before' column there is nothing there to mark a change
   with and the shot is that notice.

   'before' is rendered by swapping the screen's own route file for the
   version at the ticket's base commit and building that, the shape
   tryout-card-gallery.mjs and roadmap-here-gallery.mjs use. Only the route
   file is swapped: the demo fixture keeps this branch's clustered markers
   in both columns, so the two shots are one journal drawn two ways rather
   than two journals.

   Run: node tests/noticed-axis-gallery.mjs before [outDir]
        node tests/noticed-axis-gallery.mjs after [outDir]
   Default outDir is .claude/noticed-axis-shots, gitignored and durable. */
import { preview } from 'vite';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { launchChromium, fillDate } from './browser-harness.mjs';

const tag = process.argv[2];
if (tag !== 'before' && tag !== 'after') {
  console.error('Usage: node tests/noticed-axis-gallery.mjs <before|after> [outDir]');
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const outDir = resolve(process.argv[3] ?? resolve(root, '.claude/noticed-axis-shots'));
const ROUTE = 'src/routes/practice/personal-effects/+page.svelte';
const BASE_COMMIT = '9844a17a'; // the ticket branch's own base

const THEMES = ['light', 'dark'];
const PALETTE = 'trans';

/** Long enough for the axis's own uncovering (--dur-authored) to have
    finished, so every frame here is the resting state. */
const SETTLED = 900;

/** How far below the header a crop reaches. Enough for the whole axis with
    its deepest stack, its months and its caption, and for the first inch of
    whatever the screen put there before it. */
const CROP_HEIGHT = 300;

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

/** One change marked through the screen's own sheet, which is the only way
    into this record - there is no fixture for a journal that has markers
    and no regimen. Reachable only in the 'after' column: the screen this
    replaces drew the notice instead of the groups whenever there was no
    regimen to anchor against, so the rows these clicks need were not on it. */
async function markChange(page, { group, effect, date }) {
  await settle(page, '/practice/personal-effects');
  await page.locator(`[data-effect-group="${group}"] [aria-expanded]`).first().click();
  await page.locator(`[data-list-row="${effect}"]`).click();
  await page.waitForSelector('#effect-date');
  await fillDate(page, '#effect-date', date);
  await page.locator('[data-save-effect]').click();
  await page.waitForSelector('[data-save-effect]', { state: 'detached' });
}

/** The screen from under its header down, which is where every difference
    this ticket makes is. `clip` is in page coordinates and this screen is
    at the top of its scroller, so the header's own box is the whole of the
    offset needed. */
async function shootTop(page, name, height = CROP_HEIGHT) {
  await page.evaluate(() => {
    for (const toast of document.querySelectorAll('[data-toast]')) toast.remove();
    for (const bar of document.querySelectorAll('.demo-bar')) bar.remove();
    document.body.classList.remove('has-demo-bar');
  });
  await page.waitForTimeout(150);
  const header = await page.locator('[data-screen-header]').first().boundingBox();
  await page.screenshot({
    path: `${outDir}/${name}-${tag}.png`,
    clip: { x: 0, y: header.y + header.height, width: 390, height }
  });
  shots.push(`${name}-${tag}`);
  process.stdout.write(`  ${name}-${tag}\n`);
}

try {
  for (const theme of THEMES) {
    /* The fixture's thirteen markers, against a regimen that began 500 days
       ago: the dense month and the sparse stretches on one line. */
    const filled = await freshPage();
    await settle(filled, '/settings');
    await filled.locator('[data-fill-every-feature]').click();
    await filled.waitForURL('**/more', { timeout: 120000 });
    await setLook(filled, theme);
    await settle(filled, '/practice/personal-effects');
    await filled.waitForSelector('[data-effect-group]');
    await filled.waitForTimeout(SETTLED);

    await shootTop(filled, `noticed-axis-trans-${theme}`);
    await filled.close();

    /* No regimen, so no start day to count months from. */
    const noRegimen = await freshPage();
    if (tag === 'after') {
      await markChange(noRegimen, {
        group: 'feminizing::body_shape',
        effect: 'breast_development',
        date: iso(-95)
      });
      await markChange(noRegimen, { group: 'feminizing::skin_hair', effect: 'skin_softening', date: iso(-40) });
    }
    await setLook(noRegimen, theme);
    await settle(noRegimen, '/practice/personal-effects');
    await noRegimen.waitForSelector('[data-screen-header]');
    await noRegimen.waitForTimeout(SETTLED);

    /* Taller than the other crop: the axis has the notice under it, and
       the point of this pair is that both are on the screen at once. */
    await shootTop(noRegimen, `noticed-axis-no-regimen-trans-${theme}`, 560);
    await noRegimen.close();
  }
} finally {
  await browser.close();
  await app.close();
}

process.stdout.write(`\n${shots.length} shot(s) in ${outDir}\n`);
