/* Screenshots of the prep screen's visits card (phase 8 features ticket 71)
   in the three states the change moves between, in both languages.

   The state that has to be looked at is the middle one: a journal with a
   visit booked and a prep list ticked empty, which before this showed
   nothing below the empty-state notice at all. The first-run shot is the
   cost side of the same change - a card that used to stay away until a
   question existed now prints "Not set" on a brand new journal.

   Run: VITE_DEMO=1 npm run build first, then
        node tests/prep-visits-gallery.mjs [outDir]
   Default outDir is .claude/prep-shots, gitignored and durable. */
import { preview } from 'vite';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './browser-harness.mjs';
import { PALETTES } from './palettes.mjs';
import { clearPrepList } from './prep-fixture.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(process.argv[2] ?? resolve(here, '../.claude/prep-shots'));

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

/** Palette and theme after any state jump, never before: a demo reset
    writes the preferences back. */
async function setLook(page, palette, theme) {
  await goto(page, '/settings');
  await page.locator(`[data-palette-pick="${palette}"]`).click();
  await page.locator(`[data-segment="${theme}"]`).first().click();
  await page.waitForFunction((want) => document.documentElement.dataset.theme === want, theme);
}

/** setLocale reloads the page, so this waits for the app to come back up
    rather than for the click. */
async function setLanguage(page, lang) {
  await goto(page, '/settings');
  await page.locator(`[data-segment="${lang}"]`).click();
  await page.waitForTimeout(SETTLED);
  await page.waitForSelector('[data-app-root][data-boot="ready"]');
}

async function bookAhead(page, days) {
  const day = new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
  await goto(page, '/health/appointments');
  await page.locator('[data-add]').click();
  await page.waitForSelector('#appointment-date');
  await page.evaluate((d) => {
    document.getElementById('appointment-date')._flatpickr.setDate(d, true);
  }, day);
  await page.locator('[data-save-appointment]').click();
  await page.waitForSelector('[data-appointment]');
}

/** The demo persona already carries appointments, so a journal with none
    has to be made rather than found - and it is the one that shows what
    ungating the card costs: a date row with nothing to name. */
async function clearAppointments(page) {
  await goto(page, '/health/appointments');
  for (let guard = 0; guard < 20; guard += 1) {
    const rows = await page.locator('[data-appointment]').count();
    if (rows === 0) break;
    await page.locator('[data-appointment]').first().click();
    await page.locator('[data-delete-appointment]').click();
    await page.locator('[data-confirm-delete-appointment]').click();
    await page.waitForFunction(
      (before) => document.querySelectorAll('[data-appointment]').length < before,
      rows
    );
  }
}

/* Read out of PALETTES, which is where the set is declared, so a renamed
   palette throws here rather than quietly rendering the default one. */
const named = (name) => {
  if (!PALETTES.includes(name)) throw new Error(`no such palette: ${name}`);
  return name;
};

async function emptyTheList(page) {
  await goto(page, '/health/appointment-prep');
  await clearPrepList(page);
}

async function shoot(page, name) {
  /* Headless Chromium never grants persistent storage, so the app's own
     "export backups regularly" toast sits over the foot of every screen.
     It is a true notice about this browser and not what these are of. */
  await page.evaluate(() => {
    for (const toast of document.querySelectorAll('[data-toast]')) toast.remove();
  });
  const tall = await page.evaluate(() => {
    const s = document.querySelector('[data-app-scroll-region]');
    return Math.min(window.innerHeight + (s.scrollHeight - s.clientHeight) + 40, 8000);
  });
  await page.setViewportSize({ width: 390, height: tall });
  await page.locator('[data-app-root]').screenshot({ path: `${outDir}/${name}.png` });
  await page.setViewportSize({ width: 390, height: 844 });
  shots.push(name);
  process.stdout.write(`  ${name}\n`);
}

for (const lang of ['en', 'pl']) {
  for (const theme of ['light', 'dark']) {
    const tag = `${lang}-${theme}`;

    // 1. Nothing on the list and nothing on the record: the date row with
    //    no day to give, which is the state this change adds to the screen.
    let page = await freshPage();
    await setLook(page, named('trans'), theme);
    await clearAppointments(page);
    await setLanguage(page, lang);
    await goto(page, '/health/appointment-prep');
    await page.waitForTimeout(SETTLED);
    await shoot(page, `prep-1-nothing-booked-${tag}`);
    await page.close();

    // 2. The state this ticket is about: a visit booked, the list ticked
    //    empty, and everything the journal knows still on screen.
    page = await freshPage();
    await goto(page, '/');
    await page.locator('[data-fill-every-feature]').click();
    await page.waitForURL('**/more');
    await page.waitForTimeout(SETTLED);
    // After the jump, never before it: filling every feature writes the
    // preferences back, which takes the theme with it.
    await setLook(page, named('trans'), theme);
    await bookAhead(page, 14);
    await setLanguage(page, lang);
    await emptyTheList(page);
    await page.waitForTimeout(SETTLED);
    await shoot(page, `prep-2-empty-list-${tag}`);

    // 3. And the everyday state, with the list back.
    await goto(page, '/health/appointment-prep');
    await page.locator('[data-add]').click();
    await page.waitForSelector('#appointment-prep-input');
    await page.fill('#appointment-prep-input', lang === 'pl' ? 'Zapytać o dawkę' : 'Ask about the dose');
    await page.locator('[data-save-appointment-item]').click();
    await page.waitForSelector('[data-appointment-item]');
    await page.waitForTimeout(SETTLED);
    await shoot(page, `prep-3-with-list-${tag}`);
    await page.close();
  }
}

process.stdout.write(`\n${shots.length} shot(s) in ${outDir}\n`);
await browser.close();
await app.httpServer.close();
