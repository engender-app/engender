/* Keep a real controlled app page open across a disposable release switch.
   Its first PDF constructs the actual old release's worker with no cached copy. */
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { build } from 'vite';
import { launchBrowser } from './browser-harness.mjs';
import { startPdfServer } from './pdf-retained-client/server.mjs';

const args = process.argv.slice(2);
const option = name => args[args.indexOf(name) + 1];
assert(args.includes('--a') && args.includes('--b'), 'Supply --a and --b roots from tests/pdf-retained-client/prepare.mjs');
const roots = { A: resolve(option('--a')), B: resolve(option('--b')) };
const releases = Object.fromEntries(Object.entries(roots).map(([id, root]) => [id, JSON.parse(readFileSync(join(root, 'probe.json'), 'utf8'))]));
assert.notEqual(releases.A.worker, releases.B.worker, 'PDF worker hashes must differ');
const temporary = mkdtempSync(join(tmpdir(), 'engender-retained-pdf-'));
const events = [];
const execute = promisify(execFile);
const check = (name, actual, expected) => { assert.deepEqual(actual, expected, name); events.push(name); };
let browser;
let server;
async function until(page, predicate, argument, timeout = 60000) {
  const deadline = Date.now() + timeout;
  do {
    if (await page.evaluate(predicate, argument)) return;
    await new Promise(resolveWait => setTimeout(resolveWait, 50));
  } while (Date.now() < deadline);
  throw new Error('Retained PDF condition did not settle');
}
try {
  await build({ configFile: false, logLevel: 'warn', plugins: [{
    name: 'actual-pdf-worker', enforce: 'pre',
    transform(source, id) {
      if (!id.endsWith('/src/lib/data/documents/pdf.ts')) return;
      return source.replace("new Worker(new URL('./pdf-worker.ts', import.meta.url),", 'new (globalThis.Worker)((globalThis as unknown as { __pdfWorkerUrl: string }).__pdfWorkerUrl,');
    }
  }], resolve: { alias: { $lib: resolve('src/lib') } },
  build: { outDir: join(temporary, 'fixture'), target: 'chrome104', emptyOutDir: true,
    lib: { entry: 'tests/pdf-retained-client/probe.ts', name: 'retainedPdf', formats: ['iife'], fileName: () => 'probe.js' } } });
  const fixture = readFileSync(join(temporary, 'fixture/probe.js'), 'utf8');
  const script = join(temporary, 'journal-release.mjs');
  writeFileSync(script, args.includes('--baseline-ref')
    ? execFileSync('git', ['show', `${option('--baseline-ref')}:scripts/journal-release.mjs`])
    : readFileSync('scripts/journal-release.mjs'));
  cpSync('scripts/app-version.mjs', join(temporary, 'app-version.mjs'));
  const releaseRoot = join(temporary, 'releases');
  const current = join(temporary, 'current');
  const deploy = id => execute('node', [script, 'deploy', join(roots[id], 'build'), '--root', releaseRoot,
    '--current', current, '--allow-development-version'], { encoding: 'utf8' });
  await deploy('A');
  server = await startPdfServer(temporary, current, args.includes('--baseline-ref') ? option('--baseline-ref') : undefined);
  const { origin } = server;
  console.log(JSON.stringify({ process: process.pid, port: server.port, container: server.container, stage: 'serving disposable PDF releases' }));
  async function monitoredSwitch(action, name) {
    let running = true;
    const samples = [];
    const monitor = (async () => {
      while (running) {
        const metadata = await (await fetch(origin + '/release.json')).json();
        const document = await (await fetch(origin + '/index.html')).text();
        samples.push(Object.values(releases).some(release => release.version === metadata.buildId)
          && Object.values(releases).some(release => release.entries.every(path => document.includes(path))));
      }
    })();
    try { await action(); } finally { running = false; await monitor; }
    check(name, samples.length > 0 && samples.every(Boolean), true);
  }
  browser = await launchBrowser();
  const context = await browser.newContext({ locale: 'en-GB' });
  const old = await context.newPage();
  async function attach(page, release) {
    await page.goto(origin);
    await page.evaluate(async () => { await navigator.serviceWorker.register('/service-worker.js', { updateViaCache: 'none' }); await navigator.serviceWorker.ready; });
    await until(page, async () => (await navigator.serviceWorker.getRegistration())?.active?.state === 'activated');
    await page.reload();
    await until(page, () => Boolean(navigator.serviceWorker.controller));
    await page.evaluate(fixture);
    await page.evaluate(({ worker, version }) => {
      globalThis.__pdfWorkerUrl = worker;
      navigator.serviceWorker.controller.postMessage({ type: 'engender:client-release', version });
      globalThis.__pdfDocumentMarker = 'original document';
    }, release);
  }
  await attach(old, releases.A);
  const takeoverContext = await browser.newContext({ locale: 'en-GB' });
  const takeover = await takeoverContext.newPage();
  await attach(takeover, releases.A);
  check('first PDF has no CacheStorage worker copy', await old.evaluate(async path => Boolean(await caches.match(path)), releases.A.worker), false);
  check('first PDF has never requested its worker', server.requests(releases.A.worker).length, 0);
  await monitoredSwitch(() => deploy('B'), 'atomic deploy serves only complete release documents and metadata');
  const oldStatus = (await fetch(origin + releases.A.worker)).status;
  check('new namespace exposes new PDF worker', (await fetch(origin + releases.B.worker)).status, 200);
  check('retained document still has genuine worker cache miss', await old.evaluate(async path => Boolean(await caches.match(path)), releases.A.worker), false);
  const rendered = await old.evaluate(async () => {
    try {
      return await Promise.race([
        window.renderRetainedPdf(), new Promise((_, reject) => setTimeout(() => reject(new Error('First PDF worker did not render')), 15000))
      ]);
    } catch (error) { return { error: String(error?.message ?? error) }; }
  });
  console.log(JSON.stringify({ stage: 'first old PDF open', oldWorkerStatus: oldStatus, rendered,
    actualWorkerRequests: server.requests(releases.A.worker).length - 1 }));
  check('old first PDF renders instead of failing its worker request', rendered.error, undefined);
  check('deployed namespace exposes exact old PDF worker', oldStatus, 200);
  check('old first PDF renders one page', rendered.pages, 1);
  check('old first PDF draws text pixels', rendered.ink > 0.001, true);
  check('old PDF canvas uses requested edge', rendered.edge, 800);
  check('old document remains open', await old.evaluate(() => globalThis.__pdfDocumentMarker), 'original document');
  await until(old, async path => Boolean(await caches.match(path)), releases.A.worker);
  await context.setOffline(true);
  check('opened old PDF renders offline', (await old.evaluate(() => window.renderRetainedPdf())).ink > 0.001, true);
  await context.setOffline(false);
  await takeover.evaluate(async () => { await (await navigator.serviceWorker.getRegistration()).update(); });
  await until(takeover, async () => Boolean((await navigator.serviceWorker.getRegistration()).waiting));
  await takeover.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    await new Promise(resolveChange => {
      navigator.serviceWorker.addEventListener('controllerchange', resolveChange, { once: true });
      registration.waiting.postMessage('engender:skip-waiting');
    });
  });
  check('takeover keeps uncached old worker before first PDF', await takeover.evaluate(async path => Boolean(await caches.match(path)), releases.A.worker), false);
  check('old first PDF renders after controller takeover', (await takeover.evaluate(() => window.renderRetainedPdf())).ink > 0.001, true);
  await takeoverContext.setOffline(true);
  check('opened old worker remains available offline after takeover', await takeover.evaluate(async path => {
    try { return (await fetch(path)).ok; } catch { return false; }
  }, releases.A.worker), true);
  check('opened old PDF renders offline after takeover', (await takeover.evaluate(() => window.renderRetainedPdf())).ink > 0.001, true);
  await takeoverContext.setOffline(false);
  const newcomerContext = await browser.newContext({ locale: 'en-GB' });
  const newcomer = await newcomerContext.newPage();
  await newcomer.goto(origin);
  check('new document names release B entries', releases.B.entries.every(path => (readFileSync(join(roots.B, 'build/index.html'), 'utf8')).includes(path)), true);
  const documentText = await newcomer.content();
  check('new page receives release B document', releases.B.entries.every(path => documentText.includes(path)), true);
  await newcomer.evaluate(async () => { await navigator.serviceWorker.register('/service-worker.js', { updateViaCache: 'none' }); await navigator.serviceWorker.ready; });
  await until(newcomer, async () => (await navigator.serviceWorker.getRegistration())?.active?.state === 'activated');
  await newcomer.reload();
  await until(newcomer, () => Boolean(navigator.serviceWorker.controller));
  await newcomer.evaluate(fixture);
  await newcomer.evaluate(path => globalThis.__pdfWorkerUrl = path, releases.B.worker);
  check('new PDF worker remains on demand', await newcomer.evaluate(async path => Boolean(await caches.match(path)), releases.B.worker), false);
  await newcomerContext.setOffline(true);
  check('uncached offline worker remains unavailable', await newcomer.evaluate(async path => {
    try { return (await fetch(path)).ok; } catch { return false; }
  }, releases.B.worker), false);
  await newcomerContext.setOffline(false);
  check('new first PDF draws text pixels', (await newcomer.evaluate(() => window.renderRetainedPdf())).ink > 0.001, true);
  await until(newcomer, async path => Boolean(await caches.match(path)), releases.B.worker);
  await newcomerContext.setOffline(true);
  check('opened new PDF renders offline', (await newcomer.evaluate(() => window.renderRetainedPdf())).ink > 0.001, true);
  await newcomerContext.setOffline(false);
  const rollbackContext = await browser.newContext({ locale: 'en-GB' });
  const retainedB = await rollbackContext.newPage();
  await attach(retainedB, releases.B);
  check('retained B has never cached its PDF worker', await retainedB.evaluate(async path => Boolean(await caches.match(path)), releases.B.worker), false);
  const oldMetadata = JSON.parse(readFileSync(join(roots.A, 'build/release.json'), 'utf8'));
  const name = `${oldMetadata.version}--${oldMetadata.buildId}`.replace(/[^a-zA-Z0-9._-]/g, '_');
  await monitoredSwitch(() => execute('node', [script, 'rollback', name, '--root', releaseRoot, '--current', current]),
    'atomic rollback serves only complete release documents and metadata');
  check('rollback serves release A metadata', await (await fetch(origin + '/release.json')).json(), oldMetadata);
  check('rollback serves original release A worker', (await fetch(origin + releases.A.worker)).status, 200);
  check('rollback keeps outgoing B worker reachable', (await fetch(origin + releases.B.worker)).status, 200);
  check('retained B first PDF renders after rollback', (await retainedB.evaluate(() => window.renderRetainedPdf())).ink > 0.001, true);
  await rollbackContext.setOffline(true);
  await until(retainedB, async path => Boolean(await caches.match(path)), releases.B.worker);
  check('opened B PDF renders offline after rollback', (await retainedB.evaluate(() => window.renderRetainedPdf())).ink > 0.001, true);
  await rollbackContext.close(); await takeoverContext.close(); await newcomerContext.close(); await context.close();
  console.log(JSON.stringify({ passed: true, checks: events.length, releases, events }, null, 2));
} finally {
  await browser?.close();
  server?.close();
  rmSync(temporary, { recursive: true, force: true });
}
