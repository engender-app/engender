/* Screenshots of the photo-day prompt (redesign ticket 17): the sheet the
   import flow raises when a picked photo carries no date (ADR-0015: always,
   since normalize() strips every metadata block that could carry one), and
   the same sheet's after-the-fact form on the photos screen.

   The component shipped earlier as ticket 47 and was signed off then; what
   this gallery re-proves is that the token/direction passes since (tickets
   07/22/23) repainted it correctly, which is this ticket's own acceptance
   criterion ("renders published for sign-off").

   Run: npm run test:walkthrough  (or any VITE_DEMO=1 build) first, then
        node tests/photo-day-sheet-gallery.mjs [outDir]
   Default outDir is .claude/photo-day-shots, gitignored and durable. */
import { preview } from 'vite';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './browser-harness.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(process.argv[2] ?? resolve(here, '../.claude/photo-day-shots'));

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

async function setLanguage(page, lang) {
  await goto(page, '/settings');
  await page.locator(`[data-segment="${lang}"]`).click();
  await page.waitForTimeout(SETTLED);
}

async function tinyPhoto(page, fill) {
  const dataUrl = await page.evaluate((fill) => {
    const canvas = document.createElement('canvas');
    canvas.width = 40;
    canvas.height = 30;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = fill;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png');
  }, fill);
  return Buffer.from(dataUrl.split(',')[1], 'base64');
}

async function fillDate(page, selector, iso) {
  await page.evaluate(([sel, v]) => {
    const el = document.querySelector(sel);
    const fp = el?._flatpickr ?? el?.flatpickr;
    if (!fp) throw new Error(`no flatpickr instance on ${sel}`);
    fp.setDate(v, true);
  }, [selector, iso]);
}

async function shoot(page, name) {
  await page.evaluate(() => {
    for (const toast of document.querySelectorAll('[data-toast]')) toast.remove();
  });
  await page.locator('[data-sheet]').screenshot({ path: `${outDir}/${name}.png` });
  shots.push(name);
  process.stdout.write(`  ${name}\n`);
}

async function openImportPrompt(page) {
  await goto(page, '/');
  await page.locator('[data-nav-fab]').click();
  await page.locator('[data-fan-target="mood-3"]').click();
  await page.waitForSelector('#ed-note');
  const photo = await tinyPhoto(page, '#c94f7c');
  page.once('filechooser', (chooser) => chooser.setFiles({ name: 'shoebox.png', mimeType: 'image/png', buffer: photo }));
  await page.locator('[data-add-photo]').click();
  await page.waitForSelector('[data-photo-day-save]');
  await page.waitForTimeout(SETTLED);
}

async function openEditPrompt(page) {
  // A photo with a day already set, so the edit sheet has something to prefill.
  await openImportPrompt(page);
  await fillDate(page, '#entry-photo-day-prompt', '1994-03-15');
  await page.locator('[data-photo-day-save]').click();
  await page.waitForSelector('[data-photo-day-save]', { state: 'detached' });
  await page.locator('#ed-note').fill('Gallery entry.');
  await page.locator('[data-save]').click();
  await page.waitForSelector('[data-home-hello]');

  await goto(page, '/media/photos');
  await page.waitForSelector('[data-photo-cell]');
  await page.locator('[data-photo-cell]').first().locator('xpath=../button[@data-photo-edit-day]').click();
  await page.waitForSelector('[data-photo-day-edit-save]');
  await page.waitForTimeout(SETTLED);
}

const THEMES = ['dark', 'light'];

/* ---------- the import prompt, asking for a day ---------- */
for (const theme of THEMES) {
  const page = await freshPage();
  await setLook(page, 'trans', theme);
  await openImportPrompt(page);
  await shoot(page, `photo-day-import-trans-${theme}`);
  await page.close();
}

// One extra look, since the sheet spends almost no flag colour (same reasoning
// as the dose-sheet gallery): what varies between palettes is the accent.
{
  const page = await freshPage();
  await setLook(page, 'nonbinary', 'light');
  await openImportPrompt(page);
  await shoot(page, 'photo-day-import-nonbinary-light');
  await page.close();
}

/* ---------- the same sheet in Polish, for the copy criterion ---------- */
{
  const page = await freshPage();
  await setLook(page, 'trans', 'light');
  await setLanguage(page, 'pl');
  await openImportPrompt(page);
  await shoot(page, 'photo-day-import-trans-light-pl');
  await page.close();
}

/* ---------- the after-the-fact edit sheet, prefilled ---------- */
for (const theme of THEMES) {
  const page = await freshPage();
  await setLook(page, 'trans', theme);
  await openEditPrompt(page);
  await shoot(page, `photo-day-edit-trans-${theme}`);
  await page.close();
}

await browser.close();
app.httpServer.close();

process.stdout.write(`\n${shots.length} shot(s) in ${outDir}\n`);
