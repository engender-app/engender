/* This probe only accepts its disposable package on an explicitly named emulator. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { assertInside, physicalBounds, safeScreenBounds, webViewBounds } from './geometry.mjs';

const serial = process.argv[2];
if (!/^emulator-\d+$/.test(serial ?? '')) throw new Error('Pass an emulator serial');
const pkg = 'dev.engender.app.test.insets51';
const out = resolve(process.argv[3] ?? '.claude/android-insets');
const adb = (...args) => execFileSync('adb', ['-s', serial, ...args], { encoding: 'utf8', timeout: 30000 });
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const api = Number(adb('shell', 'getprop', 'ro.build.version.sdk').trim());
assert.ok([33, 35, 36].includes(api), 'Only the requested API33/35/36 matrix counts');
assert.match(adb('emu', 'avd', 'name'), new RegExp(`^backend51-api${api}\\r?\\n`));
await mkdir(out, { recursive: true });
const apkPath = 'android/app/build/outputs/apk/debug/app-debug.apk';
const source = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const packagedRelease = JSON.parse(execFileSync('unzip', ['-p', apkPath, 'assets/public/release.json'], { encoding: 'utf8' }));
assert.ok(packagedRelease.version.includes(`+g${source.slice(0, 8)}`),
  'Build and cap-sync the current source before running the Android inset matrix');
const original = {
  accelerometer: adb('shell', 'settings', 'get', 'system', 'accelerometer_rotation').trim(),
  rotation: adb('shell', 'settings', 'get', 'system', 'user_rotation').trim(),
  overlays: adb('shell', 'cmd', 'overlay', 'list')
};
const metadata = {
  api, serial, package: pkg, source, packagedRelease,
  fingerprint: adb('shell', 'getprop', 'ro.build.fingerprint').trim(),
  webview: adb('shell', 'dumpsys', 'webviewupdate').split('\n').find((line) => line.includes('Current WebView package'))?.trim(),
  apkSha256: createHash('sha256').update(await readFile(apkPath)).digest('hex'),
  driverSha256: createHash('sha256').update(await readFile(new URL('./run.mjs', import.meta.url))).digest('hex'),
  geometrySha256: createHash('sha256').update(await readFile(new URL('./geometry.mjs', import.meta.url))).digest('hex'),
  capturedAt: new Date().toISOString(), results: []
};
let browser;
let port;
let page;
const cutoutOverlay = 'com.android.internal.display.cutout.emulation.tall';
const navigationOverlays = {
  gesture: 'com.android.internal.systemui.navbar.gestural',
  buttons: 'com.android.internal.systemui.navbar.threebutton'
};
const overlaysChanged = [cutoutOverlay, ...Object.values(navigationOverlays)];
const imeOpen = () => /mInputShown=true|isInputViewShown=true/.test(adb('shell', 'dumpsys', 'input_method'));

async function navigate(path) {
  await page.evaluate((path) => {
    const link = document.createElement('a');
    link.href = path;
    document.body.append(link);
    link.click();
    link.remove();
  }, path);
  await page.waitForURL((url) => url.pathname === path);
}

async function settle() {
  await page.locator('#splash').waitFor({ state: 'detached', timeout: 90000 });
  await page.waitForFunction(() => !document.documentElement.hasAttribute('data-splash'));
  await page.waitForFunction(() => !document.documentElement.hasAttribute('data-appearance-transition'));
  await pause(650);
}

async function capture(name, selectors, keyboard = false) {
  await settle();
  const screenshot = `${out}/${name}.png`;
  await writeFile(screenshot, execFileSync('adb', ['-s', serial, 'exec-out', 'screencap', '-p'], { timeout: 30000 }));
  const [width, height] = execFileSync('magick', ['identify', '-format', '%w %h', screenshot], { encoding: 'utf8' }).split(' ').map(Number);
  adb('shell', 'uiautomator', 'dump', '--compressed', `/sdcard/insets51.xml`);
  const native = webViewBounds(adb('shell', 'cat', '/sdcard/insets51.xml'), pkg);
  const display = adb('shell', 'dumpsys', 'window', 'displays');
  const geometryLines = display.split('\n').filter((line) => /InsetsSource|DisplayCutout|mDisplayFrame|mRotation=/.test(line));
  const dom = await page.evaluate((selectors) => {
    const rect = (el) => {
      const r = el.getBoundingClientRect();
      const x = (r.left + r.right) / 2, y = (r.top + r.bottom) / 2;
      const hit = document.elementFromPoint(x, y);
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom,
        actionable: el.matches('button,a,input,textarea'),
        hit: !!hit && (el.contains(hit) || hit.contains(el)),
        hitTarget: hit ? { tag: hit.tagName, className: hit.getAttribute('class') } : null };
    };
    return {
      width: innerWidth, height: innerHeight, dpr: devicePixelRatio,
      viewport: { width: visualViewport.width, height: visualViewport.height, top: visualViewport.offsetTop },
      theme: document.documentElement.dataset.theme,
      palette: document.documentElement.dataset.palette,
      insets: Object.fromEntries(['top', 'right', 'bottom', 'left'].map((side) => [side,
        getComputedStyle(document.documentElement).getPropertyValue(`--inset-${side}`).trim()])),
      controls: selectors.flatMap((selector) => [...document.querySelectorAll(selector)].filter((el) => el.checkVisibility())
        .map((el, index) => ({ selector, index, ...rect(el) })))
    };
  }, selectors);
  const result = { name, width, height, native, dom, geometryLines, imeVisible: imeOpen(),
    navigationMode: Number(adb('shell', 'settings', 'get', 'secure', 'navigation_mode').trim()),
    cutoutOverlayEnabled: adb('shell', 'cmd', 'overlay', 'list').split('\n').some((line) => line.trim() === `[x] ${cutoutOverlay}`),
    status: 'pending' };
  metadata.results.push(result);
  // Keep crops before assertions, including any failing configuration.
  const cropHeight = Math.min(420, Math.floor(height / 2));
  for (const [side, y] of [['top', 0], ['bottom', height - cropHeight]]) {
    execFileSync('magick', [screenshot, '-crop', `${width}x${cropHeight}+0+${y}`, '+repage', `${out}/${name}-${side}.png`]);
  }
  await writeFile(`${out}/result.json`, JSON.stringify(metadata, null, 2) + '\n');
  assert.equal(result.imeVisible, keyboard, `${name}: actual IME visibility`);
  assert.equal(dom.palette, 'trans', `${name}: requested palette`);
  assert.equal(result.navigationMode, name.includes('-gesture-') ? 2 : 0, `${name}: native navigation mode`);
  assert.equal(result.cutoutOverlayEnabled, name.includes('-cutout-'), `${name}: native cutout overlay`);
  result.insets = safeScreenBounds(display, width, height, keyboard);
  if (keyboard) {
    const y = Math.max(0, result.insets.safe.bottom - cropHeight + 100);
    execFileSync('magick', [screenshot, '-crop', `${width}x${cropHeight}+0+${y}`, '+repage', `${out}/${name}-ime-boundary.png`]);
  }
  if (name.includes('cutout')) assert.ok(Object.values(result.insets.cutout).some((value) => value > 0), `${name}: native cutout exists`);
  assert.equal(width > height, name.includes('landscape'), `${name}: native orientation`);
  for (const selector of selectors) assert.ok(dom.controls.some((item) => item.selector === selector), `${name}: ${selector} exists`);
  for (const control of dom.controls) {
    const physical = physicalBounds(control, native, dom.width);
    control.physical = physical;
    assertInside(physical, native, `${name}: ${control.selector} in WebView`);
    assertInside(physical, result.insets.safe, `${name}: ${control.selector} clear of system bars, cutout and IME`);
    if (control.actionable) assert.equal(control.hit, true, `${name}: ${control.selector} receives pointer input`);
    if (control.selector.startsWith('[data-save')) {
      assert.ok(control.right - control.left >= 48 && control.bottom - control.top >= 48,
        `${name}: ${control.selector} keeps a 48px touch target`);
    }
  }
  result.status = 'pass';
  await writeFile(`${out}/result.json`, JSON.stringify(metadata, null, 2) + '\n');
  console.log(`${name}: PASS native inset and control geometry`);
}

async function startApp(activity) {
  if (browser) await browser.close();
  if (port) adb('forward', '--remove', `tcp:${port}`);
  browser = undefined;
  port = undefined;
  adb('shell', 'am', 'force-stop', pkg);
  adb('shell', 'am', 'start', '-W', '-n', activity);
  await pause(1500);
  const pid = adb('shell', 'pidof', pkg).trim().split(/\s+/)[0];
  port = adb('forward', 'tcp:0', `localabstract:webview_devtools_remote_${pid}`).trim();
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { noDefaults: true });
  page = browser.contexts()[0].pages()[0];
  page.setDefaultTimeout(30000);
  await page.waitForSelector('[data-leave-setup], [data-access-modes], [data-home-hello]', { timeout: 90000 });
  if (await page.locator('[data-leave-setup]').count()) await page.locator('[data-leave-setup]').click();
  if (await page.locator('[data-access-modes]').count()) {
    await page.locator('[data-list-row="unlocked"]').click();
    await page.locator('[data-access-submit]').click();
    await page.locator('[data-leave-setup]').click();
  }
  await page.locator('[data-home-hello]').waitFor();
  await page.evaluate(() => {
    const style = document.createElement('style');
    style.textContent = '.demo-bar { display: none !important; }';
    document.head.append(style);
    document.body.classList.remove('has-demo-bar');
    const web = [...document.querySelectorAll('.demo-bar button')].find((el) => el.textContent.trim() === 'Web');
    if (!web) throw new Error('This probe requires the demo controls');
    web.click();
    if (document.querySelector('[aria-label="Safe area"] button')?.getAttribute('aria-pressed') === 'true') throw new Error('Synthetic CSS insets must be disabled');
  });
}

try {
  const activity = adb('shell', 'cmd', 'package', 'resolve-activity', '--brief', '-a', 'android.intent.action.MAIN', '-c', 'android.intent.category.LAUNCHER', '-p', pkg).trim().split('\n').at(-1);
  assert.ok(activity.includes(pkg), 'The isolated package must be installed');
  const installedPath = adb('shell', 'pm', 'path', pkg).trim().replace(/^package:/, '');
  metadata.installedApkSha256 = adb('shell', 'sha256sum', installedPath).trim().split(/\s+/)[0];
  assert.equal(metadata.installedApkSha256, metadata.apkSha256, 'Installed APK must match the current local artifact');
  for (const navigation of ['gesture', 'buttons']) {
    adb('shell', 'cmd', 'overlay', 'enable-exclusive', '--category', navigationOverlays[navigation]);
    assert.equal(Number(adb('shell', 'settings', 'get', 'secure', 'navigation_mode').trim()), navigation === 'gesture' ? 2 : 0);
    for (const profile of ['portrait', 'cutout-portrait', 'cutout-landscape']) {
      adb('shell', 'cmd', 'overlay', profile === 'portrait' ? 'disable' : 'enable', cutoutOverlay);
      adb('shell', 'settings', 'put', 'system', 'accelerometer_rotation', '0');
      adb('shell', 'settings', 'put', 'system', 'user_rotation', profile === 'cutout-landscape' ? '1' : '0');
      await pause(1200);
      await startApp(activity);
      for (const theme of ['light', 'dark']) {
        await page.evaluate((theme) => {
          const button = [...document.querySelectorAll('.demo-bar button')].find((el) => el.textContent.trim() === (theme === 'dark' ? 'Dark' : 'Light'));
          if (!button) throw new Error('Missing theme control');
          button.click();
        }, theme);
        await page.waitForFunction((theme) => document.documentElement.dataset.theme === theme, theme);
        const name = `api${api}-${navigation}-${profile}-${theme}`;
        await navigate('/');
        await page.locator('[data-home-hello]').waitFor();
        await capture(`${name}-home`, ['[data-home-hero]', '[data-home-hello]', '[data-home-gear]', '[data-nav-item]']);
        await navigate('/entry/new/today');
        await page.locator('#ed-note').waitFor();
        await capture(`${name}-editor`, ['[data-screen-title="entry"]', '[data-screen-back]', '[data-save]', '[data-save-star]', '[data-save-moods] [data-mood]']);
        await page.locator('[data-use-template]').click();
        await page.locator('[data-sheet]').waitFor();
        await capture(`${name}-sheet`, ['[data-sheet] h2', '[data-manage-entry-templates]']);
        await page.locator('[data-sheet] [data-list-row]').last().scrollIntoViewIfNeeded();
        await capture(`${name}-sheet-end`, ['[data-sheet] [data-list-row]:last-child']);
        adb('shell', 'input', 'keyevent', 'KEYCODE_BACK');
        await page.locator('[data-sheet]').waitFor({ state: 'detached' });
        await page.locator('#ed-note').click();
        for (let i = 0; i < 30 && !imeOpen(); i++) await pause(100);
        await capture(`${name}-editor-ime`, ['[data-save]', '[data-save-star]', '[data-save-moods] [data-mood]'], true);
        adb('shell', 'input', 'keyevent', 'KEYCODE_BACK');
        for (let i = 0; i < 30 && imeOpen(); i++) await pause(100);
      }
    }
  }
  assert.equal(metadata.results.length, 60, 'Every requested case must run');
} catch (error) {
  metadata.error = String(error);
  throw error;
} finally {
  if (browser) await browser.close();
  if (port) adb('forward', '--remove', `tcp:${port}`);
  adb('shell', 'rm', '-f', '/sdcard/insets51.xml');
  for (const overlay of overlaysChanged) {
    const enabled = original.overlays.split('\n').some((line) => line.trim() === `[x] ${overlay}`);
    adb('shell', 'cmd', 'overlay', enabled ? 'enable' : 'disable', overlay);
  }
  for (const [key, value] of [['accelerometer_rotation', original.accelerometer], ['user_rotation', original.rotation]]) {
    if (value === 'null') adb('shell', 'settings', 'delete', 'system', key);
    else adb('shell', 'settings', 'put', 'system', key, value);
  }
  await writeFile(`${out}/result.json`, JSON.stringify(metadata, null, 2) + '\n');
}
