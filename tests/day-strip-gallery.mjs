/* Sign-off shots for ticket 44 ("the day strip reaches dilation and wear").
   Crops of what the ticket changed and nothing else: what leads each screen
   under its header, the strip and the present reading on their own, and one
   page back through the strip. The trend charts, the schedule editor and
   the rest of both screens are untouched and are not shot.

   Trans, light and dark, and nothing else - the eight-palette cross product
   is a test concern (tests/palette-contrast.test.ts,
   tests/day-strip-measure.mjs), not a thing to look through by eye.

   'before' is rendered from the ticket's own base commit rather than from
   git history read live, so a worktree that has moved past that commit can
   still produce it: the four files this ticket touched are swapped for
   their base content, built, shot, and put back even if the run fails. One
   build per invocation, the same split tests/roadmap-here-gallery.mjs uses -
   two builds in one process ran the second `vite preview` into a server
   that answered networkidle without ever reaching `[data-boot="ready"]`.

   Run: node tests/day-strip-gallery.mjs before [outDir]
        node tests/day-strip-gallery.mjs after [outDir]
   Default outDir is .claude/day-strip-shots, which is gitignored and durable. */
import { preview } from 'vite';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { launchChromium } from './browser-harness.mjs';

const tag = process.argv[2];
if (tag !== 'before' && tag !== 'after') {
  console.error('Usage: node tests/day-strip-gallery.mjs <before|after> [outDir]');
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const outDir = resolve(process.argv[3] ?? resolve(root, '.claude/day-strip-shots'));
const BASE_COMMIT = 'd7d8e81f'; // the ticket branch's own base
const CHANGED = [
  'src/routes/health/dilation/+page.svelte',
  'src/routes/practice/wear/+page.svelte',
  'src/lib/components/kit/BareStrip.svelte',
  'src/lib/styles/kit.css'
];

const THEMES = ['light', 'dark'];
const PALETTE = 'trans';
const SCREENS = [
  ['dilation', '/health/dilation'],
  ['wear', '/practice/wear']
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
   screen otherwise, which is what the shot is of; and a pager clicked to
   reach an earlier week keeps the focus ring it was given, which reads in
   a still as a control stuck in a state. */
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

/** A crop from the top of the screen's first block, so before and after
    are the same cut of the same screen whatever is inside it. */
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

      /* The block that leads the screen, cropped to its own height rather
         than to a fixed band: after, that is the strip and the present
         reading; before, it is whatever stood in that place. Shot on both
         runs, so the one surface this ticket adds has a before to be read
         against and not only the 520px context band above. */
      const readingBox = await page.evaluate(() => {
        const head = document.querySelector('.day-strip');
        const lead = head ?? document.querySelector('.screen .screen-part');
        if (!lead) return null;
        const card = head
          ? head.parentElement?.querySelector('.kit-list')
          : lead.querySelector('.kit-list, .kit-notice');
        const top = lead.getBoundingClientRect().top;
        const bottom = (card ?? lead).getBoundingClientRect().bottom;
        return {
          x: 0,
          y: Math.max(0, Math.round(top) - 12),
          width: 390,
          height: Math.min(700, Math.round(bottom - top) + 24)
        };
      });
      await shoot(`${name}-reading-${tag}-${theme}`, readingBox);

      if (tag !== 'after') continue;

      /* And a page back, which is where the third cell state lives on
         dilation: a day the taper expected and nothing was logged on. */
      for (let back = 0; back < 3; back++) {
        if (!(await page.locator('[data-strip-earlier]').isEnabled())) break;
        await page.locator('[data-strip-earlier]').click();
        await page.waitForTimeout(450);
      }
      await strip();
      await shoot(`${name}-paged-after-${theme}`, await leadBox());
    }
  }
} finally {
  await browser.close();
  await app.close();
}

console.log(`\n${shots.length} shots in ${outDir}`);
for (const shot of shots) console.log(`  ${shot}.png`);
