/* Screenshots of /day/[day]'s two new states (phase 8 features ticket 62,
   ADR-0067): a future day with something coming up, and a future day with
   nothing - plus a past day, to eyeball that it still looks like the
   screen it was.

   One real appointment, written through /health/appointments' own editor
   exactly as appointments-gallery.mjs does, gives a genuine `appointment`
   mark. The future day it lands on is reached the way a person reaches it -
   through the calendar's own marked cell (ticket 61) - rather than by
   hand-computing an epoch day; the empty-future day is a fixed number of
   days further out, parsed off that URL.

   Run: npm run build first (VITE_DEMO=1), then
        node tests/day-ahead-gallery.mjs [outDir]
   Default outDir is .claude/day-ahead-shots, gitignored and durable. */
import { preview } from 'vite';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './browser-harness.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(process.argv[2] ?? resolve(here, '../.claude/day-ahead-shots'));
const SETTLED = 500;
const EMPTY_FUTURE_OFFSET = 20; // Past the appointment (day+10) and clear of the seeded persona's own future milestones.

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

async function addAppointment(page, { day, kind, place }) {
  await goto(page, '/health/appointments');
  await page.locator('[data-add]').click();
  await page.waitForSelector('#appointment-kind');
  await page.$eval('#appointment-date', (input, value) => input._flatpickr.setDate(value, true), day);
  if (kind) await page.fill('#appointment-kind', kind);
  if (place) await page.fill('#appointment-place', place);
  await page.locator('[data-save-appointment]').click();
  await page.waitForTimeout(SETTLED);
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

for (const theme of THEMES) {
  const page = await freshPage();
  await setLook(page, 'trans', theme);
  await addAppointment(page, { day: iso(10), kind: 'endokrynolog', place: 'Poradnia, ul. Kopernika' });

  // Reach the marked future day through the calendar, the way a person
  // does - ticket 61 made exactly this cell a link.
  await goto(page, '/calendar');
  const markLink = page.locator('[data-hm-cell-mark]').first();
  await markLink.waitFor();
  const markedHref = await markLink.getAttribute('href');
  await markLink.click();
  await page.waitForSelector('[data-app-root][data-boot="ready"]');
  await page.waitForTimeout(SETTLED);
  await shoot(page, `day-ahead-coming-trans-${theme}`);

  // A further-out future day, off the same marked one, with nothing on it.
  const markedDay = Number(markedHref.split('/day/')[1]);
  await goto(page, `/day/${markedDay + EMPTY_FUTURE_OFFSET}`);
  await page.waitForTimeout(SETTLED);
  await shoot(page, `day-ahead-empty-trans-${theme}`);

  // Yesterday - a past day, untouched by this ticket, for comparison.
  await goto(page, `/day/${markedDay - 11}`);
  await page.waitForTimeout(SETTLED);
  await shoot(page, `day-past-unchanged-trans-${theme}`);

  await page.close();
}

process.stdout.write(`\n${shots.length} shot(s) in ${outDir}\n`);
await browser.close();
await app.httpServer.close();
