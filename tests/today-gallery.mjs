/* Renders for Today (phase 10 redesign ticket 13; rewritten for phase 11
   ticket 03), for sign-off.

   Ticket 03 changes the whole screen rather than a band of it - the strip
   loses four of its five controls, the notices move out from under "Coming
   up", the band widens to a month and the dose panel gains a line - so the
   first scene is Today whole, before and after, and it is the scene the
   before build shares. The crops after it are the bands that changed.

   The default palette only, light and dark (Alicja, 2026-09-14: a sign-off
   page is the default palette crossed with the two themes and nothing
   else). The full palette cross product is `palette-contrast.test.ts`'s.

   The demo persona's dated things all fall past the agenda's week, so the
   script writes what the week needs through the app's own editors first:
   two appointments (three and six days out), then "Fill every feature",
   whose weekly injection schedule puts a dose slot in the window and
   whose fourth letter does not, so the band carries three kinds and,
   with a third appointment, folds.

   Scenes: Today whole in trans light and trans dark, with its pixel height
   reported (ticket 03 holds the dark one to 1700px, from 1996); the agenda
   band alone, folded and opened; the log strip; the dose panel's forward
   line; the notices below the strip; the pinned rows; day one; disguise;
   320, 195 (200% zoom) and the 1280 shell.

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
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
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
const PALETTES = flag('palettes', 'trans').split(',');
const THEMES = ['light', 'dark'];

await mkdir(outDir, { recursive: true });
const browser = await launchChromium();
const app = await preview({ preview: { port: 0 } });
const base = `http://localhost:${app.httpServer.address().port}`;
const shots = [];
const heights = {};
const errors = [];

/** The width every shot is taken at. `reopen` moves it; `grow`/`shrink`
    read it, so a crop taken at 320 or 1280 shrinks back to its own width
    rather than to the phone's. */
let viewportWidth = 390;
let page = await browser.newPage({ viewport: { width: viewportWidth, height: 900 }, deviceScaleFactor: 2 });
const watch = (p) => p.on('pageerror', (err) => errors.push(String(err)));
watch(page);

const reopen = async (width, scale) => {
  viewportWidth = width;
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

/** The viewport grown to the whole screen's height, so a crop below the
    fold is not clamped to what happens to be visible. Returns the height
    it grew to, for the caller to shrink back from. Without this a band
    near the foot of a long screen comes back as a sliver of the last
    viewport with the nav bar across it - which is how the log strip's own
    crop shipped byte-identical to the notices' crop once the strip got
    short enough to sit at the bottom edge. */
const grow = async () => {
  const tall = await page.evaluate(() => {
    const region = document.querySelector('[data-app-scroll-region]');
    return Math.min(window.innerHeight + (region.scrollHeight - region.clientHeight) + 40, 8000);
  });
  await page.setViewportSize({ width: viewportWidth, height: tall });
  await page.waitForTimeout(400);
};
const shrink = async () => {
  await page.setViewportSize({ width: viewportWidth, height: viewportWidth > 800 ? 1000 : 900 });
  await page.waitForTimeout(200);
};

/** From the app frame's top edge to `extra` px under the first of `until`'s
    selectors that matches, in document order of the list. */
const cropTop = async (name, until, extra = 20, note = '') => {
  await strip();
  await page.waitForTimeout(700);
  await grow();
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
    await shrink();
    errors.push(`${name}: nothing matched ${[].concat(until).join(' / ')}`);
    return;
  }
  await page.screenshot({ path: `${outDir}/${name}.png`, clip: box });
  await shrink();
  shots.push({ name, note });
};

/** A band of the screen from `from`'s top to `to`'s bottom, scrolled into
    view first. */
const cropBand = async (name, from, to, note = '', last = false) => {
  await strip();
  await page.locator(from)[last ? 'last' : 'first']().scrollIntoViewIfNeeded();
  await page.waitForTimeout(700);
  await grow();
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
    await shrink();
    errors.push(`${name}: nothing matched ${from} / ${to}`);
    return;
  }
  await page.screenshot({ path: `${outDir}/${name}.png`, clip: box });
  await shrink();
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

/** The top of Today: field, foot, the agenda, the log strip. A before
    build has the strip's four squares under the faces; an after build the
    faces alone. */
const top = (name, note) => cropTop(name, ['[data-home-log]', '[data-mood-chips]'], 20, note);

/** Today whole, and how tall it came out. The height is the reading ticket
    03 is held to - the audit measured the dark screen at 1996px with the
    medication on it four times - so it is reported rather than eyeballed. */
const whole = async (name, note) => {
  await strip();
  await page.waitForTimeout(700);
  /* The document does not scroll and `[data-app-root]` is not the scroller
     either - `[data-app-scroll-region]` is, and an element shot of a
     scroller is clipped to what is visible in it. `grow` is what makes the
     whole screen visible at once; the 390px layout is untouched and only
     the height is unreal. */
  const height = await page.evaluate(() =>
    Math.round(document.querySelector('[data-app-scroll-region]').scrollHeight)
  );
  await grow();
  await page.locator('[data-app-root]').screenshot({ path: `${outDir}/${name}.png` });
  await shrink();
  heights[name] = height;
  shots.push({ name, note: `${note} ${height}px tall.` });
};

try {
  await seed();
  /* A before build draws the strip's four squares; an after build draws the
     five faces alone. */
  await home();
  const isAfter = (await page.locator('[data-home-log-shape]').count()) === 0;

  /* 1. Today whole, in both themes, on the full fixture and nothing else -
        the appointments the band's own scenes need are written after this,
        because the height under this scene is the reading the ticket is
        held to and an appointment added for a crop would inflate it. */
  for (const theme of THEMES) {
    await dress('trans', theme);
    await home();
    await whole(`whole-trans-${theme}`, `Today top to bottom on trans, ${theme}, on the full fixture.`);
    await top(`top-trans-${theme}`, `trans, ${theme}: the field and its foot, then what is coming, then the faces.`);
  }
  if (!isAfter) throw new Error('before set done');

  /* 2. The agenda band, folded and opened. The window is a month now, so
        the fold names the stretch it holds rather than only the count. The
        demo persona's own dated things fall past the band, so the rows it
        needs are written here through the app's own editor. */
  await addAppointment(3, 'Endocrinologist');
  await addAppointment(6, 'Voice therapist');
  await addAppointment(5, 'Blood draw');
  await addAppointment(12, 'Endocrinologist');
  await dress('trans', 'light');
  await home();
  await cropBand('agenda-folded-trans-light', '[data-home-agenda]', '[data-home-agenda-fold]', 'Three rows at the cap and the fold naming the rest of the month. The appointment twelve days out is in the window now; before this ticket the band stopped at seven days and never reached it.');
  await page.locator('[data-home-agenda-fold]').click();
  await page.waitForTimeout(600);
  await cropBand('agenda-open-trans-light', '[data-home-agenda]', '[data-home-agenda-fold]', 'Opened: every dated thing in the month, in day order, and the fold reading fewer.');
  await dress('trans', 'dark');
  await home();
  await cropBand('agenda-folded-trans-dark', '[data-home-agenda]', '[data-home-agenda-fold]', 'The same band, dark.');

  /* 3. The log strip: five faces, and nothing else. */
  await dress('trans', 'light');
  await home();
  await cropBand('log-trans-light', '[data-home-log]', '[data-home-log]', 'The log strip: the five faces under "How is today?". The four squares it used to carry - a dose, both tallies, start/stop wear - are rows of the quick-add fan, which is forty pixels below this band.');
  await dress('trans', 'dark');
  await home();
  await cropBand('log-trans-dark', '[data-home-log]', '[data-home-log]', 'The same strip, dark.');

  /* 4. The dose panel, which is now the only place medication is stated. */
  await dress('trans', 'light');
  await home();
  if (await page.locator('[data-dose-panel-tile]').count()) {
    await cropBand('dose-panel-trans-light', '[data-dose-panel-tile]', '[data-dose-panel-tile]', 'The dose panel with the next slot on its own line. The agenda row for the same schedule is withheld while this is up, so the drug is named once on the screen instead of four times.');
    await dress('trans', 'dark');
    await home();
    await cropBand('dose-panel-trans-dark', '[data-dose-panel-tile]', '[data-dose-panel-tile]', 'The same panel, dark.');
  }

  /* 5. The notices, below the strip: the stale backup is what the demo
        journal carries. */
  await dress('trans', 'light');
  await home();
  if (await page.locator('[data-backup-notice]').count()) {
    await cropBand('notices-trans-light', '[data-home-log]', '[data-backup-notice]', 'The stale-backup notice below the faces rather than between the band and them. Under "Coming up" it read as part of the week; here it is the app talking about itself, under no heading and with no stripe.');
  }

  /* 6. The pinned rows. */
  await dress('trans', 'light');
  await home();
  await cropBand('pinned-trans-light', '[data-home-pinned]', '[data-home-pinned]', 'The pinned rows: the default set, each with its reading.');
  await dress('trans', 'dark');
  await home();
  await cropBand('pinned-trans-dark', '[data-home-pinned]', '[data-home-pinned]', 'The same rows, dark.');

  /* 7. Day one. */
  await dress('trans', 'light');
  await settle('/');
  await page.selectOption('#demo-jump', 'first-run');
  await page.waitForSelector('[data-leave-setup]');
  await page.locator('[data-leave-setup]').click();
  await page.waitForSelector('[data-home-hello]');
  await home();
  /* Getting started is gated on a journal under five entries, so its
     presence is how this scene knows the jump actually landed on one. It
     stopped landing at some point before this ticket, and the crop was
     coming back as the seeded journal under a day-one caption - a shot
     that says the opposite of what it claims. Reported rather than
     mislabelled: the scene is a real gap in the sign-off set until the
     jump is fixed, and the run says so. */
  if (await page.locator('[data-getting-started]').count()) {
    await cropTop('day-one-trans-light', ['[data-getting-started]'], 20, 'Day one: the field, the faces, the default pinned set and getting started. No empty agenda, no placeholder.');
  } else {
    const entries = await page.locator('[data-home-hello]').textContent();
    errors.push(`day-one-trans-light: the first-run jump did not land on a fresh journal (${(entries ?? '').trim()}), so day one was not shot`);
  }

  /* 8. Disguise. */
  await seed();
  await addAppointment(3, 'Endocrinologist');
  await dress('trans', 'light');
  await settle('/settings');
  await page.getByRole('button', { name: /Disguise/i }).click();
  await page.getByRole('switch', { name: 'Disguise app' }).click();
  await page.waitForFunction(() => document.title === 'Notes', null, { timeout: 8000 });
  await home();
  await cropTop('disguise', ['[data-home-pinned]'], 20, 'Under disguise: a grey field, no sun, no agenda; the faces and the pins stay, every block the one accent.');
  await settle('/settings');
  await page.getByRole('button', { name: /Disguise/i }).click();
  await page.getByRole('switch', { name: 'Disguise app' }).click();
  await page.waitForFunction(() => document.title !== 'Notes', null, { timeout: 8000 });

  /* 9. Widths. */
  await reopen(320, 2);
  await dress('trans', 'light');
  await home();
  await top('w320-trans-light', '320px: the date blocks keep their width and the five faces stay in one row.');
  await reopen(195, 2);
  await dress('trans', 'light');
  await home();
  await top('w195-trans-light', '195px, which is 200% zoom on a 390px phone: the rows wrap and the faces hold their targets.');
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

/* Two crops that came out byte-identical are two crops of the same thing,
   and a sign-off page full of them says nothing - which is how six shots of
   the top of /doubt once shipped as three states of it. Cheap to check, and
   it fails the run rather than the reviewer. */
const seen = new Map();
for (const { name } of shots) {
  const digest = createHash('sha256').update(await readFile(`${outDir}/${name}.png`)).digest('hex');
  const twin = seen.get(digest);
  if (twin) errors.push(`${name} is byte-identical to ${twin}: two crops of the same box`);
  else seen.set(digest, name);
}

await writeFile(`${outDir}/manifest.json`, JSON.stringify({ tag, shots, heights, errors }, null, 2));
await browser.close();
await app.close();
console.log(`${shots.length} shots in ${outDir}`);
for (const [name, px] of Object.entries(heights)) console.log(`  ${name}: ${px}px`);
if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
}
