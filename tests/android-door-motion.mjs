import assert from 'node:assert/strict';
import { realpathSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'vite';
import { launchChromium } from './browser-harness.mjs';

// Warm routes expose overlapping onNavigate callbacks; URLs change before DOM commits.
const out = '.claude/android-door-motion';
await mkdir(out, { recursive: true });
const server = await createServer({
  server: { port: 0, fs: { allow: [process.cwd(), realpathSync('node_modules')] } }
});
await server.listen();
const browser = await launchChromium();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
const results = [];
page.on('pageerror', (error) => errors.push(String(error)));

async function home() {
  await page.evaluate(() => document.querySelector('[data-nav-item="home"]').click());
  await page.waitForSelector('[data-home-hello]');
  await page.waitForTimeout(1200);
}

async function interruptDeparture(action) {
  return page.evaluate(async (action) => {
    const alpha = () => {
      let value = 1;
      let element = document.querySelector('[data-home-hello]');
      if (!element) return null;
      for (; element; element = element.parentElement) value *= Number(getComputedStyle(element).opacity);
      return value;
    };
    document.querySelector('[data-nav-item="calendar"]').click();
    const deadline = performance.now() + 3000;
    while (alpha() >= 0.8 && performance.now() < deadline) await new Promise(requestAnimationFrame);
    const before = alpha();
    if (before === null || before <= 0 || before >= 0.8) throw Error('departure not sampled');
    if (action === 'door') document.querySelector('[data-nav-item="stats"]').click();
    else if (action === 'deep') document.querySelector('[data-home-gear]').click();
    else {
      const { bootState } = await import('/src/lib/stores/boot.svelte.ts');
      const { lockState } = await import('/src/lib/stores/lock.svelte.ts');
      bootState.accessMode = 'passphrase';
      lockState.unlocked = false;
    }
    const samples = [];
    for (let i = 0; i < 24; i++) {
      await new Promise(requestAnimationFrame);
      samples.push({
        at: performance.now(), opacity: alpha(), path: location.pathname,
        gate: !!document.querySelector('#session-passphrase'),
        screens: [...document.querySelectorAll('[data-app-scroll-region] .screen')].map((element) => ({
          title: element.querySelector('h1')?.textContent,
          home: !!element.querySelector('[data-home-header]')
        }))
      });
    }
    return { action, before, samples };
  }, action);
}

try {
  await page.goto(server.resolvedUrls.local[0]);
  await page.waitForSelector('[data-app-root][data-boot="ready"]', { timeout: 60000 });
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    window.Capacitor.getPlatform = () => 'android';
    document.querySelector('.demo-bar')?.style.setProperty('display', 'none');
  });
  for (const tab of ['calendar', 'stats', 'settings', 'home']) {
    await page.evaluate((tab) => document.querySelector(`[data-nav-item="${tab}"]`).click(), tab);
    await page.waitForTimeout(1300);
  }
  for (const action of ['door', 'deep']) {
    await home();
    const result = await interruptDeparture(action);
    results.push(result);
    assert(!result.samples.some((sample) => sample.screens.some((screen) => screen.title === 'Calendar')),
      'superseded Calendar painted');
    assert(result.samples.every((sample) => sample.opacity === null || sample.opacity <= result.before + 0.025),
      'interruption restored outgoing opacity');
    const title = action === 'door' ? 'Look back' : 'Settings';
    await page.waitForFunction((title) =>
      document.querySelector('[data-app-scroll-region] h1')?.textContent === title, title);
    await page.waitForTimeout(1200);
    assert.equal(await page.locator('[data-home-hello]').count(), 0);
    await page.goBack();
    await page.waitForTimeout(1500);
    const returned = await page.evaluate(() => ({
      path: location.pathname,
      screens: document.querySelectorAll('[data-app-scroll-region] > .screen').length,
      title: document.querySelector('[data-app-scroll-region] h1')?.textContent
    }));
    assert.equal(returned.screens, 1);
    assert.equal(returned.title, returned.path === '/' ? 'engender' : 'Calendar');
    results.push({ returned });
  }
  await home();
  await page.evaluate(() => { document.documentElement.dataset.a11yMotion = 'reduce'; });
  await page.evaluate(() => document.querySelector('[data-nav-item="calendar"]').click());
  await page.waitForFunction(() =>
    document.querySelector('[data-app-scroll-region] h1')?.textContent === 'Calendar');
  await page.evaluate(() => new Promise(requestAnimationFrame));
  const reduced = await page.evaluate(() => ({
    motion: document.documentElement.dataset.a11yMotion,
    bridge: document.querySelectorAll('.is-tab-bridging').length,
    movingContent: document.getAnimations().filter((animation) =>
      animation.effect?.target instanceof HTMLElement &&
      animation.effect.target.closest('[data-app-scroll-region]') &&
      animation.effect.getComputedTiming().duration > 1 && animation.playState === 'running'
    ).length
  }));
  results.push(reduced);
  assert.equal(reduced.motion, 'reduce');
  assert.equal(reduced.bridge, 0);
  assert.equal(reduced.movingContent, 0);
  await page.evaluate(() => { delete document.documentElement.dataset.a11yMotion; });
  await home();
  results.push(await interruptDeparture('gate'));
  await page.waitForSelector('#session-passphrase');
  await page.waitForTimeout(1000);
  assert.equal(await page.locator('[data-home-hello], [data-home-header]').count(), 0);
  await page.screenshot({ path: `${out}/gate-during-exit.png` });
  assert.equal(errors.length, 0, errors.join('\n'));
  console.log('PASS rapid door, rapid deep, Back, reduced motion, gate during exit');
} finally {
  await writeFile(`${out}/lifecycle.json`, JSON.stringify({ results, errors }, null, 2));
  await browser.close();
  await server.close();
}
