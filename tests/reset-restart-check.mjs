/* Kill an owned Chromium process group at the retained testing-09 offsets.
   Restart the real built app from its persistent profile and inspect mirrors. */
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright-core';
import { serveBuild } from './serve-build.mjs';

const count = Number(process.env.RESET_KILL_COUNT ?? 30);
const firstSeed = Number(process.env.RESET_KILL_SEED ?? 6501);
const profile = mkdtempSync(join(tmpdir(), 'engender-reset-restart-'));
const app = await serveBuild(process.cwd());
const origin = `http://localhost:${app.httpServer.address().port}`;
const records = [];
let current;
async function stop(graceful = false) {
  if (!current) return;
  const { process: child, browser } = current;
  current = null;
  if (child.exitCode === null && child.signalCode === null) {
    const exited = new Promise(resolve => child.once('exit', resolve));
    if (graceful && browser) {
      const cdp = await browser.contexts()[0].newCDPSession(browser.contexts()[0].pages()[0]);
      await cdp.send('Browser.close').catch(() => {});
    } else process.kill(-child.pid, 'SIGKILL');
    await exited;
  }
  await browser?.close().catch(() => {});
}
async function open() {
  rmSync(join(profile, 'DevToolsActivePort'), { force: true });
  const child = spawn('prlimit', ['--core=0', '--', process.env.CHROMIUM_PATH ?? '/usr/bin/chromium-browser',
    `--user-data-dir=${profile}`, '--remote-debugging-port=0', '--headless=new',
    '--disable-crash-reporter', '--disable-breakpad', '--no-first-run', '--no-default-browser-check',
    '--window-size=412,915', 'about:blank'], { detached: true, stdio: 'ignore' });
  current = { process: child };
  const deadline = Date.now() + 30000;
  let browser;
  while (Date.now() < deadline) {
    assert.equal(child.exitCode, null, 'owned Chromium must stay running');
    try {
      const port = Number(readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]);
      browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 1000 });
      break;
    } catch { await delay(50); }
  }
  assert(browser, 'owned Chromium must expose CDP');
  current.browser = browser;
  const context = browser.contexts()[0];
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => {
    const boot = document.querySelector('[data-app-root]')?.getAttribute('data-boot');
    return boot && boot !== 'booting';
  });
  if (await page.locator('[data-app-root]').getAttribute('data-boot') === 'needs-setup') {
    await page.waitForURL(url => url.pathname === '/onboarding');
  }
  return page;
}
async function footprint(page) {
  return page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const files = [];
    for await (const name of root.keys()) files.push(name);
    return { url: location.pathname, boot: document.querySelector('[data-app-root]')?.getAttribute('data-boot'),
      files, mirrors: Object.fromEntries(Object.entries(localStorage).filter(([key]) => key.startsWith('engender-') || key === 'letter_tile_snooze_until')),
      unrelated: localStorage.getItem('other-app-reset-control'), palette: document.documentElement.dataset.palette,
      theme: document.documentElement.dataset.theme, textSize: document.documentElement.dataset.a11yTextSize };
  });
}
async function setup(page) {
  await page.locator('[data-leave-setup]').click();
  await page.locator('[data-access-modes] [data-list-row="device-bound"]').click();
  await page.locator('[data-access-submit]').click();
  await page.locator('[data-app-root][data-boot="ready"]').waitFor();
  await page.locator('[data-leave-setup]').click();
  await page.locator('[data-home-hello]').waitFor();
  await page.locator('[data-nav-fab]').click();
  await page.locator('[data-fan-target="mood-3"]').click();
  await page.locator('#ed-note').fill('reset-restart synthetic entry');
  await page.locator('[data-save]').click();
  await page.locator('[data-home-log]').waitFor();
}
async function prepare(page) {
  await page.evaluate(() => {
    localStorage.setItem('other-app-reset-control', 'keep');
    localStorage.setItem('engender-boot-prefs', JSON.stringify({ palette: 'lesbian', theme: 'dark', a11yTextSizeBoost: true }));
    localStorage.setItem('engender-has-entries', 'true');
    localStorage.setItem('engender-home-reserve-above', '6504');
    localStorage.setItem('engender-home-reserve-below', '6504');
    localStorage.setItem('engender-home-reserve-pinned', '6504');
    localStorage.setItem('letter_tile_snooze_until', '6504');
  });
  await delay(6000);
  await page.locator('[data-home-gear]').click();
  await page.locator('[data-list-row="erase"]').click();
  await page.locator('[data-confirm-reset]').waitFor();
}
async function erase(page) {
  await page.locator('[data-confirm-reset]').click();
  await page.locator('[data-erased-result]').waitFor();
}

async function recoverPartial(page, boot) {
  if (boot === 'ready') {
    // The partial wipe may leave credentials beside a newly empty journal.
    await page.waitForFunction(() => document.querySelector('[data-home-gear]') || document.querySelector('[data-leave-setup]'));
    if (await page.locator('[data-leave-setup]').count()) await page.locator('[data-leave-setup]').click();
    await page.locator('[data-home-gear]').click();
    await page.locator('[data-list-row="erase"]').click();
    await erase(page);
  } else {
    assert.equal(await page.locator('[data-unreadable-reset]').count(), 1, 'a partial erase must retain its explicit recovery action');
    await page.locator('[data-unreadable-reset]').click();
    await page.locator('[data-confirm-unreadable-reset]').click();
  }
  await page.waitForURL(url => url.pathname === '/onboarding');
  await page.locator('[data-app-root][data-boot="needs-setup"]').waitFor();
  const recovered = await footprint(page);
  assert.equal(recovered.boot, 'needs-setup', 'explicit partial-reset recovery must reach onboarding');
  assert.deepEqual(recovered.mirrors, {}, 'explicit recovery must leave no targeted live mirror');
  assert.equal(recovered.palette, 'trans');
  assert.equal(recovered.textSize, 'normal');
  return recovered;
}

try {
  let page = await open();
  await setup(page);
  await page.evaluate(() => localStorage.setItem('other-app-reset-control', 'keep'));
  await stop(true);
  page = await open();
  assert.equal((await footprint(page)).unrelated, 'keep', 'unrelated control must survive a clean storage checkpoint');
  for (let index = 0; index < count; index++) {
    await prepare(page);
    const seed = firstSeed + index;
    const offsetMs = Math.floor(createHash('sha256').update('t09:' + seed).digest().readUInt32BE(0) / 2 ** 32 * 160);
    const start = Date.now();
    await page.evaluate(() => document.querySelector('[data-confirm-reset]').click());
    await delay(Math.max(0, offsetMs - (Date.now() - start)));
    const killSentMs = Date.now() - start;
    await stop();
    page = await open();
    const after = await footprint(page);
    const erased = after.boot === 'needs-setup';
    const stale = erased && (Object.keys(after.mirrors).length > 0 || after.palette === 'lesbian' || after.textSize === 'boost');
    records.push({ seed, offsetMs, killSentMs, after, erased, stale });
    console.log(JSON.stringify(records.at(-1)));
    assert.equal(after.unrelated, 'keep', 'reset preserves unrelated origin storage');
    if (!erased) await recoverPartial(page, after.boot);
    await setup(page);
  }
  // Hold the real deletion after the pool goes but before credentials go.
  await prepare(page);
  await page.evaluate(() => {
    const remove = FileSystemDirectoryHandle.prototype.removeEntry;
    FileSystemDirectoryHandle.prototype.removeEntry = async function(name, options) {
      await remove.call(this, name, options);
      if (this.name === '' && name.startsWith('mc-pool')) {
        window.__resetDataGone = true;
        await new Promise(() => {});
      }
    };
  });
  await page.evaluate(() => document.querySelector('[data-confirm-reset]').click());
  await page.waitForFunction(() => window.__resetDataGone === true);
  await stop();
  page = await open();
  const partial = await footprint(page);
  assert(partial.files.includes('device-key.json'), 'interrupted data deletion keeps its credential');
  const recoveredPartial = await recoverPartial(page, partial.boot);
  assert.equal(recoveredPartial.unrelated, 'keep');
  console.log(JSON.stringify({ controlledPartial: { before: partial, recovered: recoveredPartial } }));
  await setup(page);
  // A refused first data deletion must keep the real journal and its key usable.
  await prepare(page);
  await page.evaluate(() => {
    const remove = FileSystemDirectoryHandle.prototype.removeEntry;
    FileSystemDirectoryHandle.prototype.removeEntry = function(name, options) {
      if (this.name === '' && (name === 'photos' || name.startsWith('mc-pool'))) {
        return Promise.reject(new DOMException('synthetic refused data erase', 'NoModificationAllowedError'));
      }
      return remove.call(this, name, options);
    };
  });
  await page.locator('[data-confirm-reset]').click();
  await page.waitForFunction(() => Boolean(document.querySelector('[data-erase-failed]')?.textContent.trim()));
  assert((await footprint(page)).files.includes('device-key.json'), 'refused reset keeps the device-bound credential');
  await stop(true);
  page = await open();
  assert.equal((await footprint(page)).boot, 'ready', 'refused reset keeps the real journal openable');
  await page.goto(origin + '/search');
  await page.locator('#q').fill('reset-restart synthetic entry');
  await page.getByText('reset-restart synthetic entry', { exact: true }).waitFor();
  await page.goto(origin);
  await page.locator('[data-home-hello]').waitFor();
  console.log(JSON.stringify({ refusedReset: 'journal entry and only usable key survive' }));
  // Deterministic recovery control: emulate a persisted old mirror after a completed reset.
  await prepare(page);
  await erase(page);
  await page.evaluate(() => {
    localStorage.setItem('engender-boot-prefs', JSON.stringify({ palette: 'lesbian', theme: 'dark', a11yTextSizeBoost: true }));
    localStorage.setItem('engender-has-entries', 'true');
    localStorage.setItem('engender-home-reserve-above', '6504');
  });
  await delay(6000);
  console.log(JSON.stringify({ beforeRecovery: await footprint(page) }));
  await stop(true);
  page = await open();
  const recovery = await footprint(page);
  const summary = { count, partial: records.filter(r => !r.erased).map(r => ({ seed: r.seed, boot: r.after.boot })), erased: records.filter(r => r.erased).length, stale: records.filter(r => r.stale).length,
    recovery, passed: records.every(r => !r.stale) && Object.keys(recovery.mirrors).length === 0 && recovery.palette === 'trans' && recovery.textSize === 'normal' };
  console.log(JSON.stringify({ summary }, null, 2));
  assert(summary.passed, 'restart must discard erased-journal mirrors and their preference projection');
} finally {
  await stop();
  await app.close();
  rmSync(profile, { recursive: true, force: true });
}
