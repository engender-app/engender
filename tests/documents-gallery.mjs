/* Screenshots of the documents area (phase 8 features ticket 52, ADR-0065).

   Four states, which are the four a sign-off has to see: the empty screen,
   the import sheet with a title typed into it, the list with several
   documents on it, and one document's own screen - the only place in the
   app that draws a page image at all.

   The pages themselves are drawn in the browser and handed to the real file
   input, so what is on screen has been through normalizePhoto, the metadata
   strip and the encrypted file store exactly as an imported scan would be.

   Default flag only, both themes.

   Run: VITE_DEMO=1 npm run build   first, then
        node tests/documents-gallery.mjs [outDir]
   Default outDir is .claude/documents-shots, which is gitignored and
   durable. */
import { preview } from 'vite';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './browser-harness.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(process.argv[2] ?? resolve(here, '../.claude/documents-shots'));

/** What somebody actually files: an official-looking page, portrait, with a
    letterhead and a block of body text that is deliberately unreadable at
    thumbnail size. */
const PAPERS = [
  { title: 'Opinia psychiatryczna', head: 'PORADNIA ZDROWIA PSYCHICZNEGO', day: '2024-03-11' },
  { title: 'Skierowanie do endokrynologa', head: 'NFZ', day: '2024-05-02' },
  { title: 'Postanowienie sądu', head: 'SĄD OKRĘGOWY', day: '2025-01-20' },
  { title: 'Diagnosis, 1994', head: 'CITY HOSPITAL', day: '1994-06-30' }
];

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

  const paperImage = async (paper) => {
    const dataUrl = await page.evaluate((paper) => {
      const canvas = document.createElement('canvas');
      canvas.width = 850;
      canvas.height = 1200;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#f4f2ec';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#2a2a2a';
      ctx.font = 'bold 34px serif';
      ctx.fillText(paper.head, 60, 110);
      ctx.fillRect(60, 140, 730, 3);
      ctx.font = '26px serif';
      ctx.fillText(paper.day, 60, 200);
      // Body text as grey rules: legible as a page, unreadable as words,
      // which is what a screenshot of somebody's diagnosis should be.
      ctx.fillStyle = '#8a8a8a';
      for (let i = 0; i < 22; i++) {
        const width = 730 - (i % 4) * 90;
        ctx.fillRect(60, 260 + i * 38, width, 12);
      }
      ctx.fillStyle = '#2a2a2a';
      ctx.fillRect(520, 1110, 270, 3);
      return canvas.toDataURL('image/jpeg', 0.85);
    }, paper);
    return Buffer.from(dataUrl.split(',')[1], 'base64');
  };

  const strip = () =>
    page.evaluate(() => {
      for (const toast of document.querySelectorAll('[data-toast]')) toast.remove();
      for (const bar of document.querySelectorAll('.demo-bar')) bar.remove();
    });

  /* The app scrolls `[data-app-scroll-region]` rather than the document, so
     `fullPage` catches the viewport only. The whole screen is captured by
     growing the viewport to the content and shrinking it back. */
  const shoot = async (name) => {
    await strip();
    const tall = await page.evaluate(() => {
      const scroller = document.querySelector('[data-app-scroll-region]');
      const hidden = scroller.scrollHeight - scroller.clientHeight;
      return Math.min(window.innerHeight + hidden + 40, 12000);
    });
    await page.setViewportSize({ width: 390, height: tall });
    await page.waitForTimeout(500);
    const file = `${outDir}/${name}-trans-${theme}.png`;
    await page.locator('[data-app-root]').screenshot({ path: file });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(250);
    shots.push(`${name}-trans-${theme}`);
  };

  /* A sheet is taller than the fold and is drawn over the screen, so it is
     shot at the plain viewport rather than grown to the content. */
  const shootViewport = async (name) => {
    await strip();
    const file = `${outDir}/${name}-trans-${theme}.png`;
    await page.locator('[data-app-root]').screenshot({ path: file });
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

  /* The palette and the theme are set after the last navigation, never
     before: `goto` remounts the shell and takes a manually stamped
     `data-theme` with it. */
  const dress = async () => {
    await settle('/settings');
    await page.locator('[data-palette-pick="trans"]').click();
    await page.locator(`[data-segment="${theme}"]`).click();
    await page.waitForFunction((want) => document.documentElement.dataset.theme === want, theme);
  };

  const importPaper = async (paper) => {
    const bytes = await paperImage(paper);
    page.once('filechooser', (chooser) =>
      chooser.setFiles({ name: 'scan_0142.jpg', mimeType: 'image/jpeg', buffer: bytes })
    );
    await page.locator('[data-add]').click();
    await page.waitForSelector('#document-title');
    await page.locator('#document-title').fill(paper.title);
    /* The visible field is flatpickr's altInput and the ISO value lives on
       the hidden original, so a date is set through the picker instance the
       way walkthrough.test.mjs sets one. */
    await page.evaluate((iso) => {
      const el = document.querySelector('#document-day');
      const fp = el?._flatpickr ?? el?.flatpickr;
      if (!fp) throw new Error('no flatpickr instance on #document-day');
      fp.setDate(iso, true);
    }, paper.day);
    return bytes;
  };

  await settle('/');
  await page.getByRole('button', { name: 'Reset demo state' }).click();
  await page.waitForTimeout(1500);
  await dress();

  /* ---------- 01: nothing filed yet, which is what every first visit to
     this screen looks like. ---------- */
  await settle('/media/documents');
  await page.waitForSelector('[data-notice="documents-empty"]');
  await shoot('01-empty');

  /* ---------- 02: the import sheet, after a page has been chosen and a
     title typed. The picker comes first on purpose, so this sheet is never
     seen without something behind it. ---------- */
  await importPaper(PAPERS[0]);
  await page.waitForTimeout(400);
  await shootViewport('02-import-sheet');

  /* ---------- 03: the list. Four rows, one of them dated 1994, and no page
     image anywhere on it (ADR-0065). ---------- */
  await page.locator('[data-save-document]').click();
  await page.waitForSelector('[data-notice="documents-empty"]', { state: 'detached' });
  for (const paper of PAPERS.slice(1)) {
    await importPaper(paper);
    await page.locator('[data-save-document]').click();
    await page.waitForTimeout(500);
  }
  await page.waitForTimeout(600);
  await shoot('03-list');

  /* ---------- 04: one document's own screen, which is the only place the
     page is drawn. ---------- */
  await page.locator('[data-list-row]').first().click();
  await page.waitForSelector('#document-title');
  await page.waitForTimeout(1200);
  await shoot('04-one-document');

  /* ---------- 05-07: the link (phase 8 features ticket 56). The seeded
     persona is what the picker needs: "Reset demo state" leaves no
     procedures and no regimen episodes, so a picker shot taken against it
     would show one section of four. "Fill every feature" is the jump that
     puts something under every heading. ---------- */
  await settle('/');
  await page.locator('[data-fill-every-feature]').click();
  await page.waitForURL('**/more');
  await page.waitForTimeout(1500);
  await dress();

  await settle('/media/documents');
  await page.locator('[data-list-row]').first().click();
  await page.waitForSelector('#document-title');
  await page.locator('[data-pick-document-target]').click();
  await page.waitForSelector('[data-pick-target]');
  await page.waitForTimeout(400);
  await shootViewport('05-picker');

  /* The goal the ticket was written around: paper arrives for "keep every
     opinion" long before that step could ever be ticked. */
  const GOAL = 'pl-medical-keep-opinions';
  await page.locator(`[data-pick-target="goal:${GOAL}"]`).click();
  await page.waitForTimeout(800);
  await shoot('06-document-linked');

  /* ---------- 07: the other end. The goal's own sheet lists what points at
     it; the goal itself stores nothing. ---------- */
  await settle('/transition/roadmap');
  await page.locator(`[data-open-goal="${GOAL}"]`).click();
  await page.waitForSelector('[data-goal-sheet-status]');
  await page.waitForTimeout(600);
  await shootViewport('07-goal-sheet');

  await page.close();
}

await browser.close();
await app.close();
console.log(`${shots.length} shots in ${outDir}`);
for (const shot of shots) console.log(`  ${shot}.png`);
