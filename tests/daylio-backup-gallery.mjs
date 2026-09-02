/* Screenshots of the Daylio backup import sheet (phase 7 ticket 09).

   Driven through the real screen against a real `.daylio` file rather than
   mounted from a fixture object: the sheet's whole job is to say what
   confirming will do, so what is worth looking at is what the parser
   actually resolved, in the real kit, at phone width.

   The file is handed over through Chromium's own file chooser, which is
   how the picker works in the app - `chooseFiles` creates an input and
   clicks it (data/fileDialog.ts).

   Run: VITE_DEMO=1 npm run build && node tests/daylio-backup-gallery.mjs [outDir]
   Default outDir is .claude/daylio-shots, which is gitignored and durable. */
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { preview } from 'vite';
import { launchChromium } from './browser-harness.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(process.argv[2] ?? resolve(here, '../.claude/daylio-shots'));
const backup = process.env.DAYLIO_FIXTURE;
if (!backup) throw new Error('set DAYLIO_FIXTURE to a .daylio file to import');

await mkdir(outDir, { recursive: true });

const server = await preview({ preview: { port: 0 } });
const address = server.httpServer.address();
const BASE = `http://localhost:${address.port}`;

const browser = await launchChromium();

/* A context per theme rather than one for both: the first pass imports the
   file, so a second pass in the same storage would show a preview with
   nothing left to add. */
async function freshPage() {
  const page = await (
    await browser.newContext({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 2 })
  ).newPage();
  page.on('pageerror', (error) => console.error('PAGE ERROR', error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') console.error('CONSOLE', message.text());
  });
  return page;
}

let page;

const shot = async (name, selector) => {
  const file = `${outDir}/${name}.png`;
  // The sheet rather than the viewport where there is one: the demo bar
  // offsets the app and would take a third of every frame.
  const target = selector ? page.locator(selector) : page;
  await target.screenshot({ path: file });
  console.log(file);
};

const closeSheet = async () => {
  await page.keyboard.press('Escape');
  await page.waitForSelector('[data-sheet]', { state: 'detached', timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(400);
};

for (const theme of ['dark', 'light']) {
  page = await freshPage();
  await page.goto(`${BASE}/settings/export`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-app-root][data-boot="ready"]', { timeout: 30000 });
  // Palette and theme are one compound selector, so this is set after the
  // last navigation rather than before it.
  await page.evaluate((value) => document.documentElement.setAttribute('data-theme', value), theme);
  // The demo build's storage notice is a toast that outlives these shots
  // and sits over the sheet; it belongs to no part of this ticket.
  await page.addStyleTag({ content: '.toast, .toast-stack { display: none !important; }' });

  await page.locator('[data-daylio-backup]').scrollIntoViewIfNeeded();
  await shot(`row-${theme}`, '[data-import-rows]');

  await page.locator('[data-daylio-backup]').click();
  await page.waitForSelector('[data-pick-backup]');
  await shot(`empty-${theme}`, '[data-sheet]');

  const chooser = page.waitForEvent('filechooser');
  await page.locator('[data-pick-backup]').click();
  await (await chooser).setFiles(backup);

  await page.waitForSelector('[data-confirm-backup]', { timeout: 15000 });
  // The rows arrive on the app's stagger; this is their resting state.
  await page.waitForTimeout(900);
  await shot(`preview-${theme}`, '[data-sheet]');
  // The sheet scrolls at this width, so the lower half is its own frame.
  await page.locator('[data-confirm-backup]').scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await shot(`preview-bottom-${theme}`, '[data-sheet]');

  await page.locator('[data-confirm-backup]').click();
  await page.waitForSelector('[data-sheet]', { state: 'detached', timeout: 60000 });
  await page.waitForTimeout(700);
  await shot(`imported-${theme}`, '[data-import-rows]');
  // The record this import wrote, in the history the same screen keeps.
  await page.locator('[data-import-log-row]').first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await shot(`history-${theme}`, '[data-import-log-row]');

  // Second pick of the same file: everything in it is already here.
  await page.locator('[data-daylio-backup]').click();
  const again = page.waitForEvent('filechooser');
  await page.locator('[data-pick-backup]').click();
  await (await again).setFiles(backup);
  await page.waitForTimeout(2000);
  await shot(`already-here-${theme}`, '[data-sheet]');
  await closeSheet();
}

await browser.close();
await server.close();
