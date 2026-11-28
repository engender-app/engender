import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

// Run after LockedJournalProcessDeathTest#seed on an owned disposable emulator.
const serial = process.env.RENDERER_RECOVERY_SERIAL;
const pkg = process.env.RENDERER_RECOVERY_PACKAGE;
const output = process.env.RENDERER_RECOVERY_OUTPUT;
const mode = process.env.RENDERER_RECOVERY_MODE ?? 'pin';
const secret = process.env.RENDERER_RECOVERY_SECRET ?? '1234';
assert.ok(mode === 'pin' || mode === 'passphrase');
assert.match(serial ?? '', /^emulator-\d+$/);
assert.match(pkg ?? '', /^dev\.engender\.app\.test\.[a-z0-9]+$/);
assert.ok(output, 'RENDERER_RECOVERY_OUTPUT is required');
mkdirSync(output, { recursive: true });
const adb = (...args) => execFileSync('adb', ['-s', serial, ...args], { encoding: 'utf8' }).trim();
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const pid = () => {
  try { return adb('shell', 'pidof', pkg).split(/\s+/)[0]; } catch { return ''; }
};
async function until(test, label, timeout = 60000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await test()) return;
    await pause(200);
  }
  throw Error(`Timed out: ${label}`);
}
let browser, forward;
async function disconnect() {
  await browser?.close(); browser = undefined;
  if (forward) adb('forward', '--remove', `tcp:${forward}`);
  forward = undefined;
}
async function connect() {
  let page;
  await until(async () => {
    if (!pid()) return false;
    forward ??= adb('forward', 'tcp:0', `localabstract:webview_devtools_remote_${pid()}`);
    try {
      browser = await chromium.connectOverCDP(`http://127.0.0.1:${forward}`, { timeout: 2000, noDefaults: true });
      page = browser.contexts()[0]?.pages()[0];
      if (page && await page.locator('[data-app-root]').count()) return true;
    } catch {}
    await disconnect();
    return false;
  }, 'production WebView');
  page.setDefaultTimeout(60000);
  return page;
}
const launch = () => adb('shell', 'am', 'start', '-a', 'android.intent.action.MAIN', '-c',
  'android.intent.category.LAUNCHER', '-n', `${pkg}/dev.engender.app.Launch01`);
async function gate(page) {
  await page.locator(mode === 'pin' ? '[data-key="1"]' : 'input[autocomplete="current-password"]').waitFor();
  const result = await page.evaluate(() => ({
    pin: !!document.querySelector('[data-key="1"]'),
    privateDom: document.body.outerHTML.includes('locked-journal-private-') ||
      [...document.querySelectorAll('input,textarea')].some(field => field.value.includes('renderer-private-')),
    doors: document.querySelectorAll('[data-nav-item], [data-rail-item], [data-retained-door]').length,
    text: document.body.innerText,
    theme: document.documentElement.getAttribute('data-theme'),
    palette: document.documentElement.getAttribute('data-palette')
  }));
  assert.equal(result.privateDom, false, 'gate must contain no private text, including retained doors');
  assert.equal(result.doors, 0, 'gate must contain no navigation doors');
  return result;
}
async function unlock(page) {
  if (mode === 'pin') {
    for (const digit of secret) await page.locator(`[data-key="${digit}"]`).click();
  } else {
    await page.locator('input[autocomplete="current-password"]').fill(secret);
    await page.locator('[data-passphrase-submit], [data-session-submit]').click();
  }
  await page.locator('[data-nav-item="home"]:visible, [data-rail-item="home"]:visible').first().waitFor();
}
async function route(page, path) {
  await page.evaluate(path => {
    const link = document.createElement('a'); link.href = path; document.body.append(link); link.click(); link.remove();
  }, path);
  await page.waitForURL(url => url.pathname === path);
}
function renderer() {
  // Android parents renderers under webview_zygote, not the app's PID.
  const blocks = adb('shell', 'dumpsys', 'activity', 'processes').split('  *APP*');
  const owned = blocks.filter(block => /^ UID \d+ ProcessRecord\{[^\n]*:.*sandboxed_process/.test(block) &&
    block.includes(`packageList={${pkg}}`));
  assert.equal(owned.length, 1, 'exactly one renderer must belong to isolated app');
  return /ProcessRecord\{\S+ (\d+):/.exec(owned[0])[1];
}
function sqliteThreads() {
  const process = pid();
  assert.match(process, /^\d+$/);
  return adb('shell', `for task in /proc/${process}/task/*; do read name < "$task/comm"; if [ "$name" = "SqlitePlugin" ]; then echo "\${task##*/}"; fi; done`)
    .split('\n').filter(Boolean);
}
const rows = [];
try {
  adb('shell', 'am', 'force-stop', pkg);
  launch();
  let page = await connect();
  const fresh = await gate(page);
  await unlock(page);
  for (const path of ['/', '/calendar', '/stats', '/more']) {
    await route(page, path);
    await page.waitForFunction(() => document.body.textContent.includes('locked-journal-private-'));
  }
  await route(page, '/entry/new/today');
  const note = `renderer-private-draft-36-${Date.now()}`;
  const previousDraft = await page.evaluate(() => localStorage.getItem('engender-entry-draft'));
  await page.locator('#ed-note').fill(note);
  await page.waitForFunction(previous => {
    const current = localStorage.getItem('engender-entry-draft');
    return current && current !== previous;
  }, previousDraft);
  const draft = await page.evaluate(() => localStorage.getItem('engender-entry-draft'));
  assert.ok(!draft.includes('renderer-private-draft-36'), 'draft must be encrypted');
  for (let round = 0; round < 3; round++) {
    const before = pid();
    const oldSqliteThreads = sqliteThreads();
    assert.ok(oldSqliteThreads.length, 'open journal must own a SQLCipher worker');
    const killed = renderer();
    await disconnect();
    adb('shell', 'kill', '-9', killed);
    if (process.argv.includes('--expect-close')) {
      await until(() => !pid(), 'base app exits after renderer kill', 15000);
      rows.push({ round, before, killed, closed: true });
      break;
    }
    page = await connect();
    assert.equal(pid(), before, 'renderer recovery must retain app process');
    const recovered = await gate(page);
    await until(() => sqliteThreads().every(thread => !oldSqliteThreads.includes(thread)), 'old SQLCipher workers terminate');
    assert.equal(recovered.text, fresh.text, 'recovery must match fresh-process gate without crash copy');
    assert.ok(await page.evaluate(() => !!localStorage.getItem('engender-entry-draft')), 'encrypted draft must survive');
    await page.locator('[data-app-root]').evaluate(async node => {
      await Promise.all(node.getAnimations({ subtree: true }).filter(a => a.effect?.getTiming().iterations !== Infinity)
        .map(a => a.finished.catch(() => {})));
    });
    await page.locator('[data-gate-frame]').screenshot({ path: join(output, `recovered-${round}.png`) });
    await unlock(page);
    await route(page, '/entry/new/today');
    await until(async () => await page.locator('#ed-note').inputValue() === note, 'restored editor draft');
    rows.push({ round, before, killed, after: pid(), oldSqliteThreads, recoveredSqliteThreads: sqliteThreads(), recovered, draftRestored: true });
  }
  writeFileSync(join(output, 'renderer-recovery.json'), JSON.stringify(rows, null, 2));
  console.log(JSON.stringify(rows));
} finally { await disconnect(); }
