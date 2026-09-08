/* Screenshots of the calendar handoff sheet (phase 10 redesign ticket 18,
   ADR-0067), from each of its three entry points: the appointment editor,
   the surgery editor once a date is set, and a sealed letter's row.

   One component, three call sites - so what is reviewed here is the sheet
   itself (default state, the edited title, the disclosure line) once in
   full, and then each entry point once, in place on its own screen, to
   show the button that opens it sits where the ticket says it should and
   nowhere else.

   Nothing is faked at the component level: every record here is written
   through its own editor, the same way a person would.

   Run: npm run test:walkthrough  (or any VITE_DEMO=1 build) first, then
        node tests/calendar-handoff-gallery.mjs [outDir]
   Default outDir is .claude/calendar-handoff-shots, gitignored and durable. */
import { preview } from 'vite';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './browser-harness.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(process.argv[2] ?? resolve(here, '../.claude/calendar-handoff-shots'));

/** Long enough for the sheet to rise (--dur-med) and settle. */
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

async function setLook(page, palette, theme) {
  await goto(page, '/settings');
  await page.locator(`[data-palette-pick="${palette}"]`).click();
  await page.locator(`[data-segment="${theme}"]`).first().click();
  await page.waitForFunction((want) => document.documentElement.dataset.theme === want, theme);
}

const iso = (offsetDays) => {
  const day = new Date();
  day.setDate(day.getDate() + offsetDays);
  return day.toISOString().slice(0, 10);
};

async function shoot(page, name) {
  await page.evaluate(() => {
    for (const toast of document.querySelectorAll('[data-toast]')) toast.remove();
  });
  await page.locator('[data-app-root]').screenshot({ path: `${outDir}/${name}.png` });
  shots.push(name);
  process.stdout.write(`  ${name}\n`);
}

const THEMES = ['dark', 'light'];
const EXTRA_LOOKS = [
  ['nonbinary', 'light'],
  ['agender', 'dark']
];

/* ---------- entry point 1: the appointment editor ---------- */
for (const [palette, theme] of [...THEMES.map((t) => ['trans', t]), ...EXTRA_LOOKS]) {
  const page = await freshPage();
  await setLook(page, palette, theme);
  await goto(page, '/health/appointments');
  await page.locator('[data-add]').click();
  await page.waitForSelector('#appointment-kind');
  await page.$eval('#appointment-date', (input, value) => input._flatpickr.setDate(value, true), iso(12));
  await page.fill('#appointment-kind', 'endokrynolog');
  await page.locator('[data-save-appointment]').click();
  await page.waitForSelector('[data-appointment]:has-text("endokrynolog")');
  await page.locator('[data-appointment]', { hasText: 'endokrynolog' }).click();
  await page.waitForSelector('[data-add-to-calendar]');
  await page.waitForTimeout(SETTLED);
  await shoot(page, `handoff-button-appointment-${palette}-${theme}`);

  await page.locator('[data-add-to-calendar]').click();
  await page.waitForSelector('[data-calendar-handoff-day]');
  await page.waitForTimeout(SETTLED);
  await shoot(page, `handoff-sheet-appointment-${palette}-${theme}`);

  if (palette === 'trans' && theme === 'dark') {
    // The edited-title state: the one line the sheet exists to let a
    // person change before anything is shared.
    await page.fill('#calendar-handoff-title', 'Wizyta u lekarza');
    await page.fill('#calendar-handoff-time', '09:15');
    await shoot(page, `handoff-sheet-appointment-edited-${theme}`);
  }
  await page.close();
}

/* ---------- entry point 2: the surgery editor, once it has a date ---------- */
for (const theme of THEMES) {
  const page = await freshPage();
  await setLook(page, 'trans', theme);
  await goto(page, '/health/surgery');
  await page.locator('[data-add]').click();
  await page.waitForSelector('#surgery-name');
  await page.fill('#surgery-name', 'Vaginoplasty');
  await page.$eval('#surgery-date', (input, value) => input._flatpickr.setDate(value, true), iso(180));
  await page.locator('[data-save-procedure]').click();
  await page.waitForTimeout(SETTLED);
  // Reopen: extraActions (and so the calendar button) only render on a
  // saved record, the same gate `editor.date` puts on the sheet below it.
  await page.locator('[data-edit-procedure]').first().click();
  await page.waitForSelector('[data-add-to-calendar]');
  await page.waitForTimeout(SETTLED);
  await shoot(page, `handoff-button-surgery-trans-${theme}`);

  await page.locator('[data-add-to-calendar]').click();
  await page.waitForSelector('[data-calendar-handoff-day]');
  await page.waitForTimeout(SETTLED);
  await shoot(page, `handoff-sheet-surgery-trans-${theme}`);
  await page.close();
}

/* ---------- entry point 3: a sealed letter's row ---------- */
for (const theme of THEMES) {
  const page = await freshPage();
  await setLook(page, 'trans', theme);
  await goto(page, '/transition/letters');
  await page.locator('[data-add]').click();
  await page.waitForSelector('textarea.input');
  await page.fill('textarea.input', 'To my future self.');
  await page.$eval('#letter-unlock', (input, value) => input._flatpickr.setDate(value, true), iso(365));
  await page.locator('[data-save-letter]').click();
  await page.waitForSelector('[data-letter]');
  await page.locator('[data-letter]').first().click();
  await page.waitForSelector('[data-add-to-calendar]');
  await page.waitForTimeout(SETTLED);
  await shoot(page, `handoff-button-letter-trans-${theme}`);

  await page.locator('[data-add-to-calendar]').click();
  await page.waitForSelector('[data-calendar-handoff-day]');
  await page.waitForTimeout(SETTLED);
  await shoot(page, `handoff-sheet-letter-trans-${theme}`);
  await page.close();
}

process.stdout.write(`\n${shots.length} shot(s) in ${outDir}\n`);
await browser.close();
await app.httpServer.close();
