/* Sign-off shots for ticket 56 ("hair removal and cycle events take the
   strip"). Crops of what the ticket changed and nothing else: what leads
   each screen under its header, the strip and the present reading on their
   own. The recency figures, the cycle chart and the rest of both screens
   are untouched and are not shot - the same split day-strip-gallery.mjs
   (ticket 44) drew for dilation and wear.

   Trans, light and dark, and nothing else - the eight-palette cross product
   is a test concern (tests/palette-contrast.test.ts), not a thing to look
   through by eye.

   'before' is rendered from the ticket branch's own base commit rather than
   from git history read live, so a worktree that has moved past that commit
   can still produce it: the two files this ticket touched are swapped for
   their base content, built, shot, and put back even if the run fails.

   Run: node tests/hair-removal-cycle-strip-gallery.mjs before [outDir]
        node tests/hair-removal-cycle-strip-gallery.mjs after [outDir]
   Default outDir is .claude/hair-removal-cycle-strip-shots, gitignored and
   durable. */
import { preview } from 'vite';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { launchChromium } from './browser-harness.mjs';

const tag = process.argv[2];
if (tag !== 'before' && tag !== 'after') {
  console.error('Usage: node tests/hair-removal-cycle-strip-gallery.mjs <before|after> [outDir]');
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const outDir = resolve(process.argv[3] ?? resolve(root, '.claude/hair-removal-cycle-strip-shots'));
const BASE_COMMIT = 'fd12958f'; // the ticket branch's own base
const CHANGED = ['src/routes/body/hair-removal/+page.svelte', 'src/routes/health/cycle-events/+page.svelte'];

const THEMES = ['light', 'dark'];
const PALETTE = 'trans';
const SCREENS = [
  ['hair-removal', '/body/hair-removal'],
  ['cycle-events', '/health/cycle-events']
];

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
  const current = new Map();
  for (const path of CHANGED) current.set(path, await readFile(resolve(root, path), 'utf8'));
  try {
    for (const path of CHANGED) await writeFile(resolve(root, path), await git(['show', `${BASE_COMMIT}:${path}`]));
    await run('npx', ['vite', 'build'], { VITE_DEMO: '1' });
  } finally {
    for (const [path, content] of current) await writeFile(resolve(root, path), content);
  }
} else {
  await run('npx', ['vite', 'build'], { VITE_DEMO: '1' });
}

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

/* The demo bar and the persona's storage warning sit over the top of every
   screen otherwise, which is what the shot is of. */
const strip = async () => {
  await page.evaluate(() => {
    for (const bar of document.querySelectorAll('.demo-bar')) bar.remove();
    document.body.classList.remove('has-demo-bar');
    for (const toast of document.querySelectorAll('[data-toast]')) toast.remove();
    document.activeElement?.blur?.();
  });
  await page.mouse.move(0, 0);
  await page.waitForTimeout(150);
};

/** A crop from the top of the screen's first block, so before and after are
    the same cut of the same screen whatever is inside it. */
const leadBox = () =>
  page.evaluate(() => {
    const part = document.querySelector('.screen .screen-part');
    if (!part) return null;
    const box = part.getBoundingClientRect();
    return { x: 0, y: Math.max(0, Math.round(box.top) - 8), width: 390, height: 520 };
  });

const shots = [];
const shoot = async (name, clip) => {
  if (!clip) return;
  await page.screenshot({ path: `${outDir}/${name}.png`, clip });
  shots.push(name);
};

try {
  await settle('/');
  await page.locator('[data-fill-every-feature]').click();
  await page.waitForURL('**/more', { timeout: 180000 });
  await page.waitForTimeout(2000);

  for (const theme of THEMES) {
    await settle('/settings');
    await page.locator(`[data-palette-pick="${PALETTE}"]`).click();
    await page.locator(`[data-segment="${theme}"]`).click();
    await page.waitForFunction((want) => document.documentElement.dataset.theme === want, theme);

    for (const [name, path] of SCREENS) {
      await settle(path);
      await page.waitForFunction(() => !document.querySelector('[data-skeleton]'), null, { timeout: 15000 });
      await page.waitForTimeout(700);
      await strip();
      await shoot(`${name}-lead-${tag}-${theme}`, await leadBox());

      /* The block that leads the screen, cropped to whatever fits one
         viewport under the header: the present reading (recovery notice and
         recency, on hair removal; the strip and Today, on cycle events).
         Before, it is whatever stood in that place. */
      const readingBox = await page.evaluate(() => {
        const lead = document.querySelector('.screen .screen-part');
        if (!lead) return null;
        const box = lead.getBoundingClientRect();
        return {
          x: 0,
          y: Math.max(0, Math.round(box.top) - 12),
          width: 390,
          height: Math.min(700, Math.round(box.height) + 24)
        };
      });
      await shoot(`${name}-reading-${tag}-${theme}`, readingBox);

      /* The strip itself, scrolled into view: on hair removal (ticket 56's
         own review round put the recency reading above it) this is well
         past one viewport, so it needs its own shot rather than sharing the
         band above. A no-op scroll where the strip is already on screen
         (cycle events, and hair removal's own "before" run). */
      const stripBox = await page.evaluate(() => {
        const strip = document.querySelector('.day-strip');
        if (!strip) return null;
        strip.scrollIntoView({ block: 'start', behavior: 'instant' });
        const box = strip.getBoundingClientRect();
        /* Walked forward from the strip's own next sibling rather than
         `parentElement.querySelector`: hair removal's reorder (ticket 56's
         own review round) put a recency `.kit-list` before the strip in the
         same screen-part, and a plain querySelector would find that one
         instead of the log's, giving a negative height. */
        let bottomMarker = strip.nextElementSibling;
        while (bottomMarker && !bottomMarker.matches('.kit-list, [data-strip-week-empty]')) {
          bottomMarker = bottomMarker.nextElementSibling;
        }
        const bottom = bottomMarker ? bottomMarker.getBoundingClientRect().bottom : box.bottom + 260;
        return {
          x: 0,
          y: Math.max(0, Math.round(box.top) - 12),
          width: 390,
          height: Math.min(700, Math.round(bottom - box.top) + 24)
        };
      });
      if (stripBox) {
        await strip();
        await shoot(`${name}-strip-${tag}-${theme}`, stripBox);
      }
    }
  }
} finally {
  await browser.close();
  await app.close();
}

console.log(`\n${shots.length} shots in ${outDir}`);
for (const shot of shots) console.log(`  ${shot}.png`);
