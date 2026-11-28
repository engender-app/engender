/* Journal history restores its month and expanded rows. Run with node. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright-core';
import { realpathSync } from 'node:fs';
import { createServer } from 'vite';
import { continueToTheRest, launchChromium, untilSplashLets } from './browser-harness.mjs';
import { reachAccessSetup, ready, clientRoute, JOURNAL_SECRET } from './browser-tier/built-flow.mjs';

const serial = process.env.JOURNAL_HISTORY_ANDROID;
if (serial && !/^emulator-\d+$/.test(serial)) throw new Error('Use an owned emulator serial');
const server = serial ? null : await createServer({ server: { port: 0, fs: { allow: [process.cwd(), realpathSync('node_modules')] } }, plugins: [{ name: 'history-no-watch', configResolved(config) { config.server.watch = null; } }] });
await server?.listen();
const browser = serial ? await chromium.connectOverCDP(process.env.JOURNAL_HISTORY_CDP, { noDefaults: true }) : await launchChromium();
const page = serial ? browser.contexts()[0].pages()[0] : await browser.newPage({ viewport: { width: 390, height: 844 } });
page.setDefaultTimeout(30000);
const errors = [];
page.on('pageerror', error => errors.push(error.message));
async function follow(href) {
  await clientRoute(page, href);
  if (serial) await page.waitForFunction(href => document.querySelector('[data-retained-active]')?.getAttribute('data-retained-door') === href, href);
  await page.waitForFunction(() => !document.documentElement.dataset.nav);
}
async function month() {
  await page.waitForFunction(() => [...document.querySelectorAll('[data-cal-month-btn]')].filter(el => el.getClientRects().length).length === 1);
  return page.locator('[data-cal-month-btn]:visible').innerText();
}
async function stepBack() {
  if (serial) execFileSync('adb', ['-s', serial, 'shell', 'input', 'keyevent', 'KEYCODE_BACK']);
  else await page.goBack();
}
async function back() {
  await stepBack();
  await page.waitForURL(url => url.pathname === '/calendar');
  await page.waitForLoadState('networkidle');
  if (serial) await page.waitForSelector('[data-retained-door="/calendar"][data-retained-active]');
  await page.waitForSelector('[data-cal-month-btn]');
  await page.waitForFunction(() => !document.documentElement.dataset.nav);
}
try {
  if (serial) {
    // A fresh production APK uses the real setup and editor save paths.
    await reachAccessSetup(page, new URL(page.url()).origin);
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
    const days = await page.evaluate(() => Array.from({ length: 16 }, (_, index) => {
      const date = new Date();
      if (index === 15) {
        date.setDate(1);
        date.setMonth(date.getMonth() - 3);
      } else date.setDate(date.getDate() - index);
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    }));
    for (const day of days) {
      await clientRoute(page, `/entry/new/${day}?seedMood=3`);
      await continueToTheRest(page);
      await page.locator('#ed-note').fill(`Journal history fixture ${day}`);
      await page.waitForFunction(() => document.querySelectorAll('[data-save]').length === 1);
      await page.locator('[data-save]').press('Enter');
      await page.waitForURL(url => url.pathname === '/');
      await page.locator('#ed-note').waitFor({ state: 'detached' });
      await page.waitForFunction(() => !document.documentElement.dataset.nav);
    }
    console.log('PASS native fixture: 16 dated entries saved through the editor');
  } else {
    await page.goto(server.resolvedUrls.local[0]);
    await page.waitForSelector('[data-app-root][data-boot="ready"]', { timeout: 60000 });
    await untilSplashLets(page);
    const hideDemo = page.getByRole('button', { name: 'Hide this bar', exact: true });
    if (await hideDemo.isVisible()) await hideDemo.click();
    if (await page.locator('[data-leave-setup]').count()) {
      await page.locator('[data-leave-setup]').click();
      await page.waitForSelector('[data-home-hello]');
    }
  }
  await follow('/calendar');
  await page.waitForSelector('[data-entry-card]');
  assert.equal(await page.locator('[data-retained-door="/calendar"]').count(), serial ? 1 : 0, 'real Android retains Journal; web remounts it');
  const current = await month();
  for (let n = 0; n < 3; n++) {
    await page.locator('[data-cal-step="prev"]').click();
    await month();
  }
  const browsed = await month();
  assert.notEqual(browsed, current);
  await page.locator('[data-cal-open]').click();
  await page.locator('[data-cal-date]').first().waitFor();
  const day = page.locator('[data-cal-month-body] a[href^="/day/"]').first();
  await day.click();
  await page.waitForURL(url => url.pathname.startsWith('/day/'));
  await page.waitForSelector('[data-start-era]');
  await page.waitForFunction(() => !document.documentElement.dataset.nav);
  await back();
  assert.equal(await month(), browsed, 'Back restores the browsed month');
  console.log('PASS browsed month survives a day and Back');
  for (const count of [10, 15]) {
    await page.locator('[data-recent-days-more]').click();
    await page.waitForFunction(count => document.querySelectorAll('.cal-days [data-day-card]').length === count, count);
  }
  await page.waitForFunction(() => !document.getAnimations().some(a => a.playState === 'running' && a.effect?.getComputedTiming().iterations !== Infinity));
  await page.locator('[data-cal-month-btn]').focus();
  await follow('/calendar');
  await page.waitForFunction(() => document.activeElement?.matches('h1'));
  assert.equal(await month(), browsed, 'the already-lit Journal tab keeps this visit');
  await page.waitForFunction(() => document.querySelectorAll('.cal-days [data-day-card]').length === 15);
  console.log('PASS tapping the active Journal tab keeps month and expanded days');
  const entry = page.locator('.cal-days [data-entry-card]').last();
  await entry.scrollIntoViewIfNeeded();
  await page.waitForFunction(() => !document.getAnimations().some(a => a.playState === 'running' && a.effect?.getComputedTiming().iterations !== Infinity));
  const left = await page.locator('[data-app-scroll-region]').evaluate(el => el.scrollTop);
  assert.ok(left > 500);
  await entry.click();
  await page.waitForSelector('[data-save]');
  await page.waitForFunction(() => !document.documentElement.dataset.nav);
  await back();
  await page.waitForFunction(() => document.querySelectorAll('.cal-days [data-day-card]').length === 15);
  await page.waitForFunction(left => {
    const region = document.querySelector('[data-app-scroll-region]');
    return Math.abs(region.scrollTop - Math.min(left, region.scrollHeight - region.clientHeight)) <= 1;
  }, left);
  const returned = await page.locator('[data-app-scroll-region]').evaluate(el => el.scrollTop);
  assert.ok(returned > 500, 'the expanded list restores a reachable deep position');
  await entry.waitFor({ state: 'visible' });
  console.log(`PASS 15 recent days and reachable scroll ${left}px -> ${returned}px survive an entry and Back`);
  await follow('/more');
  await follow('/calendar');
  assert.equal(await month(), current, 'a fresh forward arrival resets the month');
  await page.waitForFunction(() => document.querySelectorAll('.cal-days [data-day-card]').length === 5);
  await page.locator('[data-cal-step="prev"]').click();
  const secondVisit = await month();
  assert.notEqual(secondVisit, browsed);
  await stepBack();
  await page.waitForURL(url => url.pathname === '/more');
  await page.waitForLoadState('networkidle');
  await page.locator('[data-hub-search]').waitFor();
  if (serial) await page.waitForSelector('[data-retained-door="/more"][data-retained-active]');
  await page.waitForFunction(() => !document.documentElement.dataset.nav);
  await back();
  assert.equal(await month(), browsed, 'the earlier Journal visit keeps its own month');
  await page.waitForFunction(() => document.querySelectorAll('.cal-days [data-day-card]').length === 15);
  console.log('PASS fresh forward reset and independent history visits');
  assert.deepEqual(errors, []);
} catch (error) {
  console.log(await page.locator('[data-app-scroll-region]').evaluate(el => ({ top: el.scrollTop, height: el.scrollHeight })), errors);
  throw error;
} finally {
  await browser.close();
  await server?.close();
}
