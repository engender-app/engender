import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launchChromium } from './browser-harness.mjs';
import { observeBuildRequests } from './build-requests.mjs';
import { buildRequestHandler } from './serve-build.mjs';

const root = mkdtempSync(join(tmpdir(), 'build-requests-'));
const sinkRequests = [];
const sink = createServer((req, res) => {
  sinkRequests.push(req.url);
  res.end('received');
});
await new Promise((resolve) => sink.listen(0, 'localhost', resolve));
const leak = `http://localhost:${sink.address().port}/leak-from-sw`;
mkdirSync(join(root, 'build'));
writeFileSync(join(root, 'build/index.html'), '<!doctype html><title>Service worker request control</title>');
// Reproduce testing 08's retained /leak-from-sw mutation with synthetic data.
writeFileSync(join(root, 'build/service-worker.js'), `
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('message', event => {
  event.waitUntil(fetch(${JSON.stringify(leak)}).catch(() => {}).then(() => event.source.postMessage('done')));
});`);
const handler = buildRequestHandler(root);
let productionCSP = false;
const server = createServer((req, res) => {
  if (!productionCSP) {
    const writeHead = res.writeHead.bind(res);
    res.writeHead = (status, headers) => {
      const { 'Content-Security-Policy': omitted, ...rest } = headers;
      return writeHead(status, rest);
    };
  }
  handler(req, res);
});
await new Promise((resolve) => server.listen(0, 'localhost', resolve));
const origin = `http://localhost:${server.address().port}`;
const browser = await launchChromium();
try {
  for (const csp of [false, true]) {
    productionCSP = csp;
    sinkRequests.length = 0;
    const context = await browser.newContext();
    try {
      const guard = observeBuildRequests(origin);
      guard.observe(context);
      const page = await context.newPage();
      const pageExternal = [];
      page.on('request', request => {
        if (new URL(request.url()).origin !== origin) pageExternal.push(request.url());
      });
      await page.goto(origin);
      await page.evaluate(async () => {
        await navigator.serviceWorker.register('/service-worker.js');
        await navigator.serviceWorker.ready;
        if (!navigator.serviceWorker.controller) {
          await new Promise(resolve => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }));
        }
        await new Promise(resolve => {
          navigator.serviceWorker.addEventListener('message', resolve, { once: true });
          navigator.serviceWorker.controller.postMessage('leak');
        });
      });
      assert.deepEqual(pageExternal, []);
      if (csp) {
        assert.deepEqual(sinkRequests, []);
        assert.deepEqual(guard.externalRequests, []);
        console.log('PASS production CSP blocks mutated service worker request');
      } else {
        assert.deepEqual(sinkRequests, ['/leak-from-sw']);
        assert.deepEqual(guard.externalRequests, [leak]);
        assert.throws(() => assert.equal(guard.externalRequests.length, 0));
        console.log('PASS mutated service worker fails context guard while page listener sees nothing');
      }
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
  await Promise.all([server, sink].map(server => new Promise(resolve => server.close(resolve))));
  rmSync(root, { recursive: true, force: true });
}
