/* Built-app proof that a direct Wrapped share URL respects era mutes. */
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { preview } from 'vite';
import { launchChromium } from './browser-harness.mjs';

const app = await preview({ preview: { port: 0 } });
const base = `http://localhost:${app.httpServer.address().port}`;
const browser = await launchChromium();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));

try {
  await page.goto(`${base}/wrapped/week/share`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-app-root][data-boot="ready"]', { timeout: 60000 });
  await page.waitForSelector('[data-generate]');

  let journalUrl;
  for (const file of await readdir('build/_app/immutable/chunks')) {
    if (!file.endsWith('.js')) continue;
    if ((await readFile(`build/_app/immutable/chunks/${file}`, 'utf8')).includes('the journal was reported open before it was attached')) {
      journalUrl = `${base}/_app/immutable/chunks/${file}`;
      break;
    }
  }
  assert.ok(journalUrl, 'built journal module exists');
  const era = await page.evaluate(async (url) => {
    const module = await import(url);
    const journal = Object.values(module).find((value) => value !== null && typeof value === 'object' && typeof value.eras?.getEras === 'function');
    if (!journal) throw new Error('open journal export was not found');
    for (const row of await journal.eras.getEras()) await journal.eras.deleteEra(row.id);
    const id = await journal.eras.upsertEra({ name: 'kept out', startEpochDay: null, endEpochDay: null });
    await journal.eraMutes.setEraMuted(id, true);
    return id;
  }, journalUrl);

  await page.waitForSelector('[data-notice="wrapped-muted"]');
  await page.waitForFunction(() => !document.querySelector('[data-generate], [data-share], [data-wrapped-card]'));
  assert.equal(await page.locator('[data-generate], [data-share], [data-wrapped-card]').count(), 0);
  console.log('PASS share content disappears when its period becomes muted');

  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('[data-notice="wrapped-muted"]');
  assert.equal(await page.locator('[data-generate], [data-share], [data-wrapped-card]').count(), 0);
  assert.equal((await page.locator('[data-notice="wrapped-muted"]').innerText()).replace(/\n+/g, '\n'), 'Kept out of view\nThis period includes an era you keep out of resurfacing.\nEras');
  console.log('PASS direct share URL shows existing muted notice and no share controls');

  await page.goto(`${base}/wrapped/week`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-notice="wrapped-muted"]');
  assert.equal(await page.locator('a[href="/wrapped/week/share"]').count(), 0);
  console.log('PASS wrapped route hides share link for muted period');

  await page.goto(`${base}/stats`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-lookback-readings]');
  assert.equal(await page.locator('[data-wrapped-card], [data-on-this-day-card]').count(), 0);
  console.log('PASS Look back offers no muted retrospective');

  await page.evaluate(async ({ url, id }) => {
    const module = await import(url);
    const journal = Object.values(module).find((value) => value !== null && typeof value === 'object' && typeof value.eraMutes?.setEraMuted === 'function');
    await journal.eraMutes.setEraMuted(id, false);
  }, { url: journalUrl, id: era });
  await page.waitForSelector('[data-wrapped-card]');
  await page.goto(`${base}/wrapped/week/share`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-generate]');
  assert.equal(await page.locator('[data-notice="wrapped-muted"]').count(), 0);
  assert.deepEqual(errors, []);
  console.log('PASS unmuting restores Look back and direct sharing without page errors');
} finally {
  await browser.close();
  await new Promise((resolve) => app.httpServer.close(resolve));
}
