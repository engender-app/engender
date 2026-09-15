/* Sign-off crops for ticket 58 (the documents index says what a paper is).

   Cropped to what the ticket actually changed - the present-reading row and
   one group's own card - rather than the whole screen, per the review
   convention for a ticket that touches one part of an existing screen.
   `[data-list-card]` is the one hook both the old flat list and the new
   grouped one share, which is what lets "before" run unmodified against
   whatever code is checked out when it is invoked; "after" additionally
   uses the group/present-reading wrappers ticket 58 added.

   Default flag only, both themes.

   Run: VITE_DEMO=1 npm run build   first, then
        node tests/documents-index-58-gallery.mjs [outDir] [before|after]
   Default outDir is .claude/documents-index-58-shots (gitignored, durable),
   default mode is "after". */
import { preview } from 'vite';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './browser-harness.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(process.argv[2] ?? resolve(here, '../.claude/documents-index-58-shots'));
const mode = process.argv[3] ?? 'after';

const PAPERS = [
  { title: 'Skierowanie do endokrynologa', head: 'NFZ', day: '2024-05-02' },
  { title: 'Opinia psychiatryczna', head: 'PORADNIA ZDROWIA PSYCHICZNEGO', day: '2024-03-11' },
  { title: 'Zaświadczenie', head: 'PRZYCHODNIA', day: '2025-06-18' }
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
  page.on('pageerror', (error) => console.error('[pageerror]', error));
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.error('[console]', msg.text());
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
      ctx.fillStyle = '#8a8a8a';
      for (let i = 0; i < 10; i++) {
        const width = 730 - (i % 4) * 90;
        ctx.fillRect(60, 260 + i * 38, width, 12);
      }
      return canvas.toDataURL('image/jpeg', 0.85);
    }, paper);
    return Buffer.from(dataUrl.split(',')[1], 'base64');
  };

  const strip = () =>
    page.evaluate(() => {
      for (const toast of document.querySelectorAll('[data-toast]')) toast.remove();
      for (const bar of document.querySelectorAll('.demo-bar')) bar.remove();
    });

  const shootEl = async (locator, name) => {
    await strip();
    const file = `${outDir}/${name}-trans-${theme}.png`;
    await locator.screenshot({ path: file });
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
     before (documents-gallery.mjs's own reason: `goto` remounts the shell
     and takes a manually stamped `data-theme` with it). */
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
    await page.evaluate((iso) => {
      const el = document.querySelector('#document-day');
      const fp = el?._flatpickr ?? el?.flatpickr;
      if (!fp) throw new Error('no flatpickr instance on #document-day');
      fp.setDate(iso, true);
    }, paper.day);
    await page.locator('[data-save-document]').click();
    await page.waitForTimeout(500);
  };

  await settle('/');
  await page.getByRole('button', { name: 'Reset demo state' }).click();
  await page.waitForTimeout(1500);

  /* "before" runs against whatever code is checked out unmodified - the
     old flat list has no picker and no milestones/goals to attach to, so
     there is nothing to seed beyond the papers themselves. "after" seeds
     the full persona first, so a milestone and the roadmap goal both
     exist to attach a document to. */
  if (mode === 'after') {
    await page.locator('[data-fill-every-feature]').click();
    await page.waitForURL('**/more');
    await page.waitForTimeout(1500);
  }
  await dress();

  await settle('/media/documents');
  await page.waitForSelector('[data-add]');
  // "fill every feature" (ticket 36) seeds one document of its own, unfiled -
  // fine for "after" (one more row for the leftover group), but "before"
  // wants the screen the plain reset actually leaves, which is empty.
  if (mode === 'before') await page.waitForSelector('[data-notice="documents-empty"]');
  for (const paper of PAPERS) await importPaper(paper);
  await page.waitForTimeout(600);

  if (mode === 'before') {
    await shootEl(page.locator('[data-list-card]').first(), '01-list');
    await page.close();
    continue;
  }

  const rows = page.locator('[data-list-row]');

  await rows.first().click();
  await page.waitForSelector('#document-title');
  await page.locator('[data-pick-document-target]').click();
  await page.waitForSelector('[data-pick-target]');
  await page.locator('[data-pick-target="goal:pl-medical-keep-opinions"]').click();
  await page.waitForTimeout(400);
  await page.goBack();
  await page.waitForSelector('[data-list-row]');

  await rows.nth(1).click();
  await page.waitForSelector('#document-title');
  await page.locator('[data-pick-document-target]').click();
  await page.waitForSelector('[data-pick-target]');
  await page.locator('[data-pick-target^="milestone:"]').first().click();
  await page.waitForTimeout(400);
  await page.goBack();
  await page.waitForSelector('[data-list-row]');

  await page.waitForTimeout(600);
  await shootEl(page.locator('[data-documents-present-reading]'), '01-present-reading');
  await shootEl(page.locator('[data-documents-group="milestone"]'), '02-group-milestone');
  await shootEl(page.locator('[data-documents-group="goal"]'), '03-group-goal');
  await shootEl(page.locator('[data-documents-group="unattached"]'), '04-group-unattached');

  await page.close();
}

await browser.close();
await app.close();
console.log(`${shots.length} shots in ${outDir}`);
for (const shot of shots) console.log(`  ${shot}.png`);
