import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { launchChromium } from './browser-harness.mjs';
import { buildRequestHandler } from './serve-build.mjs';
import { INIT_HIDE_DEMO_SCRIPT } from './yank-sweep-core.mjs';

const server = createServer(buildRequestHandler(process.cwd()));
// An external document stays outside the app service worker's SPA fallback.
const awayServer = createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html', 'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': 'require-corp' });
  res.end('<!doctype html><html lang="en"><title>Away</title><body>Away</body></html>');
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
await new Promise((resolve) => awayServer.listen(0, '127.0.0.1', resolve));
const base = `http://localhost:${server.address().port}`;
const away = `http://localhost:${awayServer.address().port}/leave`;
// Playwright disables BFCache by default, even when Chromium supports it.
const browser = await launchChromium({ ignoreDefaultArgs: ['--disable-back-forward-cache'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
const cdp = await page.context().newCDPSession(page);
await cdp.send('Page.enable');
cdp.on('Page.backForwardCacheNotUsed', (event) => console.error('BFCache not used', JSON.stringify(event)));
await page.addInitScript(INIT_HIDE_DEMO_SCRIPT);
await page.addInitScript(() => {
  window.historyProof = { token: crypto.randomUUID(), events: [], workers: [], clockOffset: 0 };
  const now = Date.now.bind(Date);
  Date.now = () => now() + window.historyProof.clockOffset;
  for (const type of ['pagehide', 'pageshow']) window.addEventListener(type, (event) => {
    window.historyProof.events.push([type, event.persisted]);
  });
  const NativeWorker = Worker;
  window.Worker = class extends NativeWorker {
    constructor(...args) { super(...args); window.historyProof.workers.push(this); }
    terminate() { this.retired = true; return super.terminate(); }
    postMessage(message, ...args) {
      if (window.holdReopen && message.op === 'query' && message.args.sql === 'SELECT key, value FROM pref') {
        window.holdReopen = false;
        const receive = this.onmessage;
        this.onmessage = (event) => {
          if (event.data.id !== message.id) return receive.call(this, event);
          this.onmessage = receive;
          window.reopenHeld = true;
          window.releaseReopen = () => receive.call(this, event);
        };
      }
      return super.postMessage(message, ...args);
    }
  };
});
async function clientRoute(path) {
  await page.evaluate((path) => {
    const link = document.createElement('a');
    link.href = path; document.body.append(link); link.click(); link.remove();
  }, path);
  await page.waitForFunction((path) => location.pathname === path.split('?')[0], path);
}
async function ready() {
  await page.waitForSelector('[data-app-root][data-boot="ready"]', { timeout: 60000 });
  await page.waitForSelector('[data-nav-item="calendar"]', { timeout: 15000 });
}
async function calendar() {
  await clientRoute('/calendar');
  await page.waitForSelector('[data-nav-item="calendar"][aria-current="page"]');
  await page.locator('[data-cal-month-body]').waitFor();
  await page.waitForTimeout(250);
  assert.equal(await page.getByText("Couldn't read your journal", { exact: true }).count(), 0);
}
async function timing(value) {
  await clientRoute('/settings/access-mode');
  await page.locator(`[data-lock-after-choice="${value}"]`).click();
  await page.locator(`[data-lock-after-choice="${value}"][aria-checked="true"]`).waitFor();
  // Preference writes are asynchronous. Finish them before document navigation.
  await page.waitForTimeout(300);
  await calendar();
}
async function restore({ forward = false, elapsed = 0 } = {}) {
  if (forward) {
    const url = page.url();
    await page.goto(away);
    await page.goto(url);
    await ready();
  }
  const before = await page.evaluate(() => ({ token: window.historyProof.token,
    shows: window.historyProof.events.filter(([type, persisted]) => type === 'pageshow' && persisted).length }));
  if (elapsed) await page.evaluate((elapsed) => {
    window.addEventListener('pagehide', () => { window.historyProof.clockOffset += elapsed; }, { once: true });
  }, elapsed);
  if (forward) {
    await page.goBack({ waitUntil: 'commit' });
    await page.goForward({ waitUntil: 'commit' });
  } else {
    await page.goto(away);
    await page.goBack({ waitUntil: 'commit' });
  }
  await page.waitForFunction((before) => window.historyProof?.token === before.token &&
    window.historyProof.events.filter(([type, persisted]) => type === 'pageshow' && persisted).length > before.shows,
  before, { timeout: 10000 });
  const proof = await page.evaluate(() => ({ token: window.historyProof.token, events: window.historyProof.events }));
  assert.ok(proof.events.some(([type, persisted]) => type === 'pagehide' && persisted));
  console.log('PASS actual BFCache restoration', JSON.stringify(proof));
}
async function unlock() {
  await page.locator('[data-applock]').waitFor();
  assert.equal(await page.locator('[data-nav-item]').count(), 0, 'locked journal has no route chrome');
  await page.locator('#session-passphrase').fill('demo');
  await page.locator('[data-session-submit]').click();
  await page.locator('[data-applock]').waitFor({ state: 'detached' });
  await ready();
}
try {
  await page.goto(base);
  await ready();
  if (await page.locator('[data-leave-setup]').count()) await page.locator('[data-leave-setup]').click();
  await timing('restart');
  await page.evaluate(() => { window.holdReopen = true; });
  await restore();
  await page.waitForFunction(() => window.reopenHeld === true);
  assert.equal(await page.locator('[data-nav-item]').count(), 0, 'recovery has not published route access');
  await page.evaluate(() => window.releaseReopen());
  await ready();
  await calendar();
  // Write through the restored application's UI, then read through normal reload.
  const note = `BFCache saved note ${Date.now()}`;
  await clientRoute('/entry/new/2026-10-05?seedMood=4');
  await page.locator('#ed-note').fill(note);
  await page.evaluate(() => { window.holdReopen = true; window.reopenHeld = false; });
  await restore();
  await page.waitForFunction(() => window.reopenHeld === true);
  assert.equal(await page.locator('#ed-note').count(), 1, 'retained editor remains mounted');
  assert.equal(await page.locator('#ed-note').isVisible(), false, 'retained editor is hidden during recovery');
  await page.evaluate(() => window.releaseReopen());
  await ready();
  assert.equal(await page.locator('#ed-note').inputValue(), note, 'unsaved note survives actual BFCache restoration');
  console.log('PASS unsaved editor note survives actual restoration');
  await page.locator('[data-save]').click();
  await page.waitForFunction(() => !location.pathname.startsWith('/entry/new/'));
  await clientRoute('/day/2026-10-05');
  await page.getByText(note, { exact: true }).first().waitFor();
  await page.reload();
  await ready();
  await page.getByText(note, { exact: true }).first().waitFor();
  console.log('PASS restored read and saved change survive normal reload');
  await calendar();
  for (let cycle = 0; cycle < 2; cycle++) {
    await restore(); await ready(); await calendar();
    // Move to an older non-journal document, then restore this journal Forward.
    await restore({ forward: true }); await ready(); await calendar();
    const workers = await page.evaluate(() => window.historyProof.workers.filter((worker) => !worker.retired).length);
    assert.equal(workers, 1, 'only current database worker remains');
    await page.reload(); await ready(); await calendar();
  }
  await timing('one-minute');
  await restore(); await ready(); await calendar();
  await restore({ elapsed: 61_000 }); await unlock(); await calendar();
  console.log('PASS real navigation respects timed lock; elapsed clock advanced at real pagehide');
  await timing('five-minutes');
  await restore({ elapsed: 61_000 }); await ready(); await calendar();
  await restore({ elapsed: 301_000 }); await unlock(); await calendar();
  console.log('PASS five-minute policy uses its own elapsed threshold');
  await timing('immediately');
  await restore(); await unlock(); await calendar();
  console.log('PASS immediate authentication required after actual restoration');
  await clientRoute('/settings/access-mode');
  await page.locator('[data-access-modes] [data-list-row="device-bound"]').click();
  await page.locator('[data-access-submit]').click();
  await page.locator('[data-access-submit]').waitFor({ state: 'detached' });
  await calendar();
  await restore(); await ready(); await calendar();
  assert.equal(await page.locator('[data-applock]').count(), 0);
  console.log('PASS web device-bound mode restores without inventing authentication');
  assert.deepEqual(errors, []);
} finally {
  if (errors.length) console.error('Browser errors', errors);
  await browser.close();
  await new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); });
  await new Promise((resolve) => { awayServer.closeAllConnections(); awayServer.close(resolve); });
}
