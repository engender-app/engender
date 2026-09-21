/* Sign-off shots for phase 11 pre-production UI/UX ticket 43. Crops of the
   four things the ticket changed - a running tryout's card, the end-date
   field, the kind picker's overflowing edge and the felt-sense note - before
   and after, in the trans palette, light and dark. Nothing else on the
   screen: the header, the ended rows, the photo and entry sections and the
   delete sheet are the ones they were.

   'before' is rendered by putting every file this branch touched back to the
   version at its base commit and building that, the shape
   tryout-card-gallery.mjs and roadmap-here-gallery.mjs use - a list of paths
   rather than the one route file, because this ticket's diff runs through the
   kit, the stylesheet and the catalogues as well as the two screens. The demo
   fixture is the same in both columns, so the pair is one journal drawn two
   ways.

   Two journals, in two browser contexts. The first runs "Fill every feature",
   whose running tryout has a hundred days and nine readings behind it. The
   second is a fresh journal with two tryouts written through the app's own
   editor - one with a single reading, one with none - which is the pair the
   acceptance criteria name and which no fixture has.

   Run: node tests/tryout-43-gallery.mjs before [outDir]
        node tests/tryout-43-gallery.mjs after [outDir]
   Default outDir is .claude/tryout-43-shots, gitignored and durable. */
import { preview } from 'vite';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { launchChromium, fillDate } from './browser-harness.mjs';

const tag = process.argv[2];
if (tag !== 'before' && tag !== 'after') {
  console.error('Usage: node tests/tryout-43-gallery.mjs <before|after> [outDir]');
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const outDir = resolve(process.argv[3] ?? resolve(root, '.claude/tryout-43-shots'));
const BASE_COMMIT = '8d081998'; // the ticket branch's own base

const THEMES = ['light', 'dark'];
const PALETTE = 'trans';

/** Long enough for a block to be uncovered and the arc revealed
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
  /* Every source and catalogue file the branch touched, which is what the
     'before' column has to be built from - a gallery that swapped only the
     screen would render this branch's kit and this branch's copy under last
     week's markup. */
  const paths = (await git(['diff', '--name-only', `${BASE_COMMIT}..HEAD`]))
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('src/') || line.startsWith('messages/'));
  const current = new Map();
  for (const path of paths) current.set(path, await readFile(resolve(root, path), 'utf8'));
  try {
    for (const path of paths) await writeFile(resolve(root, path), await git(['show', `${BASE_COMMIT}:${path}`]));
    await run('npx', ['vite', 'build'], { VITE_DEMO: '1' });
  } finally {
    for (const [path, text] of current) await writeFile(resolve(root, path), text);
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

async function addTryout(page, { label, start }) {
  await settle(page, '/transition/tryouts/new');
  await page.waitForSelector('#tr-label');
  await page.fill('#tr-label', label);
  await fillDate(page, '#tr-start', start);
  await page.locator('[data-save-tryout]').click();
  await page.waitForFunction(() => !location.pathname.endsWith('/new'));
  await page.waitForTimeout(SETTLED);
}

async function addReading(page, label, mood) {
  await settle(page, '/transition/tryouts');
  await page.locator('[data-tryout]', { hasText: label }).first().locator('a').first().click();
  await page.waitForSelector('[data-add-feeling]');
  await page.locator(`[data-mood="${mood}"]`).click();
  await page.locator('[data-add-feeling]').click();
  await page.waitForSelector('[data-feeling]');
  await page.waitForTimeout(SETTLED);
}

/** A crop spanning two elements, for the shots whose content has no single
    box in both columns: the felt-sense note was a bare textarea before this
    ticket and is a labelled field after it, so there is no one selector to
    hand `locator.screenshot`. */
async function shootBetween(page, fromSelector, toSelector, name) {
  await hideChrome(page);
  const clip = await page.evaluate(([from, to]) => {
    const top = document.querySelector(from).getBoundingClientRect();
    const bottom = document.querySelector(to).getBoundingClientRect();
    return { x: top.x, y: top.y, width: top.width, height: bottom.bottom - top.y };
  }, [fromSelector, toSelector]);
  await page.screenshot({ path: `${outDir}/${name}-${tag}.png`, clip });
  shots.push(`${name}-${tag}`);
  process.stdout.write(`  ${name}-${tag}\n`);
}

/** Headless Chromium never grants persistent storage, so the app's own
    "export backups regularly" toast sits over the foot of every screen, and
    a demo build carries the demo bar. Both are true of this browser and
    neither is what these are of. */
async function hideChrome(page) {
  await page.evaluate(() => {
    for (const toast of document.querySelectorAll('[data-toast]')) toast.remove();
    for (const bar of document.querySelectorAll('.demo-bar')) bar.remove();
    document.body.classList.remove('has-demo-bar');
  });
  await page.waitForTimeout(150);
}

async function shoot(page, selector, name) {
  await hideChrome(page);
  await page.locator(selector).first().screenshot({ path: `${outDir}/${name}-${tag}.png` });
  shots.push(`${name}-${tag}`);
  process.stdout.write(`  ${name}-${tag}\n`);
}

try {
  for (const theme of THEMES) {
    /* The fixture's running tryout: 'she/her', a hundred days with nine
       readings across it. */
    const filled = await freshPage();
    await settle(filled, '/settings');
    await filled.locator('[data-fill-every-feature]').click();
    await filled.waitForURL('**/more', { timeout: 120000 });
    await setLook(filled, theme);
    await settle(filled, '/transition/tryouts');
    await filled.waitForSelector('[data-tryout]');
    await filled.waitForTimeout(SETTLED);
    await shoot(filled, '[data-tryout]:has-text("she/her")', `card-running-${theme}`);
    /* The ended half, which this ticket did not touch, beside the running
       one, which it did: the acceptance criterion is that the two stay
       telling apart, and that is a question about the pair. */
    await shoot(filled, '[data-ended]', `rows-ended-${theme}`);

    /* The form, on the new-tryout route: the field whose help used to be
       part of its label, the picker's overflowing edge, and the note that
       had no label. The felt-sense half only exists on a saved tryout, so
       that one is shot on the fixture's own running tryout. */
    await settle(filled, '/transition/tryouts/new');
    await filled.waitForSelector('#tr-label');
    await shoot(filled, '.segmented-wrap', `form-kinds-${theme}`);
    await shoot(filled, '.field:has(#tr-end)', `form-end-${theme}`);

    await settle(filled, '/transition/tryouts');
    await filled.locator('[data-tryout]:has-text("she/her") a').first().click();
    await filled.waitForSelector('[data-add-feeling]');
    await filled.waitForTimeout(SETTLED);
    await shootBetween(filled, '.mood-picker', '[data-add-feeling]', `form-note-${theme}`);
    await filled.close();

    /* The two thin cases, on their own journal so they cannot disturb the
       one above: one reading, and none at all. */
    const thin = await freshPage();
    await addTryout(thin, { label: 'Robin', start: iso(-30) });
    await addReading(thin, 'Robin', 4);
    await addTryout(thin, { label: 'A name I am still turning over', start: iso(-9) });
    await setLook(thin, theme);
    await settle(thin, '/transition/tryouts');
    await thin.waitForSelector('[data-tryout]');
    await thin.waitForTimeout(SETTLED);
    await shoot(thin, '[data-list-card]', `card-thin-${theme}`);
    await thin.close();
  }
} finally {
  await browser.close();
  await app.close();
}

process.stdout.write(`\n${shots.length} shot(s) in ${outDir}\n`);
