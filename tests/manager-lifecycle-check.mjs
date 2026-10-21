/* Production shell regression. Optional SERIAL and isolated PACKAGE exercise
   the same managers through Android's real Home/resume lock path. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright-core';
import { launchChromium, previewBuild } from './browser-harness.mjs';
import { firstRun, reachAccessSetup, ready, clientRoute, JOURNAL_SECRET } from './browser-tier/built-flow.mjs';

const [serial, pkg] = process.argv.slice(2);
if (serial && (!/^emulator-\d+$/.test(serial) || !/^dev\.engender\.app\.test\.[a-z0-9]+$/.test(pkg ?? ''))) {
  throw new Error('Pass an emulator serial and an isolated dev.engender.app.test.<suffix> package');
}
const adb = (...args) => execFileSync('adb', ['-s', serial, ...args], { encoding: 'utf8' }).trim();
const app = serial ? null : await previewBuild(process.cwd());
let port;
let browser;
let page;
try {
  if (serial) {
    const pid = adb('shell', 'pidof', pkg).split(/\s+/)[0];
    port = adb('forward', 'tcp:0', `localabstract:webview_devtools_remote_${pid}`);
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { noDefaults: true });
  } else browser = await launchChromium();
  page = serial ? browser.contexts()[0].pages()[0] : await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  const origin = serial ? new URL(page.url()).origin : `http://localhost:${app.httpServer.address().port}`;
  if (serial) {
    await reachAccessSetup(page, origin);
    await page.locator('[data-list-row="passphrase"]').press('Enter');
    await page.locator('[data-access-continue]').press('Enter');
    await page.locator('#am-passphrase').fill(JOURNAL_SECRET);
    await page.locator('#am-passphrase-confirm').fill(JOURNAL_SECRET);
    await page.locator('[data-access-submit]').press('Enter');
    await ready(page);
    for (let step = 0; step < 12 && await page.locator('[data-next]').count(); step++) {
      await page.locator('[data-next]').press('Enter');
    }
    await page.locator('[data-finish]').press('Enter');
    await page.locator('[data-home-hello]').waitFor();
  } else await firstRun(page, origin);
  const settle = () => page.evaluate(async () => {
    await Promise.all(document.getAnimations().filter(animation =>
      animation.effect?.getTiming().iterations !== Infinity
    ).map(animation => animation.finished.catch(() => {})));
  });
  const route = async path => { await clientRoute(page, path); await settle(); };
  const closed = async () => {
    await page.waitForFunction(() => !document.querySelector('[role="dialog"]'));
    await settle();
    assert.equal(await page.locator('[role="dialog"]').count(), 0);
    assert.equal(await page.locator('[data-app-scroll-region][inert]').count(), 0);
  };
  // A new journal has no modes until someone adds one.
  await route('/settings');
  await page.locator('[data-list-row="presentations"]').click();
  await page.locator('[data-add]').click();
  await page.locator('#presentation-name').fill('Everyday');
  await page.locator('[data-save-presentation]').click();
  await page.locator('#presentation-name').waitFor({ state: 'detached' });
  await page.keyboard.press('Escape');
  await closed();
  const entry = '/entry/new/20000';
  const openManager = async kind => {
    if (kind === 'modes') await page.locator('[data-manage-presentations]').click();
    else {
      await page.locator('[data-use-template]').click();
      await page.locator('[data-manage-entry-templates]').click();
      await page.locator('[data-manage-entry-templates]').waitFor({ state: 'detached' });
    }
    await page.getByRole('dialog', { name: kind === 'modes' ? 'Modes' : 'Templates', exact: true }).waitFor();
    await settle();
  };
  for (const kind of ['modes', 'templates']) {
    for (const back of [false, true]) {
      await route('/calendar');
      await route(entry);
      await openManager(kind);
      await page.evaluate(() => {
        const sheet = document.querySelector('[role="dialog"]');
        window.managerFrames = [];
        const sample = () => {
          if (!sheet.isConnected) return;
          const style = getComputedStyle(sheet);
          window.managerFrames.push({ y: new DOMMatrixReadOnly(style.transform).m42, height: sheet.offsetHeight });
          requestAnimationFrame(sample);
        };
        sample();
      });
      if (back) await page.goBack();
      else await route('/stats');
      await page.waitForURL(url => url.pathname === (back ? '/calendar' : '/stats'));
      await closed();
      await page.waitForFunction(() => {
        const active = document.activeElement;
        return active && active !== document.body && !active.closest('[inert], [hidden], [data-retained-door]:not([data-retained-active])');
      });
      const frames = await page.evaluate(() => window.managerFrames);
      assert.ok(frames.some(frame => frame.y > 0 && frame.y < frame.height), 'manager closes through intermediate motion frames');
      console.log(`MOTION ${kind}: ${frames.length} frames, ${new Set(frames.map(frame => frame.y)).size} positions`);
      await route('/');
      await closed();
      console.log(`PASS ${kind} closes on ${back ? 'browser Back' : 'navigation'} and stays closed`);
    }
  }

  // Ordinary dismissal still returns focus to the actual launcher.
  await route(entry);
  await openManager('modes');
  if (serial) adb('shell', 'input', 'keyevent', 'KEYCODE_BACK');
  else await page.keyboard.press('Escape');
  await closed();
  await page.waitForFunction(() => document.activeElement?.matches('[data-manage-presentations]'));
  await route('/');
  await page.locator('[data-nav-fab]').click();
  await page.locator('[data-quick-add]').waitFor();
  await route('/calendar');
  await page.locator('[data-quick-add]').waitFor({ state: 'detached' });
  console.log('PASS manager dismissal restores focus; navigation closes Quick add');

  await route('/settings/access-mode');
  await page.locator('[data-lock-after-choice="immediately"]').click();
  if (serial) {
    for (let visit = 0; visit < 8; visit++) {
      await route(visit % 2 ? '/' : '/calendar');
      await page.evaluate(() => new Promise(resolve => requestIdleCallback(resolve, { timeout: 1000 })));
      if (await page.locator('[data-retained-door]').count() >= 2) break;
    }
    assert.ok(await page.locator('[data-retained-door]').count() >= 2, 'two real doors retained');
  }
  {
    const kind = serial ? 'modes' : 'templates';
    await route('/settings');
    if (serial) assert.ok(await page.locator('[data-retained-door]:not([data-retained-active])').count(), 'hidden retained door behind Settings');
    await page.locator(`[data-list-row="${kind === 'modes' ? 'presentations' : 'entry-templates'}"]`).click();
    await page.locator('[role="dialog"]').waitFor();
    await settle();
    await page.evaluate(() => {
      window.managerGateLeaks = [];
      window.managerGateObserver = new MutationObserver(() => {
        if (document.querySelector('[data-applock]') && document.querySelector('[role="dialog"], [data-retained-door], [data-list-row="presentations"]')) {
          window.managerGateLeaks.push('journal or manager remained behind gate');
        }
      });
      window.managerGateObserver.observe(document.body, { childList: true, subtree: true });
    });
    if (serial) {
      adb('shell', 'input', 'keyevent', 'KEYCODE_HOME');
      adb('shell', 'am', 'start', '-n', `${pkg}/dev.engender.app.disguise.LauncherDefault`);
    } else await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
      delete document.visibilityState;
    });
    await page.locator('[data-applock]').waitFor();
    assert.equal(await page.locator('[role="dialog"], [data-retained-door], [data-list-row="presentations"]').count(), 0);
    assert.deepEqual(await page.evaluate(() => { window.managerGateObserver.disconnect(); return window.managerGateLeaks; }), []);
    await settle();
    await page.locator('#session-passphrase').fill(JOURNAL_SECRET);
    await page.locator('[data-applock] button[type="submit"]').press('Enter');
    await page.locator('[data-applock]').waitFor({ state: 'detached' });
    await page.locator('[data-list-row="presentations"]').waitFor();
    await closed();
    await page.waitForFunction(() => document.activeElement?.matches('h1') && !document.activeElement.closest('[inert]'));
    console.log(`PASS ${serial ? 'Android Home/resume' : 'web visibility'} lock/unlock clears ${kind} and restores named focus`);
    if (serial) {
      await route('/');
      await route('/calendar');
      await page.waitForSelector('[data-retained-door]:not([data-retained-active])', { state: 'attached' });
    }
  }
  assert.deepEqual(errors, [], 'No uncaught page errors');
  if (serial) {
    console.log('Android API', adb('shell', 'getprop', 'ro.build.version.sdk'));
    console.log(adb('shell', 'dumpsys', 'webviewupdate').split('\n').find(line => line.includes('Current WebView package')));
  }
} catch (error) {
  if (page) console.error(await page.evaluate(() => ({
    path: location.pathname,
    boot: document.querySelector('[data-app-root]')?.getAttribute('data-boot'),
    headings: [...document.querySelectorAll('h1, h2')].map(node => node.textContent),
    dialogs: [...document.querySelectorAll('[role="dialog"]')].map(node => node.getAttribute('aria-label'))
  })).catch(() => null));
  throw error;
} finally {
  if (browser) await browser.close();
  if (port) adb('forward', '--remove', `tcp:${port}`);
  if (app) await new Promise(resolve => app.httpServer.close(resolve));
}
