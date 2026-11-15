/* The tally widget on a real device (security scan GD-011), with no person
   needed. Installs an isolated dev.engender.app.test.<suffix> build and its
   test APK, runs AppLaunchAuthenticationTest, then drives one journal:

   1. The widget's Misgendered button is sent exactly as the widget builds
      it, sent again, and a kept copy of its intent replayed
      (TallyWidgetDeviceProofTest). One confirmation appears; Cancel writes
      nothing, and neither the second send nor the replay brings another.
   2. The rebuilt button is sent; Log writes exactly one event and says Saved.

   The count is read off the Tally screen's own words ("Nothing logged",
   "Once", or their Polish),  in a journal created for the run. The real app's install time
   is checked before and after, and both test packages are removed at the end.

   Usage: node tests/tally-widget-device-proof.mjs <serial> <dev.engender.app.test.suffix> <app.apk> <test.apk> */
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { chromium } from 'playwright-core';
import { firstRun, unlock, clientRoute, JOURNAL_SECRET } from './browser-tier/built-flow.mjs';

const [serial, pkg, appApk, testApk] = process.argv.slice(2);
if (!serial || !/^dev\.engender\.app\.test\.[a-z0-9]+$/.test(pkg ?? '') || !appApk || !testApk) {
  throw new Error('Usage: <serial> <dev.engender.app.test.suffix> <app.apk> <test.apk>');
}
const adb = (...args) => execFileSync('adb', ['-s', serial, ...args], { encoding: 'utf8' }).trim();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const runner = `${pkg}.test/androidx.test.runner.AndroidJUnitRunner`;
const realInstall = () => adb('shell', 'dumpsys', 'package', 'dev.engender.app').match(/lastUpdateTime=.*/)?.[0] ?? 'not installed';

async function pidOf() {
  for (let i = 0; i < 150; i++) {
    const pid = adb('shell', `pidof ${pkg} || true`).split(/\s+/)[0];
    if (pid) return pid;
    await sleep(200);
  }
  throw new Error(`${pkg} never started`);
}
const forwards = [];
async function attach() {
  const pid = await pidOf();
  for (let i = 0; i < 100 && !adb('shell', 'cat', '/proc/net/unix').includes(`webview_devtools_remote_${pid}`); i++) await sleep(200);
  const port = adb('forward', 'tcp:0', `localabstract:webview_devtools_remote_${pid}`);
  forwards.push(port);
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { noDefaults: true });
  let page;
  for (let i = 0; i < 100 && !(page = browser.contexts()[0]?.pages()[0]); i++) await sleep(200);
  page.setDefaultTimeout(30000);
  return { browser, page };
}
const tallyWords = async (page) => {
  await clientRoute(page, '/tally');
  return (await page.locator('[data-tally-words]').first().innerText()).trim();
};
// The device's own language decides the app's, so both are accepted.
const NONE = /^(Nothing logged|W tym okresie nic nie zapisano)/;
const ONCE = /^(Once in this range|Raz w tym okresie)/;
const SAVED = /^(Saved|Zapisano)\./;
const touch = (name) => adb('shell', 'run-as', pkg, 'touch', `cache/${name}`);

const realBefore = realInstall();
let instrument;
try {
  adb('install', '-r', '-t', appApk);
  adb('install', '-r', '-t', testApk);
  const suite = adb('shell', 'am', 'instrument', '-w', '-e', 'class', 'dev.engender.app.launch.AppLaunchAuthenticationTest', runner);
  assert.match(suite, /OK \(9 tests\)/, suite);
  console.log('PASS AppLaunchAuthenticationTest on the device: 9 tests');

  adb('shell', 'pm', 'clear', pkg);
  adb('shell', 'am', 'start', '-n', `${pkg}/dev.engender.app.MainActivity`);
  let { browser, page } = await attach();
  await firstRun(page, new URL(page.url()).origin);
  assert.match(await tallyWords(page), NONE);
  await browser.close();

  let output = '';
  instrument = spawn('adb', ['-s', serial, 'shell', 'am', 'instrument', '-w', '-e', 'class',
    'dev.engender.app.launch.TallyWidgetDeviceProofTest', '-e', 'tallyWidgetProof', 'true', runner]);
  instrument.stdout.on('data', (chunk) => { output += chunk; });
  const finished = new Promise((resolve) => instrument.on('close', resolve));
  await sleep(3000);
  ({ browser, page } = await attach());
  await page.locator('#journal-passphrase').waitFor({ timeout: 60000 });
  await unlock(page, JOURNAL_SECRET);

  // Launch one, its second send and the replayed copy: one proposal, nothing written.
  const sheet = page.locator('[data-tally-confirm]');
  await sheet.waitFor();
  await sleep(3000);
  assert.equal(await sheet.count(), 1);
  await page.locator('[data-tally-confirm-cancel]').click();
  await sheet.waitFor({ state: 'detached' });
  await sleep(3000);
  assert.equal(await sheet.count(), 0, 'the second send or the replay proposed again');
  assert.match(await tallyWords(page), NONE, 'a launch wrote without confirmation');
  console.log('PASS widget launch proposes and writes nothing on Cancel; second send and replay open nothing');

  // Launch two, from the rebuilt button: Log writes exactly one.
  touch('tally-proof-phase-2');
  await sheet.waitFor();
  await page.locator('[data-tally-confirm-log]').click();
  await page.locator('[data-toast]', { hasText: SAVED }).waitFor();
  await sleep(3000);
  assert.match(await tallyWords(page), ONCE);
  console.log('PASS the rebuilt button launches again and Log writes exactly one event');

  touch('tally-proof-done');
  await finished;
  assert.match(output, /OK \(1 test\)/, output);
  await browser.close();
} finally {
  instrument?.kill();
  for (const port of forwards) adb('forward', '--remove', `tcp:${port}`);
  for (const id of [`${pkg}.test`, pkg]) { try { adb('uninstall', id); } catch { /* not installed */ } }
  assert.equal(realInstall(), realBefore, 'the real app was touched');
  console.log(`PASS real app untouched (${realBefore})`);
}
