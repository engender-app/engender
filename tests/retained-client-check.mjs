/* Actual built releases, retained documents and real encrypted SQLite workers.
   The server switches one complete local root; old hashes are absent online.
   The fixture uses separate database names because the app's one Journal is
   intentionally single-connection. No real journal or external server is used. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { build, transformWithEsbuild } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { launchBrowser } from './browser-harness.mjs';
import { buildRequestHandler } from './serve-build.mjs';
import { checkReceiptOrdering } from './retained-client/ordering.mjs';

const args = process.argv.slice(2);
const option = name => args[args.indexOf(name) + 1];
assert(args.includes('--a') && args.includes('--b'), 'Supply --a and --b roots from tests/retained-client/prepare.mjs');
const roots = { A: resolve(option('--a')), B: resolve(option('--b')) };
const releases = Object.fromEntries(Object.entries(roots).map(([id, root]) => [id, JSON.parse(readFileSync(join(root, 'probe.json'), 'utf8'))]));
assert.notEqual(releases.A.worker, releases.B.worker, 'SQLite worker hashes must differ');
assert.notEqual(releases.A.route, releases.B.route, 'Deferred route hashes must differ');
const temporary = mkdtempSync(join(tmpdir(), 'engender-retained-client-'));
let browser;
let server;
let release = 'A';
let interrupt = false;
let baselineWorker;
const events = [];
const check = (name, actual, expected) => { assert.deepEqual(actual, expected, name); events.push(name); };
async function until(page, predicate, argument, timeout = 60000) {
  const deadline = Date.now() + timeout;
  do {
    if (await page.evaluate(predicate, argument)) return;
    await new Promise(resolve => setTimeout(resolve, 50));
  } while (Date.now() < deadline);
  throw new Error('Retained-client condition did not settle');
}
try {
  await build({ configFile: false, logLevel: 'warn', worker: { format: 'es' }, plugins: [svelte(), {
    name: 'actual-retained-worker', enforce: 'pre',
    transform(source, id) {
      if (!id.endsWith('/src/lib/data/sqlite/mc-driver.ts')) return;
      return source.replace("new Worker(new URL('./mc-worker.ts', import.meta.url),", 'new (globalThis.Worker)((globalThis as unknown as { __retainedWorkerUrl: string }).__retainedWorkerUrl,');
    }
  }], resolve: { alias: { $lib: resolve('src/lib') } }, define: { __DEMO__: 'false' },
  build: { outDir: join(temporary, 'fixture'), target: 'chrome104', emptyOutDir: true,
    lib: { entry: 'tests/retained-client/probe.ts', name: 'retainedClient', formats: ['iife'], fileName: () => 'probe.js' } } });
  const fixture = readFileSync(join(temporary, 'fixture/probe.js'), 'utf8');
  if (args.includes('--baseline-ref')) {
    const source = execFileSync('git', ['show', `${option('--baseline-ref')}:src/service-worker.ts`], { encoding: 'utf8' })
      .replace(/from '\.\/lib\/pwa\/([^']+)'/g, (_match, file) => 'from ' + JSON.stringify(resolve('src/lib/pwa', file)))
      .replace(/import \{ emittedClientAssets \} from [^;]+;/, 'const emittedClientAssets = [];');
    const baselineSource = (await transformWithEsbuild(source, 'baseline-owner.ts', { loader: 'ts' })).code;
    const paths = readdirSync(join(roots.B, 'build'), { recursive: true, withFileTypes: true })
      .filter(entry => entry.isFile()).map(entry => '/' + join(entry.parentPath, entry.name).slice(join(roots.B, 'build').length + 1));
    const excluded = new Set(['/index.html', '/service-worker.js', '/_app/version.json', '/release.json']);
    await build({ configFile: false, logLevel: 'warn', plugins: [{
      name: 'baseline-production-worker',
      resolveId(id) { if (id === 'baseline-owner' || id.endsWith('/baseline-owner')) return '\0baseline-owner.ts';
        if (id === '$service-worker') return '\0$service-worker'; },
      load(id) {
        if (id === '\0baseline-owner.ts') return baselineSource;
        if (id === '\0$service-worker') return `export const base=''; export const version=${JSON.stringify(releases.B.version)}; export const build=${JSON.stringify(paths.filter(path => path.startsWith('/_app/immutable/')))}; export const files=${JSON.stringify(paths.filter(path => !path.startsWith('/_app/') && !excluded.has(path)))};`;
      }
    }], build: { outDir: join(temporary, 'baseline'), emptyOutDir: true,
      lib: { entry: 'baseline-owner', name: 'baseline', formats: ['iife'], fileName: () => 'worker.js' } } });
    baselineWorker = readFileSync(join(temporary, 'baseline/worker.js'));
  }
  const requests = [];
  server = createServer((req, res) => {
    requests.push({ release, path: req.url });
    if (release === 'B' && baselineWorker && req.url === '/service-worker.js') {
      res.writeHead(200, { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-store' }); res.end(baselineWorker); return;
    }
    if (interrupt && req.url === releases.B.worker) { res.writeHead(503); res.end('interrupted fixture'); return; }
    buildRequestHandler(roots[release])(req, res);
  });
  await new Promise(resolveListen => server.listen(0, '127.0.0.1', resolveListen));
  const origin = `http://127.0.0.1:${server.address().port}`;
  console.log(JSON.stringify({ process: process.pid, port: server.address().port, stage: 'serving disposable releases' }));
  browser = await launchBrowser();
  for (const offline of [false, true]) {
    release = 'A';
    const context = await browser.newContext({ locale: 'en-GB' });
    context.on('page', page => {
      page.on('pageerror', error => console.error('page error:', error.message));
      page.on('console', message => { if (message.type() === 'error') console.error('console error:', message.text()); });
    });
    context.on('requestfailed', request => console.error('request failed:', request.url(), request.failure()?.errorText));
    const first = await context.newPage();
    try {
      await first.goto(origin);
      await first.waitForSelector('[data-next]');
      for (let count = 0; count < 12 && !(await first.locator('[data-access-modes]').count()); count++) await first.locator('[data-next]').click();
      await first.locator('[data-list-row="passphrase"]').click();
      await first.locator('[data-access-continue]').click();
      await first.locator('#am-passphrase').fill('retained production journal');
      await first.locator('#am-passphrase-confirm').fill('retained production journal');
      await first.locator('[data-access-submit]').click();
      await first.waitForSelector('.app[data-boot="ready"]');
      for (let count = 0; count < 12 && (await first.locator('[data-next]').count()); count++) await first.locator('[data-next]').click();
      await first.locator('[data-finish]').click();
      await first.waitForSelector('[data-home-hello]');
      await first.evaluate(async () => { await navigator.serviceWorker.register('/service-worker.js', { updateViaCache: 'none' }); await navigator.serviceWorker.ready; });
      await until(first, async () => (await navigator.serviceWorker.getRegistration())?.active?.state === 'activated');
      await first.reload();
      await first.waitForSelector('#journal-passphrase');
      await first.locator('#journal-passphrase').fill('retained production journal');
      await first.locator('[data-passphrase-submit]').click();
      await first.waitForSelector('[data-home-hello]');
      await first.evaluate(async () => { await (await caches.open('unrelated-origin-cache')).put('/foreign', new Response('foreign bytes')); });
      const retained = [first, await context.newPage()];
      await retained[1].goto(origin);
      const applying = await context.newPage();
      await applying.goto(origin);
      async function attach(page, id, generation) {
        await page.evaluate(fixture);
        await page.evaluate(({ worker, name, version }) => window.setupRetained(worker, name, version),
          { worker: releases[generation].worker, name: `retained-${offline}-${id}`, version: releases[generation].version });
      }
      await attach(first, 'write', 'A');
      await attach(retained[1], 'recovery', 'A');
      await attach(applying, 'apply', 'A');
      await first.evaluate(() => window.retained.start('admitted old release write', false));
      await until(first, () => window.retained.state().held);
      await retained[1].evaluate(() => window.retained.start('failed save recovery draft', true));
      await until(retained[1], () => window.retained.state().held);
      await retained[1].evaluate(() => window.retained.finish());
      const before = await Promise.all(retained.map(page => page.evaluate(() => window.retained.state())));
      check('first client holds an admitted write', before[0].held, true);
      check('second client keeps failed-save recovery', before[1].recovery, 'retained fixture save refused');
      check('old route is precached before its first visit', await first.evaluate(async path => Boolean(await caches.match(path)), releases.A.route), true);
      release = 'B';
      check('switched server has no old deferred-route URL', (await fetch(origin + releases.A.route)).status, 404);
      check('switched server has no old SQLite-worker URL', (await fetch(origin + releases.A.worker)).status, 404);
      interrupt = true;
      await applying.evaluate(async () => { await (await navigator.serviceWorker.getRegistration()).update(); });
      await until(applying, async () => !(await navigator.serviceWorker.getRegistration()).installing);
      check('interrupted update leaves no waiting worker', await applying.evaluate(async () => Boolean((await navigator.serviceWorker.getRegistration()).waiting)), false);
      check('interrupted update keeps old cached route', await first.evaluate(async path => (await fetch(path)).status, releases.A.route), 200);
      interrupt = false;
      await applying.evaluate(async () => { await (await navigator.serviceWorker.getRegistration()).update(); });
      await until(applying, async () => Boolean((await navigator.serviceWorker.getRegistration()).waiting));
      await context.setOffline(offline);
      await Promise.all([applying.waitForNavigation(), applying.evaluate(() => window.retained.apply()).catch(() => {})]);
      await until(first, () => window.retained.state().takeovers === 1);
      const after = await Promise.all(retained.map(page => page.evaluate(() => window.retained.state())));
      for (let index = 0; index < 2; index++) {
        check(`retained client ${index} does not reload`, after[index].reloads, 0);
        check(`retained client ${index} keeps its draft`, after[index].draft, before[index].draft);
      }
      check('retained old cached route remains reachable after takeover', await first.evaluate(async path => (await fetch(path)).status, releases.A.route), 200);
      await first.evaluate(() => {
        const link = document.createElement('a'); link.href = '/settings/licences'; link.id = 'retained-navigation'; document.body.append(link);
      });
      await first.evaluate(() => document.querySelector('#retained-navigation').click());
      await first.waitForSelector('[data-retained-release="A"]');
      check('first deferred navigation renders release A screen', await first.locator('[data-retained-release]').getAttribute('data-retained-release'), 'A');
      await first.evaluate(() => window.retained.finish());
      check('admitted write commits through takeover', (await first.evaluate(() => window.retained.entries()))[0].note, 'admitted old release write');
      check('warm reopen uses old encrypted worker and reads committed note', (await first.evaluate(() => window.retained.reopen()))[0].note, 'admitted old release write');
      check('failed-save recovery survives takeover and deferred navigation', (await retained[1].evaluate(() => window.retained.state())).draft, 'failed save recovery draft');
      const newcomer = await context.newPage();
      await newcomer.goto(origin + '/settings/licences');
      const documentText = await newcomer.content();
      check('new client gets matching release B document', releases.B.entries.every(path => documentText.includes(path)), true);
      await attach(newcomer, 'middle', 'B');
      const bClient = newcomer;
      await context.setOffline(false);
      await applying.close();
      release = 'A';
      await bClient.evaluate(async () => { await (await navigator.serviceWorker.getRegistration()).update(); });
      await until(bClient, async () => Boolean((await navigator.serviceWorker.getRegistration()).waiting));
      await context.setOffline(offline);
      // Request rollback from a fourth idle page; retained B keeps its document.
      const rollback = await context.newPage();
      await rollback.goto(origin);
      await attach(rollback, 'rollback', 'B');
      await Promise.all([rollback.waitForNavigation(), rollback.evaluate(() => window.retained.apply()).catch(() => {})]);
      await until(bClient, () => window.retained.state().takeovers === 1);
      check('consecutive update keeps release B cached route', await bClient.evaluate(async path => (await fetch(path)).status, releases.B.route), 200);
      check('consecutive update keeps release A cached route', await first.evaluate(async path => (await fetch(path)).status, releases.A.route), 200);
      const rollbackDocument = await rollback.content();
      check('current rollback document matches release A', releases.A.entries.every(path => rollbackDocument.includes(path)), true);
      await bClient.close();
      await rollback.evaluate(async version => navigator.serviceWorker.controller.postMessage({ type: 'engender:client-release', version }), releases.A.version);
      await until(rollback, async version => !(await caches.keys()).includes('engender-shell-' + version), releases.B.version);
      check('obsolete B shell is reclaimed after B closes', await rollback.evaluate(async version => (await caches.keys()).includes('engender-shell-' + version), releases.B.version), false);
      check('unrelated cache survives updates and cleanup', await rollback.evaluate(async () => (await (await caches.open('unrelated-origin-cache')).match('/foreign')).text()), 'foreign bytes');
      check('old cached PDF policy remains on-demand', await rollback.evaluate(async () => {
        const paths = (await (await caches.open((await caches.keys()).find(name => name.startsWith('engender-shell-')))).keys()).map(request => request.url);
        return paths.some(path => /\/workers\/pdf-worker-/.test(path));
      }), false);
      await retained[1].close();
      await first.close();
      await rollback.close();
    } finally { await context.close(); }
    console.log(JSON.stringify({ offline, checks: events.length, stage: 'retained release proof passed' }));
  }
  const ordering = await checkReceiptOrdering(browser, roots, releases);
  console.log(JSON.stringify({ passed: true, checks: events.length, releases, ordering, events }, null, 2));
} finally {
  await browser?.close();
  if (server) { server.closeAllConnections(); await new Promise(resolveClose => server.close(resolveClose)); }
  rmSync(temporary, { recursive: true, force: true });
}
