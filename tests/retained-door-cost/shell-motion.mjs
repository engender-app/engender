import assert from 'node:assert/strict';
import { writeFile, mkdir } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { launchChromium } from '../browser-harness.mjs';

const cdp = process.env.RETAINED64_CDP;
const modes = cdp ? [process.env.RETAINED64_MODE] : ['current', 'deferred'];
assert(modes.every(mode => mode === 'current' || mode === 'deferred'), 'native capture requires prepared RETAINED64_MODE');
const out = process.env.RETAINED64_MOTION_OUT ?? '.claude/retained64-shell-motion.json';
let server;
const browser = cdp ? await chromium.connectOverCDP(cdp, { noDefaults: true }) : await launchChromium();
const page = cdp ? browser.contexts()[0].pages()[0] : await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', error => errors.push(String(error)));
const results = [];
try {
  if (cdp) await page.evaluate(async () => { window.__retained64Wake = await navigator.wakeLock.request('screen'); });
  if (!cdp) {
    server = await createServer({ configFile: 'tests/retained-door-cost/shell.vite.config.ts', server: { port: 0 } });
    await server.listen();
  }
  const origin = cdp ? new URL(page.url()).origin : server.resolvedUrls.local[0];
  for (const mode of modes) {
    if (!cdp) {
      await page.goto(origin);
      await page.evaluate(mode => { localStorage.setItem('retained64-mode', mode); }, mode);
      await page.reload();
    } else assert.equal(await page.evaluate(() => window.__retainedDoorExperiment), mode, 'native shell mode was not prepared');
    await page.waitForSelector('[data-app-root][data-boot="ready"]', { timeout: 60000 });
    await page.waitForFunction(() => !!window.__retainedShell, null, { timeout: 60000 });
    if (cdp) assert(await page.evaluate(() => !!window.__retained64Wake && !window.__retained64Wake.released),
      'physical shell could not keep foreground screen awake');
    if (!cdp) await page.evaluate(() => { window.Capacitor.getPlatform = () => 'android'; });
    await page.evaluate(() => { document.documentElement.dataset.a11yMotion = 'full'; });
    await page.evaluate(() => document.querySelector('[data-nav-item="calendar"]').click());
    await page.waitForURL('**/calendar');
    await page.waitForFunction(() => !document.querySelector('.is-tab-bridging'));
    await page.waitForFunction(() => window.__retainedShell.retainedReady?.());
    const settled = async (path) => {
      try {
        await page.waitForFunction(path => document.querySelector('[data-retained-active]')?.getAttribute('data-retained-door') === path, path);
      } catch (error) {
        const state = await page.evaluate(() => ({ path: location.pathname,
          active: document.querySelector('[data-retained-active]')?.getAttribute('data-retained-door'),
          boot: document.querySelector('[data-app-root]')?.getAttribute('data-boot'),
          bridge: !!document.querySelector('.is-tab-bridging') }));
        throw new Error(`${mode}: arrival at ${path} failed: ${JSON.stringify({ state, errors })}`, { cause: error });
      }
      await page.waitForFunction(() => !document.querySelector('.is-tab-bridging'));
      await page.waitForTimeout(700);
    };
    const door = async (tab, path) => {
      await page.evaluate(tab => document.querySelector(`[data-nav-item="${tab}"]`).click(), tab);
      await settled(path);
    };
    await door('home', '/');
    for (const [tab, path] of [['calendar', '/calendar'], ['stats', '/stats'], ['settings', '/more'], ['home', '/']]) await door(tab, path);
    assert.equal(await page.locator('[data-retained-door]').count(), 4);
    await page.evaluate(() => {
      window.__retained64Reading = document.querySelector('[data-retained-door="/stats"] [data-lookback-readings]');
      window.__retainedShell.animations.length = 0;
    });
    const motion = await page.evaluate(async () => {
      const start = performance.now();
      const samples = [];
      document.querySelector('[data-nav-item="stats"]').click();
      let firstActive;
      while (performance.now() - start < 1500) {
        await new Promise(requestAnimationFrame);
        const active = document.querySelector('[data-retained-active][data-retained-door="/stats"]');
        if (active && !firstActive) firstActive = {
          sameReadingNode: window.__retained64Reading === active.querySelector('[data-lookback-readings]'),
          placeholderCount: active.querySelectorAll('[data-read-reserve-hold]').length,
          atMs: performance.now() - start
        };
        samples.push({ atMs: performance.now() - start,
          held: window.__retainedShell.animations.filter(event => event.animation.playState === 'paused' && Number(event.animation.currentTime) <= 0.1).length });
      }
      const events = window.__retainedShell.animations;
      return { firstActive, samples, animations: events.map(event => ({
        frames: event.frames, playState: event.animation.playState,
        duration: event.animation.effect?.getTiming().duration
      })), hiddenSafe: [...document.querySelectorAll('[data-retained-door]:not([data-retained-active])')]
        .every(door => door.inert && getComputedStyle(door).display === 'none') };
    });
    assert(motion.firstActive?.sameReadingNode, `${mode}: last-result reading node replaced`);
    assert.equal(motion.firstActive.placeholderCount, 0, `${mode}: warm revisit painted a placeholder`);
    assert(motion.hiddenSafe, `${mode}: hidden door lost concealment`);
    assert(motion.samples.some(sample => sample.held > 0), `${mode}: authored paint hold absent`);
    assert(motion.animations.some(event => Array.isArray(event.frames) && event.frames.some(frame => frame.opacity === 0.004)), `${mode}: accepted nil-opacity floor absent`);
    await door('home', '/');
    await page.evaluate(() => { document.documentElement.dataset.a11yMotion = 'reduce'; window.__retainedShell.animations.length = 0; });
    await door('calendar', '/calendar');
    const reduced = await page.evaluate(() => ({ bridge: !!document.querySelector('.is-tab-bridging'),
      running: document.getAnimations().filter(animation => animation.playState === 'running' &&
        animation.effect?.target instanceof Element && animation.effect.target.closest('[data-app-scroll-region]') &&
        Number(animation.effect.getComputedTiming().duration) > 1).length }));
    assert.deepEqual(reduced, { bridge: false, running: 0 }, `${mode}: reduced motion still travels`);
    await page.evaluate(() => { window.__retainedShell.lockState.unlocked = false; });
    await page.waitForSelector('#session-passphrase');
    const gate = await page.evaluate(() => ({ retained: document.querySelectorAll('[data-retained-door]').length,
      journalScreens: document.querySelectorAll('[data-app-scroll-region] .screen:not([data-gate-frame])').length }));
    assert.deepEqual(gate, { retained: 0, journalScreens: 0 }, `${mode}: lock retained private DOM`);
    if (!cdp) {
      await page.locator('#session-passphrase').fill('demo');
      await page.locator('[data-session-submit]').click();
      await page.waitForSelector('[data-app-root][data-boot="ready"]');
    }
    results.push({ mode, build: await page.evaluate(() => window.__retainedShell.build), motion, reduced, gate, userAgent: await page.evaluate(() => navigator.userAgent) });
  }
  assert.deepEqual(errors, [], 'shell page errors');
  await mkdir(new URL('../../.claude/', import.meta.url), { recursive: true });
  await writeFile(out, JSON.stringify({ platform: cdp ? 'physical Android WebView' : 'desktop Chromium Android shell path',
    driverSha256: createHash('sha256').update(readFileSync(new URL(import.meta.url))).digest('hex'), results }, null, 2));
  console.log('PASS retained current/deferred shell last-result painting, arrival hold, opacity floor, reduced motion and lock cleanup');
} finally {
  if (cdp) await page.evaluate(() => window.__retained64Wake?.release()).catch(() => {});
  await browser.close();
  await server?.close();
}
