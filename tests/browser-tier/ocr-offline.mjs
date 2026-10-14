/* Production PWA installation plus real EN/PL OCR. Release B changes only a
   library comment, giving two compatible, distinct content-addressed sets. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { build } from 'vite';
import { launchBrowser } from '../browser-harness.mjs';
import { buildRequestHandler } from '../serve-build.mjs';

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

const temporary = mkdtempSync(join(tmpdir(), 'engender-ocr-offline-'));
let browser;
let server;
try {
  const a = join(temporary, 'a');
  const b = join(temporary, 'b');
  cpSync('build', join(a, 'build'), { recursive: true });
  cpSync('build', join(b, 'build'), { recursive: true });
  const manifestA = JSON.parse(readFileSync('build/tesseract/assets.json', 'utf8'));
  const prefixA = `/tesseract/${manifestA.generation}/`;
  const library = join(b, 'build', prefixA, 'tesseract.esm.min.js');
  writeFileSync(library, readFileSync(library, 'utf8') + '\n/* compatible generation B fixture */\n');
  const hash = createHash('sha256');
  for (const asset of manifestA.assets) {
    hash.update(asset.slice(prefixA.length) + '\0');
    hash.update(createHash('sha256').update(readFileSync(join(b, 'build', asset))).digest());
  }
  const generationB = hash.digest('hex');
  const prefixB = `/tesseract/${generationB}/`;
  renameSync(join(b, 'build', prefixA), join(b, 'build', prefixB));
  const manifestB = { generation: generationB, assets: manifestA.assets.map(asset => asset.replace(prefixA, prefixB)) };
  writeFileSync(join(b, 'build/tesseract/assets.json'), JSON.stringify(manifestB));
  const versionA = JSON.parse(readFileSync('build/_app/version.json', 'utf8')).version;
  const versionB = `${versionA}-ocr-b`;
  const workerB = readFileSync(join(b, 'build/service-worker.js'), 'utf8')
    .replaceAll(prefixA, prefixB).replaceAll(versionA, versionB);
  assert(workerB.includes(generationB) && workerB.includes(versionB));
  writeFileSync(join(b, 'build/service-worker.js'), workerB);

  await build({ configFile: false, logLevel: 'warn', build: { outDir: join(temporary, 'probe'),
    lib: { entry: 'tests/android-tier/ocr/ocr-probe.ts', name: 'ocrProof', formats: ['iife'], fileName: () => 'probe.js' },
    emptyOutDir: true, minify: false, target: 'chrome104' } });
  const probeA = readFileSync(join(temporary, 'probe/probe.js'), 'utf8');
  const probeB = probeA.replaceAll(prefixA, prefixB);
  assert(probeA.includes(generationB) === false && probeB.includes(generationB));

  let release = a;
  let interrupt = true;
  const requests = [];
  server = createServer((req, res) => {
    requests.push(req.url);
    if (req.url === '/ocr-control') {
      res.writeHead(200, { 'Content-Type': 'text/html' }); res.end('<!doctype html><title>OCR installation proof</title>'); return;
    }
    if (interrupt && req.url?.endsWith('/lang-data/pol.traineddata')) { res.writeHead(503); res.end('interrupted fixture'); return; }
    buildRequestHandler(release)(req, res);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  browser = await launchBrowser();
  const context = await browser.newContext();
  const page = await context.newPage();
  const external = [];
  context.on('request', request => { if (new URL(request.url()).origin !== origin) external.push(request.url()); });
  await page.goto(origin + '/ocr-control');
  async function install() {
    return page.evaluate(async () => {
      const registration = await navigator.serviceWorker.register('/service-worker.js', { updateViaCache: 'none' });
      if (registration.active) await registration.update();
      const worker = registration.installing || registration.waiting || registration.active;
      if (!worker) return 'absent';
      if (['redundant', 'installed', 'activated'].includes(worker.state)) return worker.state;
      return new Promise(resolve => worker.addEventListener('statechange', () => {
        if (['redundant', 'installed', 'activated'].includes(worker.state)) resolve(worker.state);
      }));
    });
  }
  assert.equal(await install(), 'redundant');
  assert.equal(await page.evaluate(async () => Boolean((await navigator.serviceWorker.getRegistration())?.active)), false);
  assert.equal(await page.evaluate(async () => {
    let count = 0; for (const key of await caches.keys()) count += (await (await caches.open(key)).keys()).length; return count;
  }), 0, 'interrupted addAll must not expose partial installation');
  interrupt = false;
  await install();
  await waitForCondition(page, async () => (await navigator.serviceWorker.getRegistration())?.active?.state === 'activated');
  const stored = await page.evaluate(async assets => {
    const cache = await caches.open((await caches.keys()).find(name => name.startsWith('engender-shell-')));
    const entries = await cache.keys();
    for (const path of assets) if (!await cache.match(path)) throw new Error(`missing installed ${path}`);
    let bytes = 0; for (const path of assets) bytes += (await (await cache.match(path)).arrayBuffer()).byteLength;
    let totalBytes = 0;
    for (const request of entries) totalBytes += (await (await cache.match(request)).arrayBuffer()).byteLength;
    const estimate = await navigator.storage.estimate();
    return { bytes, totalBytes, applicationBytes: totalBytes - bytes, quotaUsage: estimate.usage, entries: entries.length };
  }, [...manifestA.assets, ...manifestA.legacyRuntime.map(asset => asset.path)]);
  const beforeFirstScan = requests.filter(path => path.startsWith(prefixA));
  assert.equal(new Set(beforeFirstScan).size, manifestA.assets.length);
  await context.setOffline(true);
  await page.goto(origin + '/');
  await page.reload();
  await page.evaluate(probeA);
  await page.evaluate(() => window.ocrProbe.run());
  const fresh = await page.evaluate(() => window.ocrProbe.result);
  assert.equal(fresh.passed, true, JSON.stringify(fresh));

  await context.setOffline(false);
  const held = await context.newPage();
  await held.goto(origin + '/');
  await held.evaluate(probeA); // No recognition and no OCR fetch on this page.
  release = b;
  interrupt = true;
  assert.equal(await install(), 'redundant');
  assert.equal(await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).active.state), 'activated');
  await context.setOffline(true);
  await held.evaluate(() => window.ocrProbe.run());
  const duringInterruptedUpdate = await held.evaluate(() => window.ocrProbe.result);
  assert.equal(duringInterruptedUpdate.passed, true, JSON.stringify(duringInterruptedUpdate));
  await context.setOffline(false);
  interrupt = false;
  await install();
  await waitForCondition(page, async () => Boolean((await navigator.serviceWorker.getRegistration())?.waiting));
  await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).waiting.postMessage('engender:skip-waiting'));
  await waitForCondition(page, async () => !(await navigator.serviceWorker.getRegistration())?.waiting);
  await context.setOffline(true);
  await held.evaluate(() => { performance.clearResourceTimings(); return window.ocrProbe.run(); });
  const retained = await held.evaluate(() => window.ocrProbe.result);
  assert.equal(retained.passed, true, JSON.stringify(retained));
  await page.reload();
  await page.evaluate(probeB);
  await page.evaluate(() => window.ocrProbe.run());
  const updated = await page.evaluate(() => window.ocrProbe.result);
  assert.equal(updated.passed, true, JSON.stringify(updated));
  assert.equal(external.length, 0, JSON.stringify(external));
  console.log(JSON.stringify({ passed: true, generationA: manifestA.generation, generationB,
    stored, interruptedFreshInstall: 'no active worker or partial cache', retry: 'complete',
    fresh, duringInterruptedUpdate, retained, updated, externalRequests: external }, null, 2));
  await context.close();
} finally {
  await browser?.close();
  if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  rmSync(temporary, { recursive: true, force: true });
}
