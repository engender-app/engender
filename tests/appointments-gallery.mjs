/* Screenshots of the appointment record (phase 8 features ticket 57,
   ADR-0066): the list in its three shapes and the editor sheet, in both
   themes.

   The screen is two lists that only exist when they have something in them
   - what is coming up and what has been - so what has to be looked at is
   not one render but four: nothing written, only future, only past, and
   both. Each is a different journal rather than a different prop, which is
   why each runs on its own page: OPFS is per browser context.

   Nothing is faked at the component level. Every appointment here is
   written through the screen's own editor, exactly as a person would, so
   the kind chips are the kinds this journal actually used.

   Run: npm run test:walkthrough  (or any VITE_DEMO=1 build) first, then
        node tests/appointments-gallery.mjs [outDir]
   Default outDir is .claude/appointment-shots, gitignored and durable. */
import { preview } from 'vite';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './browser-harness.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(process.argv[2] ?? resolve(here, '../.claude/appointment-shots'));

/** Long enough for the sheet to rise (--dur-med) and settle. Every frame
    here wants the resting state, never a tween mid-flight. */
const SETTLED = 500;

await mkdir(outDir, { recursive: true });

const app = await preview({ preview: { port: 0 } });
const base = `http://localhost:${app.httpServer.address().port}`;
const browser = await launchChromium();
const shots = [];

async function freshPage() {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await page.goto(`${base}/`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-app-root][data-boot="ready"]');
  if (await page.locator('[data-leave-setup]').count()) {
    await page.locator('[data-leave-setup]').click();
    await page.waitForSelector('[data-home-hello]');
  }
  return page;
}

async function goto(page, path) {
  await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-app-root][data-boot="ready"]');
}

/** The palette and theme are set after any state jump, never before: a
    demo reset writes the preferences back. */
async function setLook(page, palette, theme) {
  await goto(page, '/settings');
  await page.locator(`[data-palette-pick="${palette}"]`).click();
  await page.locator(`[data-segment="${theme}"]`).first().click();
  await page.waitForFunction((want) => document.documentElement.dataset.theme === want, theme);
}

/** One appointment, written through the editor the same way a person
    would. `day` is an ISO date.

    The date goes through flatpickr's own instance rather than through the
    field: the visible input is `readonly` by design (DatePicker.svelte -
    the popup is the control), so typing into it is not a thing a person
    can do either. `setDate(..., true)` fires the change the bind reads. */
async function addAppointment(page, { day, kind, place, note }) {
  await goto(page, '/health/appointments');
  await page.locator('[data-add]').click();
  await page.waitForSelector('#appointment-kind');
  await page.$eval('#appointment-date', (input, value) => input._flatpickr.setDate(value, true), day);
  if (kind) await page.fill('#appointment-kind', kind);
  if (place) await page.fill('#appointment-place', place);
  if (note) await page.fill('#appointment-note', note);
  await page.locator('[data-save-appointment]').click();
  await page.waitForTimeout(SETTLED);
}

const iso = (offsetDays) => {
  const day = new Date();
  day.setDate(day.getDate() + offsetDays);
  return day.toISOString().slice(0, 10);
};

async function shoot(page, name) {
  /* Headless Chromium never grants persistent storage, so the app's own
     "export backups regularly" toast sits over the foot of every screen.
     It is a true notice about this browser and not what these are of. */
  await page.evaluate(() => {
    for (const toast of document.querySelectorAll('[data-toast]')) toast.remove();
  });
  await page.locator('[data-app-root]').screenshot({ path: `${outDir}/${name}.png` });
  shots.push(name);
  process.stdout.write(`  ${name}\n`);
};

const THEMES = ['dark', 'light'];

/* ---------- nothing written yet ---------- */
for (const theme of THEMES) {
  const page = await freshPage();
  await setLook(page, 'trans', theme);
  await goto(page, '/health/appointments');
  await shoot(page, `appointments-empty-trans-${theme}`);
  await page.close();
}

/* ---------- one booked and nothing behind: the screen a person has on
     the day they first write a visit down ---------- */
for (const theme of THEMES) {
  const page = await freshPage();
  await setLook(page, 'trans', theme);
  await addAppointment(page, { day: iso(19), kind: 'endokrynolog', place: 'Poradnia, ul. Kopernika' });
  await goto(page, '/health/appointments');
  await shoot(page, `appointments-only-upcoming-trans-${theme}`);
  await page.close();
}

/* ---------- both halves, which is the shape it settles into ---------- */
for (const [palette, theme] of [['trans', 'dark'], ['trans', 'light'], ['nonbinary', 'light'], ['agender', 'dark']]) {
  const page = await freshPage();
  await setLook(page, palette, theme);
  await addAppointment(page, { day: iso(19), kind: 'endokrynolog', place: 'Poradnia, ul. Kopernika' });
  await addAppointment(page, { day: iso(-4), kind: 'psycholog', place: 'Gabinet na Dolnej', note: 'poszło dobrze' });
  await addAppointment(page, { day: iso(-96), kind: 'endokrynolog', place: 'Poradnia, ul. Kopernika' });
  // One with nothing but a day, which is what most rows start as.
  await addAppointment(page, { day: iso(-210) });
  await goto(page, '/health/appointments');
  await shoot(page, `appointments-both-${palette}-${theme}`);

  if (palette === 'trans') {
    // The editor on a stored appointment, with this journal's own kinds
    // offered underneath the field.
    await page.locator('[data-appointment]', { hasText: 'psycholog' }).click();
    await page.waitForTimeout(SETTLED);
    await shoot(page, `appointments-editor-trans-${theme}`);

    // And the editor on a new one, which is where the chips do their work.
    await page.keyboard.press('Escape');
    await page.waitForTimeout(SETTLED);
    await goto(page, '/health/appointments');
    await page.locator('[data-add]').click();
    await page.waitForTimeout(SETTLED);
    await shoot(page, `appointments-new-trans-${theme}`);
  }
  await page.close();
}

process.stdout.write(`\n${shots.length} shot(s) in ${outDir}\n`);
await browser.close();
await app.httpServer.close();
