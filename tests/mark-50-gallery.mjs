/* Sign-off shots for phase 11 pre-production UI/UX ticket 50: the three
   surfaces inside the app that now carry the mark - About, the clinician
   summary's printed header and the journal book's cover - before and after,
   in the trans palette. Nothing else on those screens changed and nothing
   else is in frame.

   Light and dark for About. One shot for each printed header, because
   app.css's print block overrides the palette to black on white: paper is
   paper, and two identical images of it would be two things to look at
   saying one thing.

   The icons are not here. A favicon and a launcher tile are files, not
   screens, so mark-50-signoff-page.mjs rasterises those straight out of the
   repo at their real sizes - scaling an SVG up is not a magnifier, which is
   a finding ticket 38 paid for once already.

   'before' is rendered by putting every source and static file this branch
   touched back to the version at its base commit and building that, the
   shape tryout-43-gallery.mjs uses. Files this branch added are removed for
   that build and written back afterwards, and files it deleted come back,
   so the 'before' column is the app as it was rather than as it was with
   today's markup.

   Run: node tests/mark-50-gallery.mjs before [outDir]
        node tests/mark-50-gallery.mjs after [outDir]
   Default outDir is .claude/mark-50-shots, gitignored and durable. */
import { preview } from 'vite';
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { launchChromium } from './browser-harness.mjs';

const tag = process.argv[2];
if (tag !== 'before' && tag !== 'after') {
  console.error('Usage: node tests/mark-50-gallery.mjs <before|after> [outDir]');
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const outDir = resolve(process.argv[3] ?? resolve(root, '.claude/mark-50-shots'));
const BASE_COMMIT = 'f73ccf0f'; // the ticket branch's own base

const PALETTE = 'trans';
const THEMES = ['light', 'dark'];

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

/** The file at the base commit, or null if the branch is what added it. */
const atBase = (path) => git(['show', `${BASE_COMMIT}:${path}`]).catch(() => null);

await mkdir(outDir, { recursive: true });

let restore = null;
if (tag === 'before') {
  const paths = (await git(['diff', '--name-only', `${BASE_COMMIT}..HEAD`]))
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('src/') || line.startsWith('static/'));
  const current = new Map();
  for (const path of paths) {
    const full = resolve(root, path);
    current.set(path, existsSync(full) ? await readFile(full, 'utf8') : null);
  }
  restore = async () => {
    for (const [path, text] of current) {
      const full = resolve(root, path);
      if (text === null) await rm(full, { force: true });
      else await writeFile(full, text);
    }
  };
  try {
    for (const path of paths) {
      const full = resolve(root, path);
      const was = await atBase(path);
      if (was === null) await rm(full, { force: true });
      else await writeFile(full, was);
    }
    await run('npx', ['vite', 'build'], { VITE_DEMO: '1' });
  } catch (error) {
    await restore();
    throw error;
  }
} else {
  await run('npx', ['vite', 'build'], { VITE_DEMO: '1' });
}

const app = await preview({ preview: { port: 0 } });
const base = `http://localhost:${app.httpServer.address().port}`;
const browser = await launchChromium();
const shots = [];

async function settle(page, path) {
  await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-app-root][data-boot="ready"]', { timeout: 30000 });
  if (await page.locator('[data-leave-setup]').count()) {
    await page.locator('[data-leave-setup]').click();
    await page.waitForSelector('[data-home-hello]');
    await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-app-root][data-boot="ready"]');
  }
}

/* The palette and theme are set through the app's own controls, after any
   state jump and never before: a demo reset writes the preferences back. */
async function setLook(page, theme) {
  await settle(page, '/settings');
  await page.locator(`[data-palette-pick="${PALETTE}"]`).click();
  await page.locator(`[data-segment="${theme}"]`).first().click();
  await page.waitForFunction((want) => document.documentElement.dataset.theme === want, theme);
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

/** A crop from the top of an element down a fixed number of CSS pixels: a
    printed page is one long column and the header is the only part of it
    this ticket touched. */
async function shootTop(page, selector, height, name) {
  await hideChrome(page);
  const box = await page.locator(selector).first().boundingBox();
  await page.screenshot({
    path: `${outDir}/${name}-${tag}.png`,
    clip: { x: box.x, y: box.y, width: box.width, height: Math.min(height, box.height) }
  });
  shots.push(`${name}-${tag}`);
  process.stdout.write(`  ${name}-${tag}\n`);
}

try {
  for (const theme of THEMES) {
    const page = await browser.newPage({ viewport: { width: 390, height: 1200 }, deviceScaleFactor: 2 });
    await setLook(page, theme);

    /* About. The row opens a sheet rather than a route, so this is a click
       and not a goto. */
    await settle(page, '/settings');
    await page.getByRole('button', { name: /^About/ }).first().click();
    await page.waitForSelector('[data-sheet]');
    await page.waitForTimeout(600); // the sheet's own rise (--dur-slow)
    await shoot(page, '[data-sheet]', `about-${theme}`);
    await page.close();
  }

  /* The two printed headers, once each. Paper is white and ink is dark
     whatever the app is wearing on screen (app.css's print block), so the
     theme is not a variable here. */
  const paper = await browser.newPage({ viewport: { width: 794, height: 1400 }, deviceScaleFactor: 2 });
  await setLook(paper, 'light');

  await settle(paper, '/health/clinician-summary');
  await paper.waitForSelector('[data-summary-page]');
  await paper.waitForSelector('[data-clinician-dossier]', { timeout: 15000 });
  await paper.emulateMedia({ media: 'print' });
  await paper.waitForTimeout(300);
  await shootTop(paper, '[data-summary-page]', 420, 'summary-print');

  await settle(paper, '/settings/journal-book');
  await paper.waitForSelector('[data-book-entry]', { timeout: 15000 });
  await paper.emulateMedia({ media: 'print' });
  await paper.waitForTimeout(300);
  await shootTop(paper, '.screen', 420, 'book-print');
  await paper.close();
} finally {
  await browser.close();
  await app.httpServer.close();
  if (restore) await restore();
}

process.stdout.write(`\n${shots.length} shots (${tag}) in ${outDir}\n`);
