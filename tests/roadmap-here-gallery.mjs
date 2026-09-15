/* Sign-off shots for ticket 54 ("the roadmap says where you are"). Crops of
   the one thing the ticket changed - what a person sees before scrolling -
   before and after, in the trans palette, light and dark. No full-screen
   shots: the pack's own goal rows are untouched, and rule 16 is entirely
   about what leads the screen rather than what is on it.

   'before' is rendered from the ticket's own base commit (recorded in the
   ticket file) rather than from git history read live, so the shot is
   reproducible from a worktree that has already moved past that commit.
   The route file is swapped on disk for the one build that needs it and
   always restored, in a try/finally, before this exits either way.

   Run: node tests/roadmap-here-gallery.mjs [outDir]
   Default outDir is .claude/roadmap-here-shots, which is gitignored and durable. */
import { preview } from 'vite';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { launchChromium } from './browser-harness.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const outDir = resolve(process.argv[2] ?? resolve(root, '.claude/roadmap-here-shots'));
const ROUTE = resolve(root, 'src/routes/transition/roadmap/+page.svelte');
const BASE_COMMIT = 'a6f14e86'; // the ticket branch's own base, per its file

const THEMES = ['light', 'dark'];
const PALETTE = 'trans';

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
const shots = [];
const currentRoute = await readFile(ROUTE, 'utf8');

const shootTag = async (tag) => {
  await run('npx', ['vite', 'build'], { VITE_DEMO: '1' });
  const app = await preview({ preview: { port: 0 } });
  const base = `http://localhost:${app.httpServer.address().port}`;
  const browser = await launchChromium();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });

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
    for (const theme of THEMES) {
      await settle('/settings');
      await page.locator(`[data-palette-pick="${PALETTE}"]`).click();
      await page.locator(`[data-segment="${theme}"]`).click();
      await page.waitForFunction((want) => document.documentElement.dataset.theme === want, theme);

      await settle('/transition/roadmap');
      await page.waitForSelector('[data-goal]');
      await page.waitForTimeout(400);
      await page.evaluate(() => {
        for (const bar of document.querySelectorAll('.demo-bar')) bar.remove();
        document.body.classList.remove('has-demo-bar');
      });
      await page.waitForTimeout(150);

      const name = `roadmap-here-${tag}-${theme}`;
      // Not fullPage: what leads the screen without scrolling is the whole
      // point, and 'before' this ticket that is several thousand px longer.
      await page.screenshot({ path: `${outDir}/${name}.png` });
      shots.push(name);
    }
  } finally {
    await browser.close();
    await app.close();
  }
};

try {
  const beforeContent = await git(['show', `${BASE_COMMIT}:src/routes/transition/roadmap/+page.svelte`]);
  await writeFile(ROUTE, beforeContent);
  await shootTag('before');
} finally {
  // Restored before 'after' runs and even if 'before' itself threw, so a
  // failed run never leaves the ticket's own route file swapped out.
  await writeFile(ROUTE, currentRoute);
}

await shootTag('after');

console.log(`\n${shots.length} shots in ${outDir}`);
for (const shot of shots) console.log(`  ${shot}.png`);
