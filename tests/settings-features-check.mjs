import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { launchPersistentChromium, previewBuild, settlePage } from './browser-harness.mjs';
import { INIT_HIDE_DEMO_SCRIPT, STUB_PERSIST_SCRIPT } from './yank-sweep-core.mjs';
import { PALETTES } from './palettes.mjs';

const out = resolve('.claude/settings-features-shots');
const extension = await mkdtemp(join(tmpdir(), 'features-zoom-'));
const profile = await mkdtemp(join(tmpdir(), 'features-profile-'));
await mkdir(out, { recursive: true });
await writeFile(join(extension, 'manifest.json'), JSON.stringify({
  manifest_version: 3, name: 'Settings zoom check', version: '1.0',
  permissions: ['tabs'], background: { service_worker: 'worker.js' }
}));
await writeFile(join(extension, 'worker.js'), 'chrome.runtime.onInstalled.addListener(() => {});');
const app = await previewBuild(process.cwd());
let context;
const reports = [];
try {
  context = await launchPersistentChromium(profile, {
    viewport: { width: 390, height: 844 },
    ignoreDefaultArgs: ['--disable-extensions'],
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`]
  });
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.addInitScript(INIT_HIDE_DEMO_SCRIPT);
  await page.addInitScript(STUB_PERSIST_SCRIPT);
  const base = `http://localhost:${app.httpServer.address().port}`;
  await settlePage(page, base, '/settings', 'light');
  const launcher = page.locator('[data-list-row="features"]');
  const manager = page.locator('[data-sheet]');
  const close = page.locator('[data-features-close]');
  const handles = ['measurements', 'genital-effects', 'cycle-tracking'];
  const geometry = () => page.evaluate(() => {
    const sheet = document.querySelector('[data-sheet]');
    const main = document.querySelector('.app-main');
    return {
      viewport: window.innerWidth,
      mainOverflow: main.scrollWidth - main.clientWidth,
      sheetOverflow: sheet ? sheet.scrollWidth - sheet.clientWidth : 0,
      switches: [...document.querySelectorAll('[data-feature-visibility] [role="switch"]')].map((node) => {
        const rect = node.getBoundingClientRect();
        return { width: rect.width, height: rect.height, name: node.getAttribute('aria-label'),
          labelWidth: node.closest('.kit-row').querySelector('.kit-row-text').getBoundingClientRect().width };
      })
    };
  });
  const checkLayout = async (label) => {
    await page.waitForTimeout(500);
    const layout = await geometry();
    assert.ok(layout.mainOverflow <= 1, `${label}: Settings horizontal overflow`);
    assert.ok(layout.sheetOverflow <= 1, `${label}: manager horizontal overflow`);
    assert.equal(layout.switches.length, 3);
    for (const control of layout.switches) {
      assert.ok(control.width >= 47.99 && control.height >= 47.99, `${label}: switch touch target ${JSON.stringify(control)}`);
      assert.ok(control.name);
      if (layout.viewport < 240) assert.ok(control.labelWidth >= 80, `${label}: feature label too narrow`);
    }
    await page.screenshot({ path: `${out}/${label}.png` });
    reports.push({ label, ...layout });
  };

  assert.equal(await page.locator('[data-feature-visibility]').count(), 0);
  await launcher.scrollIntoViewIfNeeded();
  await launcher.focus();
  await page.screenshot({ path: `${out}/settings-row.png` });
  const origin = await launcher.evaluate((node) => ({ y: node.getBoundingClientRect().top, scroll: document.querySelector('.app-main').scrollTop }));
  await launcher.press('Enter');
  await manager.waitFor();
  await page.waitForFunction(() => !!document.activeElement?.closest('[data-sheet]'));
  assert.equal(await manager.getAttribute('aria-label'), 'Features to show');
  assert.equal(await manager.getAttribute('aria-modal'), 'true');
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('Tab');
    assert.ok(await page.evaluate(() => !!document.activeElement?.closest('[data-sheet]')));
  }
  await page.keyboard.press('Escape');
  await manager.waitFor({ state: 'detached' });
  const returned = await launcher.evaluate((node) => ({ focused: node === document.activeElement, y: node.getBoundingClientRect().top, scroll: document.querySelector('.app-main').scrollTop }));
  assert.equal(returned.focused, true);
  assert.ok(Math.abs(returned.y - origin.y) <= 1 && Math.abs(returned.scroll - origin.scroll) <= 1);

  await launcher.click();
  for (const handle of handles) {
    const control = page.locator(`[data-${handle}-toggle] [role="switch"]`);
    await control.waitFor();
    await page.waitForFunction((selector) => !document.querySelector(selector)?.disabled, `[data-${handle}-toggle] [role="switch"]`);
    const original = await control.getAttribute('aria-checked');
    await control.focus();
    await control.press('Space');
    await page.waitForFunction(([selector, before]) => document.querySelector(selector)?.getAttribute('aria-checked') !== before,
      [`[data-${handle}-toggle] [role="switch"]`, original]);
  }
  const changed = await page.locator('[data-feature-visibility] [role="switch"]').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('aria-checked')));
  await close.click();
  await manager.waitFor({ state: 'detached' });
  assert.equal(await page.locator('[data-feature-visibility] [role="switch"]').count(), 0);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('[data-app-root][data-boot="ready"]');
  await launcher.click();
  await page.waitForFunction(() => [...document.querySelectorAll('[data-feature-visibility] [role="switch"]')].every((node) => !node.disabled));
  assert.deepEqual(await page.locator('[data-feature-visibility] [role="switch"]').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('aria-checked'))), changed);
  for (const palette of PALETTES) {
    for (const theme of ['light', 'dark']) {
      await page.evaluate(([palette, theme]) => { document.documentElement.dataset.palette = palette; document.documentElement.dataset.theme = theme; }, [palette, theme]);
      await checkLayout(`${palette}-${theme}`);
    }
  }
  await close.click();
  await manager.waitFor({ state: 'detached' });
  await page.locator('[data-list-row="disguise"]').click();
  await manager.getByRole('switch').click();
  await page.keyboard.press('Escape');
  await manager.waitFor({ state: 'detached' });
  await page.locator('[data-list-row="language"]').click();
  await page.locator('[data-segment="pl"]').click();
  await page.waitForSelector('[data-app-root][data-boot="ready"]');
  await page.waitForFunction(() => document.querySelector('[data-list-row="features"]')?.textContent.includes('Widoczne funkcje'));
  await launcher.click();
  assert.equal(await manager.getAttribute('aria-label'), 'Widoczne funkcje');
  await page.setViewportSize({ width: 230, height: 844 });
  await checkLayout('narrow-230');
  await page.setViewportSize({ width: 390, height: 844 });
  const zoom = await worker.evaluate(async (url) => {
    const tab = (await chrome.tabs.query({})).find((tab) => tab.url === url);
    if (!tab) throw new Error('Settings tab unavailable for browser zoom');
    await chrome.tabs.setZoom(tab.id, 2);
    return chrome.tabs.getZoom(tab.id);
  }, page.url());
  assert.equal(zoom, 2);
  await checkLayout('browser-zoom-200');
  await close.click();
  await manager.waitFor({ state: 'detached' });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await launcher.press('Enter');
  await manager.waitFor();
  await page.keyboard.press('Escape');
  await manager.waitFor({ state: 'detached' });
  assert.equal(await launcher.evaluate((node) => node === document.activeElement), true);
  assert.deepEqual(errors, []);
  await writeFile(`${out}/report.json`, JSON.stringify({ browserZoom: zoom, reports, keyboard: true, persistence: true, reducedMotion: true, errors }, null, 2));
  console.log(`Features manager: keyboard, focus/scroll return, persistence, reduced motion, ${reports.length} layouts, browser zoom ${zoom * 100}% pass`);
} finally {
  await context?.close();
  await new Promise((resolve) => app.httpServer.close(resolve));
  await rm(extension, { recursive: true, force: true });
  await rm(profile, { recursive: true, force: true });
}
