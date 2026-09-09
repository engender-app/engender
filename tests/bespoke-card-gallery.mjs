/* Renders for carpet 30, the three bespoke `.card` variants and the tonal
   grounds, for sign-off.

   Only the surfaces this ticket changed, cropped to the surface. A review
   page of whole screens across a half-done redesign is unreviewable
   (Alicja, ticket 07's sign-off), so every scene here is one of the four
   decisions with enough of its neighbours to read it against.

   Two of the four scenes cannot be reached by a plain walk:

   - `/settings/reminders`'s check-in group is `isAndroid()`-gated with no
     demo bypass, so this pins that screen's own `isWeb` to false before
     building and puts the file back afterwards. That is carpet 28's
     `--pin-android` leg and `tests/unprompted-gallery.mjs`'s pattern, and
     the reason holds here too: forcing `isAndroid()` sends boot at the
     Android SQLite driver and the app never becomes ready, and a query
     parameter that forced the branch would be a backdoor shipped to
     production for the sake of a reading.
   - `/settings/export`'s two import previews only exist once a file has
     been picked, so both are driven through the real picker against a real
     `.daylio` backup and a real Daylio CSV. `--fixtures` points at a
     directory holding `fixture.daylio`; the CSV is written here.

   Run against a demo build, once per side. The before side has to be run
   with its own checkout as the *working directory*, not just as --root:
   vite's preview server resolves .svelte-kit/output relative to the cwd
   whatever root it is handed, so running it from here served this branch's
   build under the before tag and produced two identical columns.
     node tests/bespoke-card-gallery.mjs --tag after --out /abs/path \
       --fixtures /abs/fixtures
     cd /path/to/main && node /abs/path/to/tests/bespoke-card-gallery.mjs \
       --tag before --root /path/to/main --out /abs/path --fixtures /abs/fixtures
   An absolute --out outside either worktree is what survives them being
   removed after the merge. Each run builds once, with the pin in place. */
import { preview } from 'vite';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './browser-harness.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? args[at + 1] : fallback;
};
const tag = flag('tag', 'after');
const root = resolve(flag('root', resolve(here, '..')));
const outRoot = resolve(flag('out', resolve(here, '../.claude/carpet30')));
const outDir = resolve(outRoot, tag);
const fixtures = resolve(flag('fixtures', outRoot));
const THEMES = ['light', 'dark'];

/* The pin, exactly as carpet 28 spells it, and both spellings of the line
   it replaces so this works on either side of that ticket. */
const SCREEN = resolve(root, 'src/routes/settings/reminders/+page.svelte');
const PINNED = '  let isWeb = $derived(false && !isAndroid()); // pinned by tests/bespoke-card-gallery.mjs';
const original = await readFile(SCREEN, 'utf8');
const pinned = original.replace('  let isWeb = $derived(!isAndroid());', PINNED);
if (pinned === original) throw new Error(`could not pin isWeb in ${SCREEN}`);
await writeFile(SCREEN, pinned);

const build = () =>
  new Promise((done, fail) => {
    const child = spawn('npx', ['vite', 'build'], {
      cwd: root,
      stdio: 'inherit',
      env: { ...process.env, VITE_DEMO: '1' }
    });
    child.on('exit', (code) => (code === 0 ? done() : fail(new Error(`vite build exited ${code}`))));
  });

try {
  await build();
} finally {
  await writeFile(SCREEN, original);
}

/* A Daylio CSV, in the six columns `sources.ts` requires of one. Written
   rather than checked in for the same reason the `.daylio` fixture is built
   from a JSON literal: a readable record of the shape beats a binary. */
const CSV = resolve(outRoot, 'fixture.csv');
await mkdir(outRoot, { recursive: true });
await writeFile(
  CSV,
  'full_date,time,mood,activities,note_title,note\n' +
    '2026-03-01,9:15 AM,good,walk,,A morning that went fine.\n' +
    '2026-03-02,8:40 PM,meh,work | reading,,Long day.\n'
);

await mkdir(outDir, { recursive: true });
const browser = await launchChromium();
const app = await preview({ root, preview: { port: 0 } });
const base = `http://localhost:${app.httpServer.address().port}`;
const shots = [];
const errors = [];

let page;
const openContext = async () => {
  if (page) await page.close();
  page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  page.on('pageerror', (err) => errors.push(String(err)));
};

const settle = async (path) => {
  await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-app-root][data-boot="ready"]', { timeout: 30000 });
  if (await page.locator('[data-leave-setup]').count()) {
    await page.locator('[data-leave-setup]').click();
    await page.waitForSelector('[data-home-hello]');
    await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-app-root][data-boot="ready"]');
  }
};

const strip = () =>
  page.evaluate(() => {
    for (const bar of document.querySelectorAll('.demo-bar')) bar.remove();
    for (const toast of document.querySelectorAll('.toast, .toast-stack, [data-toast]')) toast.remove();
    if (!document.getElementById('carpet30-shot-css')) {
      const style = document.createElement('style');
      style.id = 'carpet30-shot-css';
      style.textContent =
        '[data-app-scroll-region]{scrollbar-width:none}[data-app-scroll-region]::-webkit-scrollbar{display:none}';
      document.head.append(style);
    }
  });

/* Palette and theme are one compound selector on the root, and a goto
   resets both, so this runs after the last navigation of a scene. */
const dress = async (palette, theme) => {
  await settle('/settings');
  await page.locator(`[data-palette-pick="${palette}"]`).click();
  await page.locator(`[data-segment="${theme}"]`).click();
  await page.waitForFunction(
    ([p, t]) => document.documentElement.dataset.palette === p && document.documentElement.dataset.theme === t,
    [palette, theme]
  );
};

/* The crop: the box of the first element `sel` matches, with `pad` px of the
   page around it, clamped to the app frame. The pad is what an unboxing is
   actually about - too tight and the page the surface now sits on is
   cropped off with it. */
const crop = async (name, sel, note, pad = 20) => {
  await strip();
  await page.waitForSelector(sel, { timeout: 9000, state: 'attached' }).catch(() => {});
  await page.waitForTimeout(600);
  const box = await page.evaluate(
    ([sel, pad]) => {
      const frame = document.querySelector('[data-app-root]').getBoundingClientRect();
      const el = document.querySelector(sel);
      if (!el) return null;
      const b = el.getBoundingClientRect();
      const x = Math.max(frame.x, b.x - pad);
      const y = Math.max(frame.y, b.y - pad);
      return {
        x,
        y,
        width: Math.min(b.right + pad, frame.right) - x,
        height: Math.min(b.bottom + pad, frame.bottom) - y
      };
    },
    [sel, pad]
  );
  if (!box || box.width < 8 || box.height < 8) {
    errors.push(`${name}: nothing matched ${sel}`);
    return;
  }
  await page.screenshot({ path: `${outDir}/${name}.png`, clip: box });
  shots.push({ name, sel, note });
};

/* Both sides in one call, so a scene cannot be shot against one selector on
   one side and forgotten on the other. */
const CHECKIN = tag === 'before' ? '.card.checkin-card' : '[data-checkin]';
const BREATHING = tag === 'before' ? '.card.breathing-card' : '.breathing-exercise';

for (const theme of THEMES) {
  await openContext();
  await dress('trans', theme);

  /* 1. The check-in group: a 1.5px --accent-border edge over a --surface
        ground, or three flush rows. Both dependent rows are on screen,
        which is the state the group is in by default. */
  await settle('/settings/reminders');
  await crop(`checkin-${theme}`, CHECKIN, 'the check-in group - /settings/reminders, Android');

  /* 2. The same group with the switch off, which is the state the box used
        to frame and `disclose` now opens out of. */
  const toggle = page.locator(`${CHECKIN} .switch`).first();
  if (await toggle.count()) {
    await toggle.click();
    await page.waitForTimeout(700);
    await crop(`checkin-off-${theme}`, CHECKIN, 'the check-in group, switched off');
    await toggle.click();
    await page.waitForTimeout(700);
  } else {
    errors.push(`checkin-off-${theme}: no switch inside ${CHECKIN}`);
  }

  /* 3. The breathing exercise, idle: the ring on the page, and the section
        heading /doubt draws above it in the same frame - the repeat the
        card had been keeping apart. */
  await settle('/doubt');
  await crop(`breathing-${theme}`, BREATHING, 'the breathing exercise at rest - /doubt', 24);

  /* 4. Running, which is the phase word and the count in the slot the
        pattern holds at rest. */
  const start = page.locator('[data-breathing-toggle]');
  if (await start.count()) {
    await start.click();
    await page.waitForTimeout(1400);
    await crop(`breathing-running-${theme}`, BREATHING, 'the breathing exercise running', 24);
  } else {
    errors.push(`breathing-running-${theme}: no toggle on /doubt`);
  }

  /* 5 and 6. The two import previews, each behind its own picker. The
        Daylio CSV sheet first, then the .daylio backup sheet. */
  await settle('/settings/export');
  for (const [name, open, pick, ready, sel] of [
    ['daylio-csv', '[data-daylio]', '[data-pick-daylio]', '[data-confirm-daylio]', '.card'],
    ['daylio-backup', '[data-daylio-backup]', '[data-pick-backup]', '[data-confirm-backup]', '.card']
  ]) {
    const trigger = page.locator(open).first();
    if (!(await trigger.count())) {
      errors.push(`${name}-${theme}: no ${open} on /settings/export`);
      continue;
    }
    await trigger.click();
    if (!(await page.locator(pick).count())) {
      errors.push(`${name}-${theme}: no ${pick} in the sheet`);
      await page.keyboard.press('Escape');
      continue;
    }
    const chooser = page.waitForEvent('filechooser');
    await page.locator(pick).click();
    await (await chooser).setFiles(name === 'daylio-csv' ? CSV : resolve(fixtures, 'fixture.daylio'));
    await page.waitForSelector(ready, { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(1200);
    await crop(`${name}-${theme}`, `[data-sheet] ${sel}`, `${name}'s preview - the tonal ground`, 14);
    await page.keyboard.press('Escape');
    await page.waitForSelector('[data-sheet]', { state: 'detached', timeout: 6000 }).catch(() => {});
  }
}

await writeFile(`${outDir}/manifest.json`, JSON.stringify({ tag, shots, errors }, null, 2));
await page.close();
await browser.close();
await app.close();
console.log(`${shots.length} shot(s) in ${outDir}`);
if (errors.length) {
  console.error(`${errors.length} problem(s):`);
  for (const e of errors) console.error(`  ${e}`);
}
