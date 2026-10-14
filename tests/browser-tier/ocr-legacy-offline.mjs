/* Historical integration proof. Supply a production build before backend21;
   the committed legacy identity fixes which runtime this scenario covers. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { buildRequestHandler } from '../serve-build.mjs';
import { launchBrowser, dateValue } from '../browser-harness.mjs';
import { firstRun, clientRoute, unlock } from './built-flow.mjs';

// Playwright's utility-world poll does not await async predicates. Evaluate
// each asynchronous cache/registration condition before deciding it is ready.
async function waitForCondition(page, predicate, argument, timeout = 60000) {
  const deadline = Date.now() + timeout;
  do {
    if (await page.evaluate(predicate, argument)) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  } while (Date.now() < deadline);
  throw new Error('OCR cache or registration condition did not complete');
}

const legacyRoot = process.env.OCR_LEGACY_BUILD;
const updateRoot = process.env.OCR_UPDATE_BUILD ?? process.cwd();
if (!legacyRoot) throw new Error('OCR_LEGACY_BUILD must contain the pre21 production build/ directory');
const identities = JSON.parse(readFileSync('src/lib/pwa/legacy-ocr-assets.json', 'utf8'));
for (const asset of identities) assert.equal(createHash('sha256').update(readFileSync(legacyRoot + '/build' + asset.path)).digest('hex'), asset.sha256);
const current = JSON.parse(readFileSync('build/tesseract/assets.json', 'utf8'));
const legacyAssets = ['/tesseract/worker.min.js', '/tesseract/tesseract-core.wasm.js',
  '/tesseract/tesseract-core.wasm', '/tesseract/lang-data/eng.traineddata', '/tesseract/lang-data/pol.traineddata'];
let updated = false;
let interrupt = true;
const server = createServer((req, res) => {
  if (updated && interrupt && req.url?.includes(current.generation) && req.url.endsWith('/pol.traineddata')) {
    setTimeout(() => { res.writeHead(503); res.end('interrupted OCR fill'); }, 300); return;
  }
  buildRequestHandler(updated ? updateRoot : legacyRoot)(req, res);
});
let browser;
try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  browser = await launchBrowser();
  const outcomes = [];
  for (const scanDuring of [true, false]) {
    updated = false; interrupt = true;
    const context = await browser.newContext({ locale: 'en-US' });
    const old = await context.newPage();
    old.on('console', message => { if (message.type() === 'error') console.error('legacy console:', message.text()); });
    old.on('pageerror', error => console.error('legacy page error:', error.message));
    old.on('requestfailed', request => { if (request.url().includes('tesseract') || identities.some(asset=>request.url().endsWith(asset.path))) console.error('legacy request failed:', request.url(), request.failure()); });
    await firstRun(old, origin);
    await waitForCondition(old, async () => (await navigator.serviceWorker.getRegistration())?.active?.state === 'activated');
    // Complete the old worker's owned download without executing the library.
    await old.evaluate(async () => (await navigator.serviceWorker.getRegistration()).active.postMessage('engender:cache-on-demand'));
    await waitForCondition(old, async assets => {
      const cache = await caches.open((await caches.keys()).find(name => name.startsWith('engender-shell-')));
      return (await Promise.all(assets.map(asset => cache.match(asset)))).every(Boolean);
    }, legacyAssets);
    // The first installing page is deliberately not claimed. Reload before
    // testing a retained controlled page, without initializing OCR.
    await old.reload();
    await unlock(old);
    assert.equal(await old.evaluate(() => Boolean(navigator.serviceWorker.controller)), true);
    const frozen = await old.evaluate(async assets => {
      const cache = await caches.open((await caches.keys()).find(name => name.startsWith('engender-shell-')));
      const hashes = {};
      for (const asset of assets) {
        const response = await cache.match(asset);
        if (!response) throw new Error('missing legacy ' + asset + '; caches: ' + JSON.stringify(await caches.keys()) + '; runtime matches: ' + JSON.stringify((await cache.keys()).map(request => request.url).filter(url => url.includes('C6x'))));
        const bytes = await response.arrayBuffer();
        hashes[asset] = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(x => x.toString(16).padStart(2, '0')).join('');
      }
      return hashes;
    }, [...legacyAssets, ...identities.map(asset => asset.path)]);
    await clientRoute(old, '/care/labs');
    await old.locator('[data-import-lab]').click();
    await old.locator('[data-ocr-state="picking"]').waitFor();
    const initialized = page => page.evaluate(paths => performance.getEntriesByType('resource').some(entry => paths.some(path => entry.name.endsWith(path))), identities.map(asset => asset.path));
    assert.equal(await initialized(old), false);
    const control = old;
    async function update() {
      return control.evaluate(async scope => {
        const registration = await navigator.serviceWorker.getRegistration(scope);
        await registration.update();
        const worker = registration.installing || registration.waiting;
        if (!worker) return 'absent';
        if (['installed', 'redundant'].includes(worker.state)) return worker.state;
        return new Promise(resolve => worker.addEventListener('statechange', () => {
          if (['installed', 'redundant'].includes(worker.state)) resolve(worker.state);
        }));
      }, origin + '/');
    }
    async function scans(page) {
      const results = [];
      for (const fixture of [{ language: 'en', date: 'Date: 2026-08-12', values: [123.4, 0.92, 18.5],
        lines: ['Estradiol 123.4 pg/mL', 'Testosterone 0.92 ng/mL', 'Prolactin 18.5 ng/mL'] },
        { language: 'pl', date: 'Data: 12.08.2026', values: [141, 0.8, 22.1],
          lines: ['Estradiol 141,0 pg/mL', 'Testosteron 0,80 ng/mL', 'Prolaktyna 22,1 ng/mL'] }]) {
        const bytes = await page.evaluate(async fixture => {
          const canvas = document.createElement('canvas'); canvas.width = 1600; canvas.height = 460;
          const ctx = canvas.getContext('2d'); ctx.fillStyle = 'white'; ctx.fillRect(0, 0, 1600, 460);
          ctx.fillStyle = 'black'; ctx.font = '48px sans-serif';
          [fixture.language === 'en' ? 'Laboratory results' : 'Wyniki badań', fixture.date, ...fixture.lines]
            .forEach((line, i) => ctx.fillText(line, 40, 65 + i * 80));
          const image = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
          return [...new Uint8Array(await image.arrayBuffer())];
        }, fixture);
        const chooser = page.waitForEvent('filechooser');
        await page.locator('[data-ocr-pick="gallery"]').click();
        await (await chooser).setFiles({ name: fixture.language + '.png', mimeType: 'image/png', buffer: Buffer.from(bytes) });
        await page.locator('[data-ocr-state="review"], [data-ocr-state="recognition-failed"], [data-ocr-state="pick-failed"], [data-ocr-state="no-rows"]').waitFor({ timeout: 60000 });
        assert.equal(await page.locator('[data-ocr-state]').getAttribute('data-ocr-state'), 'review', await page.locator('[data-ocr-state]').innerText());
        const values = await page.locator('[data-ocr-field="value"]').evaluateAll(inputs => inputs.map(input => Number(input.value.replace(',', '.'))));
        const analytes = await page.locator('[data-ocr-field="analyte"]').evaluateAll(inputs => inputs.map(input => input.value));
        const units = await page.locator('[data-ocr-field="unit"]').evaluateAll(inputs => inputs.map(input => input.value));
        const dates = [];
        for (const locator of await page.locator('[data-ocr-field="date"]').all()) dates.push(await dateValue(locator));
        assert.deepEqual(values, fixture.values);
        assert.deepEqual(analytes, ['estradiol', 'testosterone', 'prolactin']);
        assert.deepEqual(units, ['pg/mL', 'ng/mL', 'ng/mL']);
        assert.deepEqual(dates, ['2026-08-12', '2026-08-12', '2026-08-12']);
        results.push({ language: fixture.language, values, analytes, units, dates });
        await page.keyboard.press('Escape');
        await page.locator('[data-ocr-state="review"]').waitFor({ state: 'detached' });
        await page.locator('[data-import-lab]').click();
        await page.locator('[data-ocr-state="picking"]').waitFor();
      }
      return results;
    }
    updated = true;
    assert.equal(await update(), 'redundant');
    await context.setOffline(true);
    const interruptedScans = scanDuring ? await scans(old) : [];
    if (!scanDuring) assert.equal(await initialized(old), false);
    await context.setOffline(false);
    interrupt = false;
    assert.equal(await update(), 'installed');
    await control.evaluate(async scope => (await navigator.serviceWorker.getRegistration(scope)).waiting.postMessage('engender:skip-waiting'), origin + '/');
    await waitForCondition(control, async scope => {
      const registration = await navigator.serviceWorker.getRegistration(scope);
      return !registration.waiting && registration.active.state === 'activated';
    }, origin + '/');
    await context.setOffline(true);
    const retainedScans = await scans(old);
    const after = await control.evaluate(async assets => {
      const result = {};
      for (const asset of assets) {
        const response = await caches.match(asset);
        if (!response) throw new Error('missing retained ' + asset);
        const bytes = await response.arrayBuffer();
        result[asset] = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(x => x.toString(16).padStart(2, '0')).join('');
      }
      return result;
    }, [...legacyAssets, ...identities.map(asset => asset.path)]);
    assert.deepEqual(after, frozen);
    outcomes.push({ libraryNeverInitializedBeforeUpdate: true, firstScanAfterSuccessfulUpdate: !scanDuring,
      frozen, interruptedScans, retainedScans });
    await context.close();
  }
  console.log(JSON.stringify({ passed: true, legacyRoot, updateRoot, outcomes }, null, 2));
} finally {
  await browser?.close();
  server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
}
