import assert from 'node:assert/strict';
import { launchChromium, previewBuild, settlePage } from './browser-harness.mjs';

const app = await previewBuild(process.cwd());
const base = `http://localhost:${app.httpServer.address().port}`;
const browser = await launchChromium();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
let failures = 0;
async function load(path) {
  await page.goto(base + path, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-app-root][data-boot="ready"]', { timeout: 5000 });
}
async function check(name, run) {
  errors.length = 0;
  try {
    await run();
    assert.deepEqual(errors, [], `${name}: no page errors`);
    console.log(`PASS ${name}`);
  } catch (error) {
    failures++;
    console.error(`FAIL ${name}: ${error.message}; page errors: ${JSON.stringify(errors)}`);
  }
}

try {
  await settlePage(page, base, '/settings', 'light');
  await page.locator('[data-list-row="language"]').click();
  await page.locator('[data-segment="en"]').click();
  for (const path of [
    '/day/abc', '/entry/new/abc', '/entry/new/99999', '/entry/new/NaN', '/entry/new/9999-12-31',
    '/day/NaN', '/day/2026-02-30', '/entry/new/2026-02-30',
    '/day/1.5', '/day/1e3', '/day/0x10', '/day/-1', '/day/9007199254740991'
  ]) {
    await check(path, async () => {
      await load(path);
      await page.getByText('This record is unavailable', { exact: true }).waitFor({ timeout: 3000 });
      assert.ok(await page.locator('[data-nav-item="calendar"]').isVisible(), 'app chrome remains visible');
      assert.ok(await page.locator('[data-screen-back]').isVisible(), 'Back remains visible');
      assert.equal(await page.locator('#ed-note').count(), 0, 'no writable editor');
      await page.locator('[data-screen-back]').click();
      await page.waitForURL((url) => url.pathname !== path, { timeout: 3000 });
    });
  }
  for (const path of [
    '/entry/abc', '/search/questions/zzz', '/transition/letters/zzz',
    '/transition/tryouts/zzz', '/stats/zzz', '/wrapped/zzz', '/media/documents/zzz'
  ]) {
    await check(path, async () => {
      await load(path);
      assert.ok(await page.locator('[data-nav-item="calendar"]').isVisible(), 'app chrome remains visible');
      assert.ok(await page.locator('[data-screen-back]').isVisible(), 'Back remains visible');
      assert.ok((await page.locator('[data-app-scroll-region]').innerText()).trim().length > 0, 'screen is not blank');
    });
  }
  await check('ISO day and epoch day show the same date', async () => {
    await load('/day/2026-10-05');
    const isoTitle = await page.locator('h1').innerText();
    await load('/day/20731');
    assert.equal(await page.locator('h1').innerText(), isoTitle);
    assert.match(isoTitle, /5 October/);
  });
  await check('ISO new entry opens its day and preserves seedMood', async () => {
    await load('/entry/new/2026-10-05?seedMood=4');
    await page.locator('#ed-note').waitFor({ timeout: 3000 });
    assert.equal(await page.locator('[data-mood="4"]').getAttribute('aria-checked'), 'true');
    assert.match(await page.locator('[data-app-scroll-region]').innerText(), /5 October/);
  });
  await check('today new entry remains writable', async () => {
    await load('/entry/new/today');
    await page.locator('#ed-note').waitFor();
    assert.equal(await page.locator('#ed-note').isEditable(), true);
  });
  await check('same-route navigation reads the second letter', async () => {
    await load('/more');
    await page.locator('[data-fill-every-feature]').dispatchEvent('click');
    await page.waitForFunction(() => !document.querySelector('[data-fill-every-feature]').disabled);
    await load('/transition/letters');
    await page.locator('[data-letter-open]').nth(1).waitFor();
    const ids = await page.locator('[data-letter-open]').evaluateAll((nodes) => nodes.map((node) => node.dataset.letterOpen));
    await load(`/transition/letters/${ids[0]}`);
    const firstText = await page.locator('[data-letter-text]').innerText();
    await page.evaluate((id) => {
      window.letterRouteDocument = document;
      const link = document.createElement('a');
      link.href = `/transition/letters/${id}`;
      link.dataset.secondLetter = '';
      link.textContent = 'Open second letter';
      document.querySelector('[data-app-scroll-region]').append(link);
    }, ids[1]);
    await page.locator('[data-second-letter]').click();
    await page.waitForURL(`**/transition/letters/${ids[1]}`);
    await page.locator(`[data-letter="${ids[1]}"] [data-letter-text]`).waitFor({ timeout: 3000 });
    assert.equal(await page.evaluate(() => document === window.letterRouteDocument), true, 'navigation keeps the document');
    assert.notEqual(await page.locator('[data-letter-text]').innerText(), firstText);
  });
} finally {
  await browser.close();
  await app.close();
}
assert.equal(failures, 0, `${failures} address regressions failed`);
