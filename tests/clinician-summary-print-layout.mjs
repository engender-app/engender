/* Run after VITE_DEMO=1 npm run build. Poppler checks the exported text;
   screenshots and PDFs remain under --out for visual review. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { preview } from 'vite';
import { fillDate, launchChromium } from './browser-harness.mjs';
import { PALETTES } from './palettes.mjs';

const outIndex = process.argv.indexOf('--out');
const out = resolve(outIndex < 0 ? '.claude/clinician-print-shots' : process.argv[outIndex + 1]);
await mkdir(out, { recursive: true });
const server = await preview({ preview: { port: 0 } });
const browser = await launchChromium();
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 }, reducedMotion: 'reduce' });
const base = `http://localhost:${server.httpServer.address().port}`;
const errors = [];
const results = [];
page.on('pageerror', error => errors.push(error.message));
const normalize = text => text.replace(/\s+/g, '').normalize('NFC');

async function load(path) {
  await page.goto(base + path, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-app-root][data-boot="ready"]');
}
async function closeSheet() {
  await page.keyboard.press('Escape');
  await page.waitForSelector('[data-sheet]', { state: 'detached' });
}
async function summary() {
  await load('/health/clinician-summary');
  await page.waitForSelector('[data-clinician-dossier]');
  await page.locator('[data-settings-row]').click();
  const start = new Date();
  start.setFullYear(start.getFullYear() - 3);
  await fillDate(page, '#clinician-summary-start', start.toLocaleDateString('sv-SE'));
  await closeSheet();
  await page.waitForSelector('[data-clinician-dossier]');
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    document.querySelectorAll('.demo-bar, [data-toast]').forEach(element => element.remove());
    document.body.classList.remove('has-demo-bar');
  });
}
async function exportPdf(name) {
  await page.emulateMedia({ media: 'print' });
  const cells = await page.locator('.dossier-table td').allTextContents();
  const caveats = await page.locator('.dossier-footnote, .dossier-disclaimer').allTextContents();
  const headerValues = await page.locator('.summary-heading > p, .dossier-profile-value').evaluateAll(elements =>
    elements.filter(element => getComputedStyle(element).display !== 'none').map(element => element.textContent)
  );
  const headings = await page.locator('.dossier-section-title, .sub-heading').allTextContents();
  const file = `${out}/${name}.pdf`;
  await page.pdf({ path: file, format: 'A4', printBackground: true });
  const text = execFileSync('pdftotext', ['-raw', file, '-'], { encoding: 'utf8' });
  const missing = [...cells, ...caveats, ...headerValues].filter(value => !normalize(text).includes(normalize(value)));
  assert.deepEqual(missing, [], `${name}: printed values, units, dates and caveats`);
  for (const printedPage of text.split('\f').slice(0, -2)) {
    assert(!headings.some(heading => normalize(printedPage).endsWith(normalize(heading))), `${name}: no orphaned heading`);
  }
  const geometry = await page.locator('.dossier-table-wrap').evaluateAll(elements =>
    elements.map(element => ({ width: element.clientWidth, content: element.scrollWidth }))
  );
  assert(geometry.every(item => item.content <= item.width + 1), `${name}: no clipped table`);
  assert(await page.locator('.summary-heading h1').isVisible(), `${name}: title prints`);
  const info = execFileSync('pdfinfo', [file], { encoding: 'utf8' });
  const pages = Number(info.match(/Pages:\s+(\d+)/)[1]);
  results.push({ name, pages, cells: cells.length, caveats: caveats.length, geometry });
  await page.emulateMedia({ media: 'screen' });
  return text;
}

try {
  await load('/');
  if (await page.locator('[data-leave-setup]').count()) {
    await page.locator('[data-leave-setup]').click();
    await page.waitForSelector('[data-home-hello]');
  }
  await page.locator('[data-fill-every-feature]').click();
  await page.waitForURL('**/more', { timeout: 240000 });
  await page.waitForSelector('[data-demo-busy]', { state: 'detached', timeout: 240000 });
  for (const locale of ['en', 'pl']) {
    await load('/settings');
    await page.locator('[data-list-row="language"]').click();
    await page.locator(`[data-segment="${locale}"]`).click();
    await page.waitForFunction(language => document.documentElement.lang === language, locale);
    await summary();
    const screenSections = await page.locator('[data-dossier-section]').evaluateAll(elements =>
      elements.map(element => element.dataset.dossierSection)
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: `${out}/${locale}-preview-phone.png` });
    assert(await page.locator('.summary-heading h1').isVisible(), `${locale}: preview title visible`);
    for (const palette of PALETTES) for (const theme of ['light', 'dark']) {
      await page.evaluate(([palette, theme]) => {
        document.documentElement.dataset.palette = palette;
        document.documentElement.dataset.theme = theme;
      }, [palette, theme]);
      await page.locator('.summary-heading').scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${out}/${locale}-${palette}-${theme}.png` });
    }
    await page.evaluate(() => {
      document.documentElement.dataset.palette = 'trans';
      document.documentElement.dataset.theme = 'light';
    });
    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.screenshot({ path: `${out}/${locale}-preview-desktop.png` });
    await page.locator('[data-dossier-section="labs"]').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${out}/${locale}-preview-labs.png` });
    await exportPdf(`${locale}-full`);
    await page.emulateMedia({ media: 'print' });
    assert.deepEqual(await page.locator('[data-dossier-section]').evaluateAll(elements =>
      elements.filter(element => getComputedStyle(element).display !== 'none').map(element => element.dataset.dossierSection)
    ), screenSections, `${locale}: preview and print sections match`);
    await page.emulateMedia({ media: 'screen' });

    // Extend real lab rows only in this browser fixture to force table continuations.
    await page.evaluate(language => {
      const tbody = document.querySelector('[data-dossier-section="labs"] tbody');
      const original = tbody?.firstElementChild;
      if (!original) throw new Error('Demo lab fixture missing');
      for (let index = 0; index < 45; index++) {
        const row = original.cloneNode(true);
        row.classList.remove('dossier-row-overflow');
        const note = language === 'pl'
          ? 'Dłuższa notatka z laboratorium zachowuje datę, jednostkę i kontekst pobrania.'
          : 'Long laboratory note keeps the date, unit and sampling context together.';
        row.lastElementChild.textContent = `lab-print-row-${index} ${note} ${note}`;
        tbody.append(row);
      }
    }, locale);
    const longText = await exportPdf(`${locale}-long-labs`);
    for (let index = 0; index < 45; index++) {
      assert(longText.includes(`lab-print-row-${index}`), `${locale}: long lab row ${index} prints`);
    }

    await summary();
    await page.locator('[data-settings-row]').click();
    const recent = new Date();
    recent.setDate(recent.getDate() - 30);
    await fillDate(page, '#clinician-summary-start', recent.toLocaleDateString('sv-SE'));
    await page.locator('[data-inclusion="labs"] [role="switch"]').click();
    await page.locator('[data-inclusion="demographics"] [role="switch"]').click();
    const drugRows = page.locator('[data-dossier-drugs] [data-drug]');
    assert(await drugRows.count() > 1, 'Demo supplies concurrent drugs');
    const excludedDrug = await drugRows.first().getAttribute('data-drug');
    await drugRows.first().locator('[role="switch"]').click();
    await closeSheet();
    await page.waitForSelector('[data-dossier-section="labs"]', { state: 'detached' });
    const selectedText = await exportPdf(`${locale}-selected`);
    assert(results.at(-1).cells < results.find(result => result.name === `${locale}-full`).cells, `${locale}: shorter range prints fewer records`);
    assert(!normalize(selectedText).includes(normalize(excludedDrug)), `${locale}: excluded drug stays out of print`);
    assert(await page.locator('[data-dossier-section="demographics"]').count() === 0);
    assert(await page.locator('.summary-heading > p').first().isVisible(), `${locale}: range visible without demographics`);
    await page.locator('[data-settings-row]').click();
    await page.locator('[data-dossier-drugs] [data-drug]').first().locator('[role="switch"]').click();
    await closeSheet();
  }
  assert.deepEqual(errors, [], 'No uncaught page errors');
  console.log(JSON.stringify({ out, results: results.map(({ name, pages, cells, caveats }) => ({ name, pages, cells, caveats })), errors }, null, 2));
} finally {
  await writeFile(`${out}/results.json`, JSON.stringify({ results, errors }, null, 2) + '\n');
  await browser.close();
  await server.close();
}
