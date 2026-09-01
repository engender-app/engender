/* Screenshots of the two views over the unprompted registry (phase 6 ticket
   04): the notifications view and the surfaces view it was split out of.

   The notifications view is Android-only by design - its entries are absent
   on web rather than shown and inert - so a plain web build shows only the
   notice that says so. To photograph the rows themselves this script pins
   the screen's own `isWeb` to false, builds, takes the pictures, and puts
   the file back. The alternative would be a query parameter or a preference
   that forces the Android branch, which is a backdoor shipped to production
   for the sake of a screenshot.

   Only that one `$derived` is patched, not `isAndroid()` itself: forcing the
   whole platform sends boot at the Android SQLite driver and the app never
   becomes ready, so nothing renders to photograph. What the shots therefore
   show is the screen's Android branch drawn by a web build - real rows, real
   preferences, real switches, with the notification-permission notice absent
   because no plugin answers here.

   Run: node tests/unprompted-gallery.mjs [outDir]
   Default outDir is .claude/unprompted-shots, which is gitignored and
   durable. It rebuilds twice and restores the screen file either way. */
import { preview } from 'vite';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { launchChromium } from './browser-harness.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const outDir = resolve(process.argv[2] ?? resolve(root, '.claude/unprompted-shots'));
const SCREEN = resolve(root, 'src/routes/settings/notifications/+page.svelte');

const THEMES = ['dark', 'light'];
const PALETTES = ['trans', 'nonbinary'];

const run = (command, args, env) =>
  new Promise((done, fail) => {
    const child = spawn(command, args, { cwd: root, stdio: 'inherit', env: { ...process.env, ...env } });
    child.on('exit', (code) => (code === 0 ? done() : fail(new Error(`${command} exited ${code}`))));
  });

const original = await readFile(SCREEN, 'utf8');
const forced = original.replace(
  'let isWeb = $derived(!isAndroid());',
  'let isWeb = $derived(false && !isAndroid()); // pinned by tests/unprompted-gallery.mjs'
);
if (forced === original) throw new Error('the notifications screen no longer has the shape this script patches');

/* This is the only gallery that edits a tracked source file, so it refuses
   to run over uncommitted work in it: the restore below writes `original`
   back, and `original` would be somebody's half-finished edit. */
const dirty = execFileSync('git', ['status', '--porcelain', '--', SCREEN], { cwd: root }).toString().trim();
if (dirty) throw new Error(`${SCREEN} has uncommitted changes - commit or stash them before shooting`);

await mkdir(outDir, { recursive: true });
const shots = [];

/* `finally` covers a throw; a Ctrl-C is a signal and skips it, which would
   leave the pinned file on disk. */
const restore = () => writeFileSync(SCREEN, original);
process.on('SIGINT', () => {
  restore();
  process.exit(130);
});
process.on('SIGTERM', () => {
  restore();
  process.exit(143);
});

try {
  await writeFile(SCREEN, forced);
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
     capture gets one viewport and a lot of nothing. Anything taller than the
     phone is shot twice, from the top and from the foot. */
  const shoot = async (name) => {
    await page.evaluate(() => {
      for (const toast of document.querySelectorAll('[data-toast]')) toast.remove();
    });
    await page.screenshot({ path: `${outDir}/${name}.png` });
    shots.push(name);
  };

  const scrollTo = async (where) => {
    await page.evaluate((to) => {
      const root = document.querySelector('[data-app-root]');
      const scroller = root?.querySelector('[data-screen]')?.parentElement ?? root;
      const target = to === 'foot' ? (scroller?.scrollHeight ?? 0) : 0;
      scroller?.scrollTo({ top: target });
      window.scrollTo({ top: to === 'foot' ? document.body.scrollHeight : 0 });
    }, where);
    await page.waitForTimeout(300);
  };

  for (const palette of PALETTES) {
    for (const theme of THEMES) {
      /* Palette and theme are one compound selector, and a page.goto resets
         a hand-set data-theme, so both are set from the real controls and
         then navigated away from. */
      await settle('/settings');
      await page.locator(`[data-palette-pick="${palette}"]`).click();
      await page.locator(`[data-segment="${theme}"]`).click();
      await page.waitForFunction((want) => document.documentElement.dataset.theme === want, theme);

      await settle('/settings/notifications');
      await page.waitForSelector('[data-notification="reminders"]');
      await shoot(`notifications-${palette}-${theme}`);
      await scrollTo('foot');
      await shoot(`notifications-foot-${palette}-${theme}`);
      await scrollTo('top');

      // Quiet hours open, which is the screen's one reveal.
      await scrollTo('foot');
      await page.locator('[data-quiet-hours]').getByRole('switch').click();
      await page.waitForTimeout(600);
      await scrollTo('foot');
      await shoot(`notifications-quiet-open-${palette}-${theme}`);

      // Every kind switched off, which is what "off means off" looks like.
      for (const key of ['reminders', 'check-in', 'wear-elapsed', 'export-failure']) {
        const row = page.locator(`[data-notification="${key}"]`);
        if ((await row.getByRole('switch').getAttribute('aria-checked')) === 'true') {
          await row.getByRole('switch').click();
        }
      }
      await page.waitForTimeout(400);
      await scrollTo('top');
      await shoot(`notifications-all-off-${palette}-${theme}`);

      // And back on, so the next pass starts where this one did.
      for (const key of ['reminders', 'wear-elapsed', 'export-failure']) {
        await page.locator(`[data-notification="${key}"]`).getByRole('switch').click();
      }
      await page.locator('[data-quiet-hours]').getByRole('switch').click();

      await settle('/settings/live-tiles');
      await page.waitForSelector('[data-live-tile="wrapped"]');
      await shoot(`surfaces-${palette}-${theme}`);
      await scrollTo('foot');
      await shoot(`surfaces-foot-${palette}-${theme}`);

      await settle('/settings');
      await page.locator('[data-list-row="notifications"]').scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);
      await shoot(`settings-two-rows-${palette}-${theme}`);
    }
  }

  await page.close();
  await browser.close();
  await app.close();
} finally {
  await writeFile(SCREEN, original);
  // Left as a plain demo build, which is what every other browser check in
  // the repo expects to find in build/.
  await run('npx', ['vite', 'build'], { VITE_DEMO: '1' });
}

console.log(`\n${shots.length} shots in ${outDir}`);
for (const name of shots) console.log(`  ${name}.png`);
