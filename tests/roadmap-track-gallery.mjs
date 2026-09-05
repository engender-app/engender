/* Screenshots of the transition roadmap's per-track "not my path" (phase 8
   features ticket 49 item 5): the ordinary screen, one track folded, and
   two folded, in the trans palette in both themes.

   No source file is patched and nothing is forced: the control is on the
   screen for every journal, so this drives it the way a person does.

   Run: node tests/roadmap-track-gallery.mjs [outDir]
   Default outDir is .claude/roadmap-shots, which is gitignored and durable. */
import { preview } from 'vite';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { launchChromium } from './browser-harness.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const outDir = resolve(process.argv[2] ?? resolve(root, '.claude/roadmap-shots'));

const THEMES = ['light', 'dark'];
const PALETTE = 'trans';

const run = (command, args, env) =>
  new Promise((done, fail) => {
    const child = spawn(command, args, { cwd: root, stdio: 'inherit', env: { ...process.env, ...env } });
    child.on('exit', (code) => (code === 0 ? done() : fail(new Error(`${command} exited ${code}`))));
  });

await mkdir(outDir, { recursive: true });
const shots = [];

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
  await page.evaluate(() => {
    for (const toast of document.querySelectorAll('[data-toast]')) toast.remove();
  });
};

/* Not `fullPage`: the app scrolls inside [data-app-root], so a full-page
   capture gets one viewport and a lot of nothing.

   The demo bar goes first. It is a quarter of a 390x844 frame and none of
   it is the app, which matters here because these shots are for looking at
   rather than for diffing. Removed per shot rather than once, since the
   screen re-renders it after a navigation. */
const shoot = async (name) => {
  await page.evaluate(() => {
    for (const bar of document.querySelectorAll('.demo-bar')) bar.remove();
    document.body.classList.remove('has-demo-bar');
  });
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${outDir}/${name}.png` });
  shots.push(name);
};

const scrollTo = async (top) => {
  await page.evaluate((to) => {
    document.querySelector('[data-app-scroll-region]')?.scrollTo({ top: to });
  }, top);
  await page.waitForTimeout(300);
};

const toggle = async (track) => {
  await page.locator(`[data-track-toggle="${track}"]`).click();
  await page.waitForTimeout(700);
};

try {
  for (const theme of THEMES) {
    /* Palette and theme are one compound selector, and a page.goto resets a
       hand-set data-theme, so both are set from the real controls and then
       navigated away from. */
    await settle('/settings');
    await page.locator(`[data-palette-pick="${PALETTE}"]`).click();
    await page.locator(`[data-segment="${theme}"]`).click();
    await page.waitForFunction((want) => document.documentElement.dataset.theme === want, theme);

    await settle('/transition/roadmap');
    await page.waitForSelector('[data-track-toggle="social"]');

    await shoot(`roadmap-top-${theme}`);
    await scrollTo(560);
    await shoot(`roadmap-heading-and-rows-${theme}`);

    /* Social first, because it is the shortest track and its heading, its
       folded line and the next heading all fit in one frame. */
    await scrollTo(0);
    await toggle('social');
    await shoot(`roadmap-one-folded-${theme}`);

    await toggle('legal');
    await shoot(`roadmap-two-folded-${theme}`);

    // And back, so the shot proves the ticks were waiting underneath.
    await toggle('social');
    await toggle('legal');
    await shoot(`roadmap-restored-${theme}`);
  }
} finally {
  await browser.close();
  await app.close();
}

console.log(`\n${shots.length} shots in ${outDir}`);
for (const shot of shots) console.log(`  ${shot}.png`);
