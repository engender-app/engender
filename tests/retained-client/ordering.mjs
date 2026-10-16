/* Check the lifecycle ordering the cache receipt owner relies on. The old
   ExtendableMessageEvent holds a receipt publication while B installs. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildRequestHandler } from '../serve-build.mjs';

export async function checkReceiptOrdering(browser, roots, releases) {
  const oldWorker = readFileSync(join(roots.A, 'build/service-worker.js'), 'utf8') + `
let holdReceipt = false, heldSource;
const originalPut = Cache.prototype.put;
Cache.prototype.put = function (key, response) {
  if (holdReceipt && new URL(key.url || key, self.location.origin).pathname === '/.engender-shell-clients') {
    holdReceipt = false;
    heldSource.postMessage('receipt-held');
    return new Promise(resolve => setTimeout(resolve, 10000))
      .then(() => originalPut.call(this, key, response))
      .then(() => heldSource.postMessage('receipt-finished'));
  }
  return originalPut.call(this, key, response);
};
self.addEventListener('message', event => {
  if (event.data === 'fixture:hold-receipt') {
    heldSource = event.source;
    holdReceipt = true;
    heldSource.postMessage('receipt-armed');
  }
});`;
  let release = 'A';
  const server = createServer((req, res) => {
    if (release === 'A' && req.url === '/service-worker.js') {
      res.writeHead(200, { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-store' });
      res.end(oldWorker);
    } else buildRequestHandler(roots[release])(req, res);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const context = await browser.newContext();
  async function until(page, predicate) {
    const deadline = Date.now() + 60000;
    do {
      if (await page.evaluate(predicate)) return;
      await new Promise(resolve => setTimeout(resolve, 50));
    } while (Date.now() < deadline);
    throw new Error('Receipt ordering did not settle');
  }
  try {
    const first = await context.newPage();
    await first.goto(origin);
    await first.evaluate(async () => {
      await navigator.serviceWorker.register('/service-worker.js', { updateViaCache: 'none' });
      await navigator.serviceWorker.ready;
    });
    await until(first, async () => (await navigator.serviceWorker.getRegistration()).active.state === 'activated');
    await first.reload();
    await until(first, () => Boolean(navigator.serviceWorker.controller));
    await first.evaluate(() => {
      window.receiptTimes = [];
      navigator.serviceWorker.addEventListener('message', event => window.receiptTimes.push([event.data, Date.now()]));
      navigator.serviceWorker.addEventListener('controllerchange', () => window.receiptTimes.push(['controllerchange', Date.now()]));
      navigator.serviceWorker.controller.postMessage('fixture:hold-receipt');
    });
    await until(first, () => window.receiptTimes.some(([name]) => name === 'receipt-armed'));
    await first.evaluate(version => navigator.serviceWorker.controller.postMessage({ type: 'engender:client-release', version }), releases.A.version);
    await until(first, () => window.receiptTimes.some(([name]) => name === 'receipt-held'));
    const legacy = await context.newPage();
    // A pre-policy controlled document does not send the new release report.
    await legacy.addInitScript(() => {
      ServiceWorkerContainer.prototype.register = () => Promise.reject(new Error('Legacy registration fixture'));
    });
    await legacy.goto(origin);
    await until(legacy, () => Boolean(navigator.serviceWorker.controller));
    release = 'B';
    await first.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update());
    await until(first, async () => Boolean((await navigator.serviceWorker.getRegistration()).waiting));
    const waitingAt = Date.now();
    await first.evaluate(async () => (await navigator.serviceWorker.getRegistration()).waiting.postMessage('engender:skip-waiting'));
    await until(first, () => window.receiptTimes.some(([name]) => name === 'controllerchange'));
    const times = await first.evaluate(() => window.receiptTimes);
    const finishedAt = times.find(([name]) => name === 'receipt-finished')?.[1];
    const takeoverAt = times.find(([name]) => name === 'controllerchange')[1];
    assert(finishedAt > waitingAt, 'B must finish installation while the old receipt is still held');
    assert(finishedAt <= takeoverAt, 'The old receipt must publish before successor adoption');
    const current = await context.newPage();
    await current.goto(origin);
    await until(current, () => Boolean(navigator.serviceWorker.controller));
    await first.close();
    await current.evaluate(version => navigator.serviceWorker.controller.postMessage({ type: 'engender:client-release', version }), releases.B.version);
    await until(current, async () => (await navigator.serviceWorker.getRegistration()).active.state === 'activated');
    await context.setOffline(true);
    const assetStatus = await legacy.evaluate(async url => (await fetch(url)).status, origin + releases.A.route);
    assert.equal(assetStatus, 200, 'The controlled unreported document keeps its old precached bytes');
    return { heldMs: finishedAt - times.find(([name]) => name === 'receipt-held')[1],
      takeoverAfterPublicationMs: takeoverAt - finishedAt, installedBeforePublication: true, assetStatus };
  } finally {
    await context.close();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
}
