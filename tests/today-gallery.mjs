/* Renders for Today (phase 10 redesign ticket 13), for sign-off.

   Only what the ticket changed, in crops rather than whole screens (Alicja,
   on ticket 07's sign-off). What changed is everything under the field and
   its foot: the agenda where the mood pick used to be, the notices under
   it, the log strip with the faces and the four write shapes, and the
   pinned rows where the milestones, the week and the recent entries were.
   The field, the foot and the tiles are shot only where they frame a band.

   The demo persona's dated things all fall past the agenda's week, so the
   script writes what the week needs through the app's own editors first:
   two appointments (three and six days out), then "Fill every feature",
   whose weekly injection schedule puts a dose slot in the window and
   whose fourth letter does not, so the band carries three kinds and,
   with a third appointment, folds.

   Scenes: the top of Today per palette and theme (field through the log
   strip); the agenda band alone, folded and opened; the log strip alone
   with a wear session running; the pinned rows; the notices under the
   agenda; day one; disguise; 320, 195 (200% zoom) and the 1280 shell.

   Run against a demo build:
     VITE_DEMO=1 npm run build
     node tests/today-gallery.mjs --tag after --out /abs/dir

   `--tag before` against another checkout's build shoots the two crops a
   before has (the top of Today, the band under the header). vite's
   `preview({ root })` serves the cwd's build, so run it with that checkout
   as the cwd:
     node -e "process.chdir('/path/to/main'); process.argv.push('--','--tag','before','--out','/abs/dir'); import('/abs/tests/today-gallery.mjs')"
   (the leading '--' stands where a script path would, since the flags are
   read from argv[2] on). */
import { preview } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';
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
const outDir = resolve(flag('out', resolve(here, '../.claude/today-shots')), tag);
const PALETTES = flag('palettes', 'trans,nonbinary,rainbow,agender').split(',');
const THEMES = ['light', 'dark'];

await mkdir(outDir, { recursive: true });
const browser = await launchChromium();
const app = await preview({ preview: { port: 0 } });
const base = `http://localhost:${app.httpServer.address().port}`;
const shots = [];
const errors = [];

let page = await browser.newPage({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 2 });
const watch = (p) => p.on('pageerror', (err) => errors.push(String(err)));
watch(page);

const reopen = async (width, scale) => {
  await page.close();
  page = await browser.newPage({ viewport: { width, height: width > 800 ? 1000 : 900 }, deviceScaleFactor: scale });
  watch(page);
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

const strip = async () => {
  await page.mouse.move(4, 4);
  return page.evaluate(() => {
    for (const toast of document.querySelectorAll('[data-toast]')) toast.remove();
    for (const bar of document.querySelectorAll('.demo-bar')) bar.remove();
    document.body.classList.remove('has-demo-bar');
    if (!document.getElementById('today-shot-css')) {
      const style = document.createElement('style');
      style.id = 'today-shot-css';
      style.textContent =
        '[data-app-scroll-region]{scrollbar-width:none}[data-app-scroll-region]::-webkit-scrollbar{display:none}';
      document.head.append(style);
    }
  });
};

/** From the app frame's top edge to `extra` px under the first of `until`'s
    selectors that matches, in document order of the list. */
const cropTop = async (name, until, extra = 20, note = '') => {
  await strip();
  await page.waitForTimeout(700);
  const box = await page.evaluate(
    ([selectors, pad]) => {
      const frame = document.querySelector('[data-app-root]').getBoundingClientRect();
      const el = [].concat(selectors).map((s) => document.querySelector(s)).find(Boolean);
      if (!el) return null;
      const bottom = el.getBoundingClientRect().bottom;
      return { x: frame.x, y: frame.y, width: frame.width, height: Math.min(bottom - frame.y + pad, frame.height) };
    },
    [until, extra]
  );
  if (!box) {
    errors.push(`${name}: nothing matched ${[].concat(until).join(' / ')}`);
    return;
  }
  await page.screenshot({ path: `${outDir}/${name}.png`, clip: box });
  shots.push({ name, note });
};

/** A band of the screen from `from`'s top to `to`'s bottom, scrolled into
    view first. */
const cropBand = async (name, from, to, note = '', last = false) => {
  await strip();
  await page.locator(from)[last ? 'last' : 'first']().scrollIntoViewIfNeeded();
  await page.waitForTimeout(700);
  const box = await page.evaluate(
    ([a, b, useLast]) => {
      const pick = (sel, wantLast) => {
        const all = document.querySelectorAll(sel);
        return (wantLast ? all[all.length - 1] : all[0])?.getBoundingClientRect();
      };
      const frame = document.querySelector('[data-app-root]').getBoundingClientRect();
      const head = pick(a, useLast);
      const foot = pick(b, useLast);
      if (!head || !foot) return null;
      const top = Math.max(head.top - 12, frame.top);
      return { x: frame.x, y: top, width: frame.width, height: Math.min(foot.bottom - top + 16, frame.bottom - top) };
    },
    [from, to, last]
  );
  if (!box) {
    errors.push(`${name}: nothing matched ${from} / ${to}`);
    return;
  }
  await page.screenshot({ path: `${outDir}/${name}.png`, clip: box });
  shots.push({ name, note });
};

const dress = async (palette, theme) => {
  await settle('/settings');
  await page.locator(`[data-palette-pick="${palette}"]`).click();
  await page.locator(`[data-segment="${theme}"]`).click();
  await page.waitForFunction(
    ([p, t]) => document.documentElement.dataset.palette === p && document.documentElement.dataset.theme === t,
    [palette, theme]
  );
};

const seed = async () => {
  await settle('/');
  await page.locator('[data-fill-every-feature]').click();
  await page.waitForURL('**/more', { timeout: 180000 });
  await page.waitForTimeout(2000);
};

const iso = (offsetDays) => {
  const day = new Date();
  day.setDate(day.getDate() + offsetDays);
  return day.toISOString().slice(0, 10);
};

/** One appointment through the appointments screen's own editor, exactly
    as day-ahead-gallery.mjs writes it. */
const addAppointment = async (offsetDays, kind) => {
  await settle('/health/appointments');
  await page.locator('[data-add]').click();
  await page.waitForSelector('#appointment-kind');
  await page.$eval('#appointment-date', (input, value) => input._flatpickr.setDate(value, true), iso(offsetDays));
  await page.fill('#appointment-kind', kind);
  await page.locator('[data-save-appointment]').click();
  await page.waitForTimeout(500);
};

/** Home, settled, with the wear timer stopped if a scene left it running,
    so every top crop shows the strip at rest. */
const home = async () => {
  await settle('/');
  await page.waitForSelector('[data-home-hello]');
};

/** The top of Today: field, foot, the agenda, the notice, the log strip.
    A before build has no strip; its mood row stands where the strip ends. */
const top = (name, note) => cropTop(name, ['[data-home-log]', '[data-mood-chips]'], 20, note);

try {
  await seed();
  await addAppointment(3, 'Endocrinologist');
  await addAppointment(6, 'Voice therapist');
  const isAfter = (await (await home(), page.locator('[data-home-agenda]').count())) > 0;

  /* 1. The top of Today, per palette and theme. */
  for (const palette of PALETTES) {
    for (const theme of THEMES) {
      await dress(palette, theme);
      await home();
      await top(`top-${palette}-${theme}`, `${palette}, ${theme}: the field and its foot, then what is coming, then the strip.`);
    }
  }
  if (!isAfter) throw new Error('before set done');

  /* 2. The agenda band, folded and opened, and a row pressed. */
  await addAppointment(5, 'Blood draw');
  await dress('trans', 'light');
  await home();
  await cropBand('agenda-folded-trans-light', '[data-home-agenda]', '[data-home-agenda-fold]', 'Three rows at the cap and the fold naming the rest.');
  await page.locator('[data-home-agenda-fold]').click();
  await page.waitForTimeout(600);
  await cropBand('agenda-open-trans-light', '[data-home-agenda]', '[data-home-agenda-fold]', 'Opened: every dated thing in the week, in day order, and the fold reading fewer.');
  await dress('nonbinary', 'dark');
  await home();
  await cropBand('agenda-folded-nonbinary-dark', '[data-home-agenda]', '[data-home-agenda-fold]', 'The same band on nonbinary, dark.');

  /* 3. The log strip, at rest and with a session running. */
  await dress('trans', 'light');
  await home();
  await cropBand('log-trans-light', '[data-home-log]', '[data-home-log]', 'The log strip: the five faces, then a dose, both tallies and a wear session, as squares of the strip\'s stripe.');
  await page.locator('[data-home-log-shape="wear"]').click();
  await page.waitForSelector('[data-live-tile="wear-timer"]');
  await page.waitForTimeout(800);
  await cropTop('log-running-trans-light', ['[data-home-log]'], 20, 'A wear session started from the strip: the timer leads the screen and the strip\'s shape reads Stop.');
  await page.locator('[data-home-log-shape="wear"]').click();
  await page.waitForSelector('[data-live-tile="wear-timer"]', { state: 'detached' });
  await dress('agender', 'dark');
  await home();
  await cropBand('log-agender-dark', '[data-home-log]', '[data-home-log]', 'The strip on agender, dark: the squares are the flag\'s green.');

  /* 4. The pinned rows. */
  await dress('trans', 'light');
  await home();
  await cropBand('pinned-trans-light', '[data-home-pinned]', '[data-home-pinned]', 'The pinned rows: the default set, each with its reading, in registry order until ticket 14 lets it be moved.');
  await dress('rainbow', 'dark');
  await home();
  await cropBand('pinned-rainbow-dark', '[data-home-pinned]', '[data-home-pinned]', 'On rainbow, dark.');

  /* 5. The notices under the agenda: the stale backup is what the demo
        journal carries. */
  await dress('trans', 'light');
  await home();
  if (await page.locator('[data-backup-notice]').count()) {
    await cropBand('notices-trans-light', '[data-home-agenda]', '[data-backup-notice]', 'The stale-backup notice sits under the agenda, its date in its own words, and takes no stripe.');
  }

  /* 6. The whole screen once, so the order can be read top to bottom. */
  await reopen(390, 2);
  await dress('trans', 'light');
  await home();
  await strip();
  await page.waitForTimeout(700);
  await page.locator('[data-app-scroll-region]').screenshot({ path: `${outDir}/whole-trans-light.png` });
  shots.push({ name: 'whole-trans-light', note: 'The first screenful, top to bottom.' });

  /* 7. Day one. */
  await settle('/');
  await page.selectOption('#demo-jump', 'first-run');
  await page.waitForSelector('[data-leave-setup]');
  await page.locator('[data-leave-setup]').click();
  await page.waitForSelector('[data-home-hello]');
  await home();
  await cropTop('day-one-trans-light', ['[data-getting-started]'], 20, 'Day one: the field, the strip, the default pinned set and getting started. No empty agenda, no placeholder.');

  /* 8. Disguise. */
  await seed();
  await addAppointment(3, 'Endocrinologist');
  await dress('trans', 'light');
  await settle('/settings');
  await page.getByRole('button', { name: /Disguise/i }).click();
  await page.getByRole('switch', { name: 'Disguise app' }).click();
  await page.waitForFunction(() => document.title === 'Notes', null, { timeout: 8000 });
  await home();
  await cropTop('disguise', ['[data-home-pinned]'], 20, 'Under disguise: a grey field, no sun, no agenda; the strip and the pins stay, every block the one accent.');
  await settle('/settings');
  await page.getByRole('button', { name: /Disguise/i }).click();
  await page.getByRole('switch', { name: 'Disguise app' }).click();
  await page.waitForFunction(() => document.title !== 'Notes', null, { timeout: 8000 });

  /* 9. Widths. */
  await reopen(320, 2);
  await dress('trans', 'light');
  await home();
  await top('w320-trans-light', '320px: the date blocks keep their width, the four shapes stay in one row.');
  await dress('nonbinary', 'dark');
  await home();
  await top('w320-nonbinary-dark', '320px on nonbinary, dark.');
  await reopen(195, 2);
  await dress('trans', 'light');
  await home();
  await top('w195-trans-light', '195px, which is 200% zoom on a 390px phone: the shapes go two by two and the rows wrap.');
  await reopen(1280, 1);
  await dress('trans', 'light');
  await home();
  await top('w1280-trans-light', '1280px: the field is a banner across the column; the bands keep their width.');
} catch (err) {
  if (String(err).includes('before set done')) {
    // A before build has no agenda; the top crops are all it has to show.
  } else {
    errors.push(String(err));
  }
}

await writeFile(`${outDir}/manifest.json`, JSON.stringify({ tag, shots, errors }, null, 2));
await browser.close();
await app.close();
console.log(`${shots.length} shots in ${outDir}`);
if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
}
