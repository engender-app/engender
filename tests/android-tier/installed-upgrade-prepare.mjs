import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { chromium } from 'playwright-core';

const [serial, avd, manifestPath, portText = '9340'] = process.argv.slice(2);
if (!/^emulator-\d+$/.test(serial ?? '') || !avd || !manifestPath || !/^\d+$/.test(portText)) {
  throw new Error('Usage: npm run test:android:upgrade:prepare -- emulator-NNNN named-avd manifest.json [unused-CDP-port]');
}
const packageId = 'dev.engender.app.test.upgrade40';
const port = Number(portText);
if (port < 1024 || port > 65535) throw new Error('Installed-upgrade CDP port must be 1024..65535');
const sdk = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT ?? join(homedir(), 'Android/Sdk');
const adb = join(sdk, 'platform-tools/adb');
/** @param {...string} args */
const run = (...args) => execFileSync(adb, ['-s', serial, ...args], { encoding: 'utf8', timeout: 120000, maxBuffer: 128 * 1024 * 1024 });
/** @param {...string} args */
const device = (...args) => {
  if (run('emu', 'avd', 'name').trim().split(/\r?\n/)[0] !== avd) throw new Error('Installed-upgrade emulator identity changed');
  return run(...args);
};
const manifest = JSON.parse(readFileSync(resolve(manifestPath), 'utf8'));
const directory = dirname(resolve(manifestPath));
const previous = manifest.upgradeApks.previous;
const apk = resolve(directory, previous.path);
const fixture = readFileSync(resolve(directory, manifest.fixture));
const fixtureIdentity = JSON.parse(readFileSync(join(directory, 'fixture.json'), 'utf8'));
if (fixtureIdentity.userVersion !== 88 || fixtureIdentity.sourceRevision !== previous.sourceRevision
  || fixtureIdentity.sha256 !== createHash('sha256').update(fixture).digest('hex')) throw new Error('Invalid released synthetic Archive identity');
if (previous.packageId !== packageId || createHash('sha256').update(readFileSync(apk)).digest('hex') !== previous.sha256) {
  throw new Error('Invalid synthetic rc.1 APK input');
}
const buildTools = readdirSync(join(sdk, 'build-tools')).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).at(-1);
if (!buildTools) throw new Error('Install Android SDK build-tools before preparing the upgrade fixture');
const badging = execFileSync(join(sdk, 'build-tools', buildTools, 'aapt'), ['dump', 'badging', apk], { encoding: 'utf8' });
const metadata = /package: name='([^']+)' versionCode='(\d+)' versionName='([^']+)'/.exec(badging);
if (!metadata || metadata[1] !== packageId || Number(metadata[2]) !== previous.versionCode || metadata[3] !== '1.0.0-rc.1') {
  throw new Error('Fixture preparation APK is not the isolated rc.1 package');
}
if (execFileSync(adb, ['forward', '--list'], { encoding: 'utf8' }).split('\n').some((line) => line.split(/\s+/)[1] === `tcp:${port}`)) {
  throw new Error('Installed-upgrade CDP port is already forwarded');
}
const packages = device('shell', 'pm', 'list', 'packages', '-u', packageId);
if (packages.split(/\r?\n/).includes(`package:${packageId}`)) throw new Error('Synthetic upgrade package already exists; use a fresh isolated emulator');
device('install', apk);
let browser;
let forwarded = false;
/** @param {number} ms */
const pause = (ms) => new Promise((done) => setTimeout(done, ms));
try {
  if (Number(device('shell', 'getprop', 'ro.build.version.sdk').trim()) >= 33) device('shell', 'pm', 'grant', packageId, 'android.permission.POST_NOTIFICATIONS');
  device('shell', 'appops', 'set', packageId, 'SCHEDULE_EXACT_ALARM', 'allow');
  /* The previous APK predates FA 43's neutral alias names. */
  device('shell', 'am', 'start', '-W', '-n', `${packageId}/dev.engender.app.disguise.LauncherDefault`);
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    const pid = device('shell', 'pidof', packageId).trim();
    if (/^\d+$/.test(pid)) {
      try {
        device('forward', `tcp:${port}`, `localabstract:webview_devtools_remote_${pid}`); forwarded = true;
        browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { noDefaults: true, timeout: 3000 });
        const ready = browser.contexts()[0]?.pages()[0];
        if (ready && await ready.locator('[data-app-root]').count()) break;
        await browser.close(); browser = undefined;
      } catch { await browser?.close(); browser = undefined; await pause(250); }
    } else await pause(250);
  }
  if (!browser) throw new Error('Synthetic rc.1 WebView unavailable');
  const page = browser.contexts()[0].pages()[0]; page.setDefaultTimeout(60000);
  await page.locator('[data-next]').click();
  for (let step = 0; step < 10; step++) {
    await page.locator('[data-list-row="pin"], [data-skip-step]').first().waitFor({ state: 'visible' });
    if (await page.locator('[data-list-row="pin"]').isVisible()) break;
    const question = await page.locator('[data-setup-question]:not([inert])').innerText();
    await page.locator('[data-skip-step]').first().click();
    await page.waitForFunction((question) => document.querySelector('[data-setup-question]:not([inert])')?.textContent?.trim() !== question.trim(), question);
  }
  await page.locator('[data-list-row="pin"]').click(); await page.locator('[data-access-continue]').click();
  for (let repeat = 0; repeat < 2; repeat++) {
    await page.locator('[data-key="2"]').waitFor({ state: 'visible' });
    const instruction = await page.locator('[data-access-pin-step]').innerText();
    for (const digit of '2468') await page.locator(`[data-key="${digit}"]`).click();
    if (repeat === 0) await page.waitForFunction((instruction) => document.querySelector('[data-access-pin-step]')?.textContent?.trim() !== instruction.trim(), instruction);
  }
  await page.locator('[data-lock-after-choice="restart"]').click(); await page.locator('[data-next]').click();
  for (let step = 0; step < 10 && page.url().includes('onboarding'); step++) {
    const choice = page.locator('[data-leave-setup], [data-skip-step], [data-next], [data-finish]').first();
    await choice.waitFor({ state: 'visible' });
    const question = await page.locator('[data-setup-question]:not([inert])').innerText();
    await choice.click();
    await page.waitForFunction((question) => !location.pathname.includes('onboarding')
      || document.querySelector('[data-setup-question]:not([inert])')?.textContent?.trim() !== question.trim(), question);
  }
  await page.locator('[data-nav-item="home"], [data-rail-item="home"]').first().waitFor({ state: 'attached' });
  /** @param {string} path */
  const navigate = async (path) => {
    await page.evaluate((path) => { const link = document.createElement('a'); link.href = path; document.body.append(link); link.click(); link.remove(); }, path);
    await page.waitForURL((url) => url.pathname === path);
  };
  await navigate('/settings/export');
  // Supply the synthetic Archive to the normal file input; import still uses the released reader and encrypted stores.
  await page.evaluate((base64) => {
    const bytes = Uint8Array.from(atob(base64), (byte) => byte.charCodeAt(0));
    const originalClick = HTMLInputElement.prototype.click;
    HTMLInputElement.prototype.click = function () {
      if (this.type !== 'file') return originalClick.call(this);
      HTMLInputElement.prototype.click = originalClick;
      const transfer = new DataTransfer(); transfer.items.add(new File([bytes], 'fixture.engender', { type: 'application/octet-stream' }));
      this.files = transfer.files; this.dispatchEvent(new Event('change'));
    };
  }, fixture.toString('base64'));
  await page.locator('[data-pick-file]').click();
  await page.locator('#imp-pass').fill('upgrade40'); await page.locator('[data-import-mode="merge"]').click();
  await page.locator('[data-import]').click();
  await page.waitForFunction(() => /Archive imported|Nothing new|failed|error/i.test(document.body.innerText), null, { timeout: 180000 });
  if (!/Archive imported/i.test(await page.locator('body').innerText())) throw new Error('Synthetic Archive import did not complete');
  await navigate('/settings/reminders');
  const checkIn = page.locator('button[role="switch"][aria-label="Daily check-in"]');
  if (await checkIn.getAttribute('aria-checked') !== 'true') await checkIn.click();
  await navigate('/settings/reminders/new');
  await page.locator('[data-segment="med"]').click(); await page.locator('#r-name').fill('Upgrade fixture');
  await page.locator('[data-segment="DAILY"]').click(); await page.locator('[data-save]').click();
  await page.waitForURL((url) => url.pathname === '/settings/reminders');
  // Finish the return surface before capturing counts: it persists its first-visit preference.
  await navigate('/coming-back');
  await page.locator('[data-coming-back-done]').waitFor({ state: 'visible' });
  await page.waitForFunction(async () => {
    const Capacitor = /** @type {{ nativePromise(plugin: string, method: string, options: object): Promise<{ rows: unknown[] }> }} */ (Reflect.get(window, 'Capacitor'));
    const result = await Capacitor.nativePromise('Sqlite', 'query', { session: 'upgrade40-preparation', seq: 0, sql: "SELECT value FROM pref WHERE key = 'comingBackSeenSince'", params: [] });
    return result.rows.length === 1;
  });
  await page.locator('[data-coming-back-done]').click();
  await page.locator('[data-home-header]').waitFor({ state: 'visible' });
  console.log(`Prepared filled rc.1 journal in ${packageId} on ${serial} (${avd})`);
} catch (error) {
  device('uninstall', packageId); throw error;
} finally {
  if (browser) await browser.close();
  if (forwarded) device('forward', '--remove', `tcp:${port}`);
}
