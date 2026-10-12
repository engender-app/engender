/* Real journal entries, selected through the book's controls, on screen and
   in A4 PDFs. Run after VITE_DEMO=1 npm run build. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fillDate, launchChromium, previewBuild, settlePage } from './browser-harness.mjs';
import { PALETTES } from './palettes.mjs';

const out = resolve(process.argv[2] ?? '.claude/journal-book-entry-shots');
await mkdir(out, { recursive: true });
const app = await previewBuild(process.cwd());
const base = `http://localhost:${app.httpServer.address().port}`;
const browser = await launchChromium();
const errors = [];
let shots = 0;
const reports = [];
const days = ['2023-01-01', '2023-01-02', '2023-01-03', '2023-01-04'];
const epochDay = (iso) => Math.round(Date.parse(iso) / 86400000);

async function picture(page, index) {
  return Buffer.from((await page.evaluate((index) => {
    const canvas = document.createElement('canvas');
    canvas.width = index === 0 ? 300 : 900;
    canvas.height = index === 0 ? 2400 : 600;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = ['#d2e4ed', '#eed2b2', '#d2e4cf', '#e4d2ed'][index];
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#263a45';
    ctx.lineWidth = 12;
    ctx.strokeRect(8, 8, canvas.width - 16, canvas.height - 16);
    ctx.fillStyle = '#263a45';
    ctx.font = '36px sans-serif';
    ctx.fillText(`Photo ${index + 1} top`, 24, 60);
    ctx.fillText(`Photo ${index + 1} bottom`, 24, canvas.height - 30);
    return canvas.toDataURL('image/jpeg');
  }, index)).split(',')[1], 'base64');
}

try {
  for (const locale of ['en', 'pl']) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    page.on('pageerror', (error) => errors.push(error.message));
    await settlePage(page, base, '/settings', 'light');
    await page.locator('[data-list-row="language"]').click();
    await page.locator(`[data-segment="${locale}"]`).click();
    const phrase = locale === 'en' ? 'Today I wrote these words in my journal.' : 'Dzisiaj zapisuję te słowa w moim dzienniku.';
    const notes = [
      `SHORTONE ${phrase}\n\nENDONE`,
      `SHORTTWO ${phrase}\n\nENDTWO`,
      Array.from({ length: 110 }, (_, i) => `LINE${String(i).padStart(3, '0')} ${phrase}`).join('\n'),
      `PHOTOS ${phrase}`
    ];
    for (let i = 0; i < days.length; i++) {
      await settlePage(page, base, `/entry/new/${epochDay(days[i])}?seedMood=3`, 'light');
      await page.locator('#ed-note').fill(notes[i]);
      if (i === 3) {
        await page.locator('[data-section-chip="photos"]').click();
        for (let photo = 0; photo < 4; photo++) {
          const chosen = page.waitForEvent('filechooser');
          await page.locator('[data-add-photo]').click();
          await (await chosen).setFiles({ name: `photo-${photo}.jpg`, mimeType: 'image/jpeg', buffer: await picture(page, photo) });
          await page.locator('[data-photo-day-skip]').click();
          await page.locator('[data-photo-day-skip]').waitFor({ state: 'detached' });
          await page.waitForFunction((count) => document.querySelectorAll('.photo-wrap').length === count, photo + 1);
        }
      }
      await page.locator('[data-save]').click();
      await page.waitForURL((url) => url.pathname === '/');
    }
    await settlePage(page, base, '/settings/journal-book', 'light');
    await fillDate(page, '#journal-book-start', days[0]);
    await fillDate(page, '#journal-book-end', days[3]);
    await page.locator('[data-book-preview-toggle]').click();
    await page.waitForFunction(() => document.querySelectorAll('[data-book-entry]').length === 4 && document.querySelectorAll('[data-book-photo]').length === 4);
    assert.deepEqual(await page.locator('.book-note').allTextContents(), notes);
    const part = (key) => page.locator(`[data-inclusion="${key}"] [role="switch"]`);
    await part('photos').click();
    await page.waitForFunction(() => document.querySelectorAll('[data-book-photo]').length === 0);
    assert.deepEqual(await page.locator('.book-note').allTextContents(), notes);
    await part('photos').click();
    await page.waitForFunction(() => document.querySelectorAll('[data-book-photo]').length === 4);
    await fillDate(page, '#journal-book-start', days[1]);
    await page.waitForFunction(() => document.querySelectorAll('[data-book-entry]').length === 3);
    assert.deepEqual(await page.locator('.book-note').allTextContents(), notes.slice(1));
    await fillDate(page, '#journal-book-start', days[0]);
    await page.waitForFunction(() => document.querySelectorAll('[data-book-entry]').length === 4);

    const entries = page.locator('[data-book-entry]');
    const dress = async (palette, theme, zoom = 1) => page.evaluate(({ palette, theme, zoom }) => {
      document.documentElement.dataset.palette = palette;
      document.documentElement.dataset.theme = theme;
      document.documentElement.style.zoom = String(zoom);
    }, { palette, theme, zoom });
    for (const palette of locale === 'en' ? PALETTES : ['trans']) {
      for (const theme of ['light', 'dark']) {
        await dress(palette, theme);
        assert.equal(await entries.first().evaluate((entry) => entry.scrollWidth <= entry.clientWidth), true);
        await entries.first().screenshot({ path: `${out}/${locale}-${palette}-${theme}.png` });
        shots++;
      }
    }
    await dress('trans', 'light', 2);
    assert.equal(await entries.first().evaluate((entry) => entry.scrollWidth <= entry.clientWidth), true);
    await entries.first().screenshot({ path: `${out}/${locale}-200pct.png` });
    shots++;
    await dress('trans', 'light');
    await page.setViewportSize({ width: 1280, height: 900 });
    await entries.first().screenshot({ path: `${out}/${locale}-desktop.png` });
    shots++;

    await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
    await page.emulateMedia({ media: 'print' });
    await page.evaluate(() => document.fonts.ready);
    const photos = await page.locator('[data-book-photo]').evaluateAll((images) => images.map((image) => ({
      width: image.getBoundingClientRect().width,
      height: image.getBoundingClientRect().height,
      ratio: image.naturalWidth / image.naturalHeight
    })));
    for (const photo of photos) {
      assert.ok(photo.height <= 170 * 96 / 25.4 + 1);
      assert.ok(Math.abs(photo.width / photo.height - photo.ratio) < 0.01);
    }
    const pdf = `${out}/${locale}-book.pdf`;
    await page.pdf({ path: pdf, format: 'A4', printBackground: true });
    const text = execFileSync('pdftotext', ['-layout', pdf, '-'], { encoding: 'utf8' });
    for (const token of ['SHORTONE', 'ENDONE', 'SHORTTWO', 'ENDTWO', 'PHOTOS', ...Array.from({ length: 110 }, (_, i) => `LINE${String(i).padStart(3, '0')}`)]) {
      assert.equal(text.split(token).length - 1, 1, `${locale}: ${token} prints once`);
    }
    const pages = text.split('\f').slice(0, -1);
    const dates = await page.locator('.book-day').allTextContents();
    for (let i = 0; i < dates.length; i++) {
      assert.equal(text.split(dates[i]).length - 1, i === 0 || i === 3 ? 2 : 1, `${locale}: date prints once per entry`);
    }
    assert.equal(text.split(phrase).length - 1, 113, `${locale}: note words survive printing`);
    for (const [start, end] of [['SHORTONE', 'ENDONE'], ['SHORTTWO', 'ENDTWO']]) {
      assert.equal(pages.findIndex((p) => p.includes(start)), pages.findIndex((p) => p.includes(end)), `${locale}: short entry stays together`);
    }
    assert.ok(pages.findIndex((p) => p.includes('LINE000')) < pages.findIndex((p) => p.includes('LINE109')));
    assert.ok(pages.length >= 4);
    execFileSync('pdftoppm', ['-scale-to', '1100', '-png', pdf, `${out}/${locale}-page`]);
    reports.push({ locale, entries: notes.length, photos: photos.length, pages: pages.length });
    await page.close();
  }
  assert.deepEqual(errors, []);
  await writeFile(`${out}/report.json`, JSON.stringify({ reports, shots, errors }, null, 2) + '\n');
  console.log(`PASS journal book: ${shots} preview shots; EN/PL range and photo selection; complete long notes; proportional photos; A4 PDFs`);
} finally {
  await browser.close();
  await app.close();
}
