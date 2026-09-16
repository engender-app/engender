/* How tall the roadmap is, measured (phase 10 redesign ticket 54).

   The audit's own number is 6231px at 390px wide, on the demo journal with
   every feature filled - the longest screen in the app, and the one this
   ticket exists to shorten. The acceptance asks for the same measurement
   before and after.

   Takes a tag, `before` or `after`, and does one build and one measurement
   per run - two invocations rather than one process doing both, the same
   split direction-swing-gallery.mjs already uses for a before/after pair,
   since a single process building twice in a row left the second `vite
   preview` server answering `networkidle` without ever reaching
   `[data-boot="ready"]` (Playwright showed no console error, no failed
   request and no page error - the built site was fine standalone, so
   whatever the first in-process build leaves behind is process state, not
   markup). `before` swaps the route file for the ticket's own base commit,
   builds, measures and restores the file before it exits, even on failure.

   Run: node tests/roadmap-height.mjs before
        node tests/roadmap-height.mjs after */
import { preview } from 'vite';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { launchChromium } from './browser-harness.mjs';

const tag = process.argv[2];
if (tag !== 'before' && tag !== 'after') {
  console.error('Usage: node tests/roadmap-height.mjs <before|after>');
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const ROUTE = resolve(root, 'src/routes/transition/roadmap/+page.svelte');
const BASE_COMMIT = 'a6f14e86';

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

if (tag === 'before') {
  const currentRoute = await readFile(ROUTE, 'utf8');
  const beforeContent = await git(['show', `${BASE_COMMIT}:src/routes/transition/roadmap/+page.svelte`]);
  try {
    await writeFile(ROUTE, beforeContent);
    await run('npx', ['vite', 'build'], { VITE_DEMO: '1' });
  } finally {
    await writeFile(ROUTE, currentRoute);
  }
} else {
  await run('npx', ['vite', 'build'], { VITE_DEMO: '1' });
}

const app = await preview({ preview: { port: 0 } });
const base = `http://localhost:${app.httpServer.address().port}`;
const browser = await launchChromium();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });

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

try {
  // Every feature filled - the journal the audit's 6231px was measured on.
  await settle('/');
  await page.locator('[data-fill-every-feature]').click();
  await page.waitForURL('**/more', { timeout: 60000 });

  await settle('/transition/roadmap');
  await page.evaluate(() => {
    document.querySelector('.demo-bar')?.remove();
    document.body.classList.remove('has-demo-bar');
  });
  await page.waitForTimeout(1200);

  const height = await page.evaluate(() => {
    const main = document.querySelector('.app-main') ?? document.scrollingElement;
    return Math.round(main.scrollHeight);
  });

  console.log(`\n390x844, demo journal with every feature filled, /transition/roadmap scrollHeight (${tag})\n`);
  console.log(`  ${height}px`);
} finally {
  await browser.close();
  await app.close();
}
