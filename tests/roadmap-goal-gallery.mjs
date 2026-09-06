/* Screenshots of a custom goal's two controls (phase 8 features ticket 69,
   ADR-0068): rewording and deleting, both inside the per-goal sheet ticket
   56 built.

   Four states, which are the four a sign-off has to see: a custom goal's
   sheet with a document filed against it and the two controls under that,
   the same sheet with a new wording typed in and the save button live, the
   delete confirmation counting the paper it is about to unfile, and a
   built-in goal's sheet, which offers neither control and never will.

   Default flag only, both themes.

   Run: VITE_DEMO=1 npm run build   first, then
        node tests/roadmap-goal-gallery.mjs [outDir]
   Default outDir is .claude/roadmap-goal-shots, which is gitignored and
   durable. */
import { preview } from 'vite';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './browser-harness.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(process.argv[2] ?? resolve(here, '../.claude/roadmap-goal-shots'));

const GOAL = 'Get the referal reissued';
const BUILT_IN = 'pl-medical-keep-opinions';

await mkdir(outDir, { recursive: true });
const browser = await launchChromium();
const app = await preview({ preview: { port: 0 } });
const base = `http://localhost:${app.httpServer.address().port}`;
const shots = [];

for (const theme of ['light', 'dark']) {
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    colorScheme: theme
  });

  const paperImage = async () => {
    const dataUrl = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 850;
      canvas.height = 1200;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#f4f2ec';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#2a2a2a';
      ctx.font = 'bold 34px serif';
      ctx.fillText('NFZ', 60, 110);
      ctx.fillRect(60, 140, 730, 3);
      ctx.fillStyle = '#8a8a8a';
      for (let i = 0; i < 20; i++) ctx.fillRect(60, 260 + i * 38, 730 - (i % 4) * 90, 12);
      return canvas.toDataURL('image/jpeg', 0.85);
    });
    return Buffer.from(dataUrl.split(',')[1], 'base64');
  };

  const strip = () =>
    page.evaluate(() => {
      for (const toast of document.querySelectorAll('[data-toast]')) toast.remove();
      for (const bar of document.querySelectorAll('.demo-bar')) bar.remove();
    });

  const shootViewport = async (name) => {
    await strip();
    await page.locator('[data-app-root]').screenshot({ path: `${outDir}/${name}-trans-${theme}.png` });
    shots.push(`${name}-trans-${theme}`);
  };

  const settle = async (path) => {
    await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-app-root][data-boot="ready"]');
    if (await page.locator('[data-leave-setup]').count()) {
      await page.locator('[data-leave-setup]').click();
      await page.waitForSelector('[data-home-hello]');
      await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
      await page.waitForSelector('[data-app-root][data-boot="ready"]');
    }
  };

  const dress = async () => {
    await settle('/settings');
    await page.locator('[data-palette-pick="trans"]').click();
    await page.locator(`[data-segment="${theme}"]`).click();
    await page.waitForFunction((want) => document.documentElement.dataset.theme === want, theme);
  };

  await settle('/');
  await page.getByRole('button', { name: 'Reset demo state' }).click();
  await page.waitForTimeout(1500);
  await dress();

  // A custom goal of the person's own, with the typo this ticket exists to
  // let them fix.
  await settle('/transition/roadmap');
  await page.locator('[data-add-goal="medical"]').click();
  await page.getByPlaceholder('Your step').fill(GOAL);
  await page.getByRole('button', { name: 'Add goal' }).click();
  const row = page.locator('[data-goal]').filter({ hasText: GOAL });
  await row.waitFor();
  const goalId = await row.getAttribute('data-goal');

  // A piece of paper filed against it, so the sheet is shot with something
  // in it rather than with an empty middle.
  await settle('/media/documents');
  const paper = await paperImage();
  page.once('filechooser', (chooser) =>
    chooser.setFiles({ name: 'scan_0207.jpg', mimeType: 'image/jpeg', buffer: paper })
  );
  await page.locator('[data-add]').click();
  await page.waitForSelector('#document-title');
  await page.locator('#document-title').fill('Skierowanie do endokrynologa');
  await page.locator('[data-save-document]').click();
  await page.waitForSelector('[data-list-row]');
  await page.locator('[data-list-row]').first().click();
  await page.waitForSelector('[data-pick-document-target]');
  await page.locator('[data-pick-document-target]').click();
  await page.locator(`[data-pick-target="goal:${goalId}"]`).click();
  await page.waitForTimeout(400);
  await page.locator('[data-save-document]').click();
  await page.waitForTimeout(600);

  /* ---------- 01: the sheet as it opens. The tick, the paper filed here,
     and under those the two controls a custom goal owes. ---------- */
  await settle('/transition/roadmap');
  await page.locator(`[data-open-goal="${goalId}"]`).click();
  await page.waitForSelector('[data-goal-sheet-status]');
  await page.waitForTimeout(700);
  await shootViewport('01-custom-goal-sheet');

  /* ---------- 02: a new wording typed in, which is the only state the save
     button is live in. ---------- */
  await page.locator('#goal-text').fill('Get the referral reissued');
  await page.waitForTimeout(400);
  await shootViewport('02-reworded');

  /* ---------- 03: the confirmation, counting the one document it is about
     to unfile and saying the paper is kept. ---------- */
  await page.locator('[data-delete-goal]').click();
  await page.waitForSelector('[data-confirm-delete-goal]');
  await page.waitForTimeout(600);
  await shootViewport('03-delete-confirm');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);

  /* ---------- 04: a built-in goal's sheet, which has neither control -
     there is no row to edit and nothing to delete (ADR-0068). ---------- */
  await page.locator(`[data-open-goal="${BUILT_IN}"]`).click();
  await page.waitForSelector('[data-goal-sheet-status]');
  await page.waitForTimeout(700);
  await shootViewport('04-built-in-goal-sheet');

  await page.close();
}

await browser.close();
await app.close();
console.log(`${shots.length} shots in ${outDir}`);
for (const shot of shots) console.log(`  ${shot}.png`);
