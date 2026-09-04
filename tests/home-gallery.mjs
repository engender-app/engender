/* Screenshots of Home at the three journal sizes it has to work at (phase 8
   UX ticket 01): day one, the middle, and a long journal.

   The middle is the point. Both ends are easy to design for - day one shows
   almost nothing and a long journal fills every block - and around forty
   entries, with two qualifying tiles and a week strip four sevenths full, is
   the shape nobody draws and everybody has for a month.

   Day one and the long journal both come out of the demo bar's own jumps.
   The middle has no jump, so this shortens the persona's own span for one
   build and puts the file back afterwards - the same trade
   tests/unprompted-gallery.mjs makes and for the same reason: a query
   parameter or a preference that forced the state would be a backdoor
   shipped to production for the sake of a screenshot.

   Trans only, in both themes (Alicja, 2026-09-04). The full 8 x 2 matrix is
   what the kit galleries are for.

   The two builds run as two child processes rather than one after the
   other in this one. Vite's preview server caches the built document in
   process, so a second `preview()` over a rebuilt `build/` served build
   one's index.html against build two's asset hashes and the app 404'd on
   its own entry point.

   Run: node tests/home-gallery.mjs [outDir]
   Default outDir is .claude/home-shots, which is gitignored and durable. It
   builds twice and restores the persona file either way. */
import { preview } from 'vite';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { launchChromium } from './browser-harness.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const outDir = resolve(process.argv[2] ?? resolve(root, '.claude/home-shots'));
/** `full`, `middle`, or absent to run both as children. */
const phase = process.argv[3] ?? '';
const PERSONA = resolve(root, 'src/lib/data/demo/persona.ts');

/* The middle: about forty entries and a week that is not completely full.
   Two edits, because the persona forces an entry on each of the last 22 days
   as well as running for 150 - leaving that in would give a shortened
   journal a solid week strip, and a week that is neither full nor empty is
   half of what makes the middle the middle. Five days rather than none,
   because with the run relaxed entirely the random gate left the last
   fortnight blank and the shot was a stale journal instead of a young
   one. */
const FULL_SPAN = 'for (let back = 150; back >= 0; back--) {';
const MIDDLE_SPAN = 'for (let back = 45; back >= 0; back--) { // shortened by tests/home-gallery.mjs';
const FULL_RUN = 'const isStreak = back <= 22;';
const MIDDLE_RUN = 'const isStreak = back <= 4; // relaxed by tests/home-gallery.mjs';
/* And the persona's second entry loop, a sparse year before the 150-day
   window, which is another ~145 entries. Shortening only the recent loop
   left the count at 183 and the count line saying "since Jan 2025", which
   is not a six-week-old journal by any reading. */
const FULL_YEAR = 'const yearEnd = Math.min(epochDayFromLocalDate(new Date(lastYear, 11, 31)), today - 151);';
const MIDDLE_YEAR = 'const yearEnd = yearStart - 1; // last year dropped by tests/home-gallery.mjs';

const THEMES = ['light', 'dark'];

const run = (command, args, env) =>
  new Promise((done, fail) => {
    const child = spawn(command, args, { cwd: root, stdio: 'inherit', env: { ...process.env, ...env } });
    child.on('exit', (code) => (code === 0 ? done() : fail(new Error(`${command} exited ${code}`))));
  });

const original = await readFile(PERSONA, 'utf8');
if (!original.includes(FULL_SPAN)) throw new Error('the persona no longer has the loop this script shortens');
if (!original.includes(FULL_RUN)) throw new Error('the persona no longer has the forced run this script relaxes');
if (!original.includes(FULL_YEAR)) throw new Error('the persona no longer has the year loop this script drops');

/* This edits a tracked source file, so it refuses to run over uncommitted
   work in it: the restore below writes `original` back, and `original` would
   be somebody's half-finished edit. */
const dirty = execFileSync('git', ['status', '--porcelain', '--', PERSONA], { cwd: root }).toString().trim();
if (dirty) throw new Error(`${PERSONA} has uncommitted changes - commit or stash them before shooting`);

await mkdir(outDir, { recursive: true });
const shots = [];

const restore = () => writeFileSync(PERSONA, original);
process.on('SIGINT', () => {
  restore();
  process.exit(130);
});
process.on('SIGTERM', () => {
  restore();
  process.exit(143);
});

/** One build, one browser, one set of shots. `shoot` is handed the page. */
async function withBuild(label, take) {
  await run('npx', ['vite', 'build'], { VITE_DEMO: '1' });

  const app = await preview({ preview: { port: 0 } });
  const base = `http://localhost:${app.httpServer.address().port}`;
  const browser = await launchChromium();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  page.on('pageerror', (e) => console.error(`[${label}] page error:`, e.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.error(`[${label}] console:`, msg.text());
  });

  const clearToasts = () =>
    page.evaluate(() => {
      for (const toast of document.querySelectorAll('[data-toast]')) toast.remove();
    });

  const settle = async (path) => {
    await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-app-root][data-boot="ready"]');
    if (await page.locator('[data-leave-setup]').count()) {
      await page.locator('[data-leave-setup]').click();
      await page.waitForSelector('[data-home-hello]');
      await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
      await page.waitForSelector('[data-app-root][data-boot="ready"]');
    }
    await clearToasts();
  };

  /* The whole screen in one image. Neither `fullPage` nor an element shot of
     [data-app-root] gets it: the document does not scroll, `main
     [data-app-scroll-region]` does, and an element shot of a scroll
     container is clipped to what is visible inside it. Growing the viewport
     to the content and shrinking it back keeps the layout the 390px one and
     makes only the height unreal.

     The demo bar goes first. It is review chrome, it is half the viewport at
     390px, and it is not in the build being signed off. */
  const shoot = async (name) => {
    await clearToasts();
    await page.evaluate(() => {
      document.querySelector('.demo-bar')?.remove();
      document.body.classList.remove('has-demo-bar');
    });
    const tall = await page.evaluate(() => {
      const scroller = document.querySelector('[data-app-scroll-region]');
      if (!scroller) return window.innerHeight;
      return Math.min(window.innerHeight + (scroller.scrollHeight - scroller.clientHeight) + 40, 8000);
    });
    await page.setViewportSize({ width: 390, height: tall });
    await page.waitForTimeout(250);
    await page.locator('[data-app-root]').screenshot({ path: `${outDir}/${name}.png` });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(150);
    shots.push(name);
  };

  /* Palette and theme are one compound selector and a page.goto resets a
     hand-set data-theme, so both are set from the real controls and then
     navigated away from.

     Always after the seeding, never before it: every demo jump runs
     `Object.assign(prefs, PREFERENCE_DEFAULTS, demoPreferences())`, so a
     theme picked first is thrown away by the reset and the dark shots come
     out light. */
  const dress = async (theme) => {
    await settle('/settings');
    await page.locator('[data-palette-pick="trans"]').click();
    await page.locator(`[data-segment="${theme}"]`).click();
    await page.waitForFunction((want) => document.documentElement.dataset.theme === want, theme);
  };

  try {
    await take({ page, settle, shoot, dress, label });
  } finally {
    await browser.close();
    await app.close();
  }
}

if (!phase) {
  /* The parent: one child per build, so each gets its own preview server.
     The persona is restored here as well as in the middle child, because a
     child that dies before its own `finally` would leave it shortened. */
  try {
    await run('node', [fileURLToPath(import.meta.url), outDir, 'full']);
    await run('node', [fileURLToPath(import.meta.url), outDir, 'middle']);
  } finally {
    restore();
  }
  console.log(`\nshots in ${outDir}`);
} else if (phase === 'full') {
  /* The persona at its full span. Day one and the long journal are both
     jumps from here. */
  await withBuild('full', async ({ page, settle, shoot, dress }) => {
    for (const theme of THEMES) {
      /* The long journal: the persona plus every other area, which is what
         puts enough tiles on Home for the cap to have something to do. The
         seeding resolves with a goto('/more'), so wait for that URL rather
         than navigating on top of a write still in flight. */
      await settle('/');
      await page.locator('[data-fill-every-feature]').click();
      await page.waitForURL('**/more');
      await dress(theme);
      await settle('/');
      await page.waitForSelector('[data-home-count]');
      await shoot(`home-long-${theme}`);

      // The fold, opened. Absent when three or fewer tiles qualify.
      if (await page.locator('[data-home-tiles-fold]').count()) {
        await page.locator('[data-home-tiles-fold]').click();
        await page.waitForTimeout(600);
        await shoot(`home-long-fold-open-${theme}`);
      }

      /* Day one: an empty journal, reached through the first-run jump and
         then out of onboarding by its own escape. */
      await settle('/');
      await page.selectOption('#demo-jump', 'first-run');
      await page.waitForSelector('[data-leave-setup]');
      await page.locator('[data-leave-setup]').click();
      await page.waitForSelector('[data-home-hello]');
      await page.waitForTimeout(400);
      await shoot(`home-day-one-${theme}`);
    }
  });
} else {
  /* The persona shortened to about forty entries. */
  try {
    await writeFile(
      PERSONA,
      original.replace(FULL_SPAN, MIDDLE_SPAN).replace(FULL_RUN, MIDDLE_RUN).replace(FULL_YEAR, MIDDLE_YEAR)
    );
    await withBuild('middle', async ({ page, settle, shoot, dress }) => {
      for (const theme of THEMES) {
        /* The persona alone, not "Fill every feature": the middle is a
           journal somebody has been keeping for six weeks, and layering
           every other area onto it puts the long journal's tile set back on
           the screen. */
        await settle('/');
        await page.getByRole('button', { name: 'Reset demo state' }).click();
        await page.waitForSelector('[data-home-count]');
        /* The reset is not awaited by the click, and the persona is seeded
           oldest day first, so a fixed pause photographs a journal that has
           only been written up to some day in the middle. Waiting for the
           count line to stop changing waits for the last write. */
        let previous = null;
        for (let tick = 0; tick < 40; tick += 1) {
          const now = await page.locator('[data-home-count]').textContent();
          if (now && now === previous) break;
          previous = now;
          await page.waitForTimeout(400);
        }
        await dress(theme);
        await settle('/');
        await shoot(`home-middle-${theme}`);
      }
    });
  } finally {
    restore();
  }
}

if (phase) {
  console.log(`\n${shots.length} shot(s) in ${outDir}`);
  for (const shot of shots) console.log(`  ${shot}.png`);
}
