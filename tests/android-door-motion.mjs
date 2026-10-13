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

const retained = '[data-retained-door]';
const activeRetained = '[data-retained-active]';

async function settled() {
  await page.waitForTimeout(1200);
  const state = await page.evaluate(() => {
    const roots = [...document.querySelectorAll('[data-app-scroll-region] .screen')];
    const active = roots.filter((root) => root.getClientRects().length > 0);
    const fields = [...document.querySelectorAll('[data-app-scroll-region] [data-home-field], [data-app-scroll-region] [data-screen-field]')]
      .filter((field) => field.getClientRects().length > 0);
    const hidden = [...document.querySelectorAll('[data-retained-door]:not([data-retained-active])')];
    return {
      path: location.pathname, screens: active.length, title: active[0]?.querySelector('h1')?.textContent,
      activeDoors: document.querySelectorAll('[data-retained-active]').length,
      fields: fields.length, activeOwnsFields: fields.every((field) => active[0]?.contains(field)),
      hiddenSafe: hidden.every((door) => door.inert && getComputedStyle(door).display === 'none'),
      hiddenFocus: !!document.activeElement?.closest('[data-retained-door]:not([data-retained-active])'),
      hiddenAnimations: document.getAnimations().filter((animation) =>
        animation.playState === 'running' && animation.effect?.target instanceof Element &&
        animation.effect.target.closest('[data-retained-door]:not([data-retained-active])')).length
    };
  });
  assert.equal(state.screens, 1, JSON.stringify(state));
  assert.equal(state.fields, 1, 'settled route has more than one visible field');
  assert(state.activeOwnsFields, 'visible field belongs to inactive screen');
  assert.equal(state.activeDoors, ['/', '/calendar', '/stats', '/more'].includes(state.path) ? 1 : 0);
  assert(state.hiddenSafe, 'inactive door lost display:none or inert');
  assert(!state.hiddenFocus, 'inactive door owns focus');
  assert.equal(state.hiddenAnimations, 0, 'inactive door keeps running motion');
  return state;
}

async function door(tab) {
  await page.evaluate((tab) => document.querySelector(`[data-nav-item="${tab}"]`).click(), tab);
  return settled();
}

async function navigate(path) {
  await page.evaluate((path) => {
    const link = document.createElement('a');
    link.href = path;
    document.body.append(link);
    link.click();
    link.remove();
  }, path);
}

async function rememberDoor() {
  return page.evaluate(() => {
    window.__doorScreens ??= new Map();
    const root = document.querySelector('[data-retained-active] .screen');
    const prior = window.__doorScreens.get(location.pathname);
    window.__doorScreens.set(location.pathname, root);
    return { path: location.pathname, same: !prior || prior === root, count: window.__doorScreens.size };
  });
}

async function overlayReleased(label) {
  await page.waitForSelector('[role="dialog"]', { state: 'detached' });
  const ownership = await page.evaluate(async () => {
    const { dismissActiveOverlay } = await import('/src/lib/components/overlayLock.ts');
    const region = document.querySelector('[data-app-scroll-region]');
    return {
      owner: dismissActiveOverlay(), overflow: getComputedStyle(region).overflowY,
      inert: document.querySelector('[data-app-column]').inert,
      focusDetached: !document.activeElement?.isConnected,
      focusHidden: !!document.activeElement?.closest('[data-retained-door]:not([data-retained-active])')
    };
  });
  results.push({ label, ownership });
  assert(!ownership.owner, `${label}: departed sheet still owns Back`);
  assert.notEqual(ownership.overflow, 'hidden', `${label}: departed sheet still owns scroll lock`);
  assert(!ownership.inert, `${label}: departed sheet leaves main inert`);
  assert(!ownership.focusDetached && !ownership.focusHidden, `${label}: departed sheet keeps focus ownership`);
}

async function home() {
  await door('home');
  await page.waitForSelector(`${activeRetained} [data-home-hello]`);
}

async function interruptDeparture(action) {
  return page.evaluate(async (action) => {
    const alpha = () => {
      let value = 1;
      let element = document.querySelector('[data-retained-active] [data-home-hello]');
      if (!element) return null;
      for (; element; element = element.parentElement) value *= Number(getComputedStyle(element).opacity);
      return value;
    };
    document.querySelector('[data-nav-item="calendar"]').click();
    const deadline = performance.now() + 3000;
    while (alpha() >= 0.8 && performance.now() < deadline) await new Promise(requestAnimationFrame);
    const before = alpha();
    if (before === null || before <= 0 || before >= 0.8) throw Error('departure not sampled');
    let firstGate = null;
    let gateObserver;
    if (action === 'door') document.querySelector('[data-nav-item="stats"]').click();
    else if (action === 'deep') document.querySelector('[data-home-gear]').click();
    else {
      const { bootState } = await import('/src/lib/stores/boot.svelte.ts');
      const { lockState } = await import('/src/lib/stores/lock.svelte.ts');
      if (bootState.accessMode !== 'passphrase') throw Error('fixture has no configured passphrase lock');
      gateObserver = new MutationObserver(() => {
        if (!document.querySelector('#session-passphrase')) return;
        firstGate = {
          retained: document.querySelectorAll('[data-retained-door]').length,
          journalScreens: document.querySelectorAll('[data-app-scroll-region] .screen:not([data-gate-frame])').length
        };
        gateObserver.disconnect();
      });
      gateObserver.observe(document.querySelector('[data-app-scroll-region]'), { childList: true, subtree: true });
      lockState.unlocked = false;
    }
    const samples = [];
    for (let i = 0; i < 24; i++) {
      await new Promise(requestAnimationFrame);
      samples.push({
        at: performance.now(), opacity: alpha(), path: location.pathname,
        gate: !!document.querySelector('#session-passphrase'),
        screens: [...document.querySelectorAll('[data-app-scroll-region] .screen')]
          .filter((element) => element.getClientRects().length > 0).map((element) => ({
          title: element.querySelector('h1')?.textContent,
          home: !!element.querySelector('[data-home-header]')
        }))
      });
    }
    gateObserver?.disconnect();
    return { action, before, samples, firstGate };
  }, action);
}

try {
  await page.goto(server.resolvedUrls.local[0]);
  await page.waitForSelector('[data-app-root][data-boot="ready"]', { timeout: 60000 });
  await page.waitForTimeout(1500);
  await page.evaluate(() => { window.__initialDoor = document.querySelector('[data-home-header]').closest('.screen'); });
  const loadedHost = page.waitForResponse((response) => response.url().includes('/src/lib/navigation/RetainedDoors.svelte'));
  await page.evaluate(async () => {
    window.Capacitor.getPlatform = () => 'android';
    document.querySelector('.demo-bar')?.style.setProperty('display', 'none');
    const { ui } = await import('/src/lib/stores/ui.svelte.ts');
    ui.tabMoving = true;
    await new Promise(requestAnimationFrame);
    ui.tabMoving = false;
  });
  await loadedHost;
  await page.waitForTimeout(500);
  assert(await page.evaluate(() => window.__initialDoor === document.querySelector('[data-home-header]').closest('.screen')),
    'idle preload remounted initial page');
  assert.equal(await page.locator(retained).count(), 0, 'idle preload activated retention before navigation');
  for (const tab of ['calendar', 'stats', 'settings', 'home']) {
    results.push(await door(tab));
    const identity = await rememberDoor();
    results.push(identity);
    assert(identity.same, 'first visit replaced cached screen');
  }
  assert.equal(await page.locator(retained).count(), 4, 'four doors were not retained');
  for (const tab of ['calendar', 'stats', 'settings', 'home']) {
    await door(tab);
    const identity = await rememberDoor();
    results.push(identity);
    assert(identity.same, `${identity.path}: warm revisit replaced cached screen`);
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
      [...document.querySelectorAll('[data-app-scroll-region] .screen')]
        .find((root) => root.getClientRects().length > 0)?.querySelector('h1')?.textContent === title, title);
    await settled();
    assert.equal(await page.locator(`${activeRetained} [data-home-hello]`).count(), 0);
    await page.goBack();
    const returned = await settled();
    assert.equal(returned.screens, 1);
    assert.equal(returned.title, returned.path === '/' ? 'engender' : 'Calendar');
    results.push({ returned });
  }
  await home();
  /* Home's own arrival ran with normal motion; its entrances finish before
     motion is reduced, or one still running would be counted below. */
  await page.waitForFunction(() => document.getAnimations().every((animation) =>
    animation.playState !== 'running' || animation.effect?.getComputedTiming().endTime === Infinity));
  await page.evaluate(() => { document.documentElement.dataset.a11yMotion = 'reduce'; });
  await page.evaluate(() => document.querySelector('[data-nav-item="calendar"]').click());
  await page.waitForFunction(() =>
    document.querySelector('[data-retained-active] h1')?.textContent === 'Calendar');
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
  await navigate('/?quickLogDims=1');
  await page.waitForSelector('[data-quick-log-dims]');
  await page.waitForTimeout(600);
  await door('calendar');
  await overlayReleased('Home');
  await page.locator(`${activeRetained} [data-cal-month-btn]`).click();
  await page.waitForSelector('[role="dialog"]');
  await page.waitForTimeout(600);
  await door('stats');
  await overlayReleased('Calendar');
  await home();
  assert.equal(await page.locator('[data-quick-log-dims]').count(), 0, 'Home revisit restored departed prompt');
  const homeFolds = [];
  for (const selector of ['[data-home-agenda-fold]', '[data-home-tiles-fold]']) {
    const fold = page.locator(`${activeRetained} ${selector}`);
    if (await fold.count()) {
      await fold.click();
      assert.equal(await fold.getAttribute('aria-expanded'), 'true');
      homeFolds.push(selector);
    }
  }
  await page.locator(`${activeRetained} [data-edit-today]`).click();
  await page.waitForSelector(`${activeRetained} [data-today-editor]`);
  await page.locator(`${activeRetained} [data-edit-done]`).click();
  await page.waitForSelector(`${activeRetained} [data-home-editing]`, { state: 'detached' });
  await page.locator(`${activeRetained} [data-edit-today]`).click();
  await page.waitForSelector(`${activeRetained} [data-today-editor]`);
  await door('stats');
  await home();
  assert.equal(await page.locator('[data-home-editing]').count(), 0, 'Home revisit restored editor');
  for (const selector of homeFolds) {
    assert.equal(await page.locator(`${activeRetained} ${selector}`).getAttribute('aria-expanded'), 'false',
      'Home revisit restored expanded fold');
  }
  results.push({ homeFoldsChecked: homeFolds });

  await door('calendar');
  const currentMonth = await page.locator(`${activeRetained} [data-cal-month-btn]`).textContent();
  await page.locator(`${activeRetained} [data-cal-step="prev"]`).click();
  await page.locator(`${activeRetained} [data-cal-open]`).click();
  await page.waitForTimeout(400);
  await door('settings');
  await page.locator(`${activeRetained} [data-hub-search]`).fill('voice');
  await door('calendar');
  assert.equal(await page.locator(`${activeRetained} [data-cal-month-btn]`).textContent(), currentMonth,
    'Calendar revisit kept previous month');
  assert.equal(await page.locator(`${activeRetained} [data-cal-open]`).getAttribute('aria-expanded'), 'false',
    'Calendar revisit kept month expanded');
  await page.locator(`${activeRetained} [data-cal-open]`).click();
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    document.querySelector('[data-retained-active] [data-cal-open]').click();
    document.documentElement.dataset.a11yMotion = 'reduce';
    document.querySelector('[data-nav-item="settings"]').click();
  });
  await page.waitForSelector('[data-retained-active][data-retained-door="/more"]');
  await page.evaluate(() => document.querySelector('[data-nav-item="calendar"]').click());
  await settled();
  await page.evaluate(() => { delete document.documentElement.dataset.a11yMotion; });
  assert.equal(await page.locator(`${activeRetained} [data-cal-open]`).getAttribute('aria-expanded'), 'false',
    'Calendar departing fold toggled returned visit');
  await door('settings');
  assert.equal(await page.locator(`${activeRetained} [data-hub-search]`).inputValue(), '', 'More revisit kept search');

  const clock = await page.evaluate(() => {
    const RealDate = Date;
    const now = new RealDate();
    const monthEnd = new RealDate(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).getTime();
    const nextMonth = new RealDate(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 1).getTime();
    window.__calendarNow = monthEnd;
    window.__restoreCalendarDate = () => { window.Date = RealDate; };
    window.Date = class extends RealDate {
      constructor(...args) { super(...(args.length ? args : [window.__calendarNow])); }
      static now() { return window.__calendarNow; }
    };
    const label = (timestamp) => new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric' })
      .format(new RealDate(timestamp));
    return { monthEnd, nextMonth, beforeLabel: label(monthEnd), afterLabel: label(nextMonth) };
  });
  try {
    await door('calendar');
    assert.equal(await page.locator(`${activeRetained} [data-cal-month-btn]`).textContent(), clock.beforeLabel);
    assert.equal(await page.locator(`${activeRetained} .cal-days > [data-day-card]`).count(), 5);
    await page.locator(`${activeRetained} [data-recent-days-more]`).click();
    await page.waitForFunction(() =>
      document.querySelectorAll('[data-retained-active] .cal-days > [data-day-card]').length > 5);
    await page.locator(`${activeRetained} [data-cal-open]`).click();
    const presentation = page.locator(`${activeRetained} [data-presentation-highlight]`).first();
    await presentation.click();
    assert.equal(await presentation.getAttribute('aria-pressed'), 'true');
    await door('settings');
    await page.evaluate((timestamp) => { window.__calendarNow = timestamp; }, clock.nextMonth);
    await page.evaluate(() => document.querySelector('[data-nav-item="calendar"]').click());
    await page.waitForFunction((label) =>
      document.querySelector('[data-retained-active] [data-cal-month-btn]')?.textContent === label, clock.afterLabel);
    await page.evaluate(() => window.__restoreCalendarDate());
    await settled();
    assert.equal(await page.locator(`${activeRetained} [data-cal-month-btn]`).textContent(), clock.afterLabel,
      'hidden Calendar revisit kept previous month across midnight');
    assert.equal(await page.locator(`${activeRetained} [data-cal-open]`).getAttribute('aria-expanded'), 'false');
    assert.equal(await page.locator(`${activeRetained} .cal-days > [data-day-card]`).count(), 5,
      'hidden Calendar revisit kept expanded recent-day cap');
    assert.equal(await page.locator(`${activeRetained} [data-hm-cell-highlight]`).count(), 0);
    await page.locator(`${activeRetained} [data-cal-open]`).click();
    await page.waitForSelector(`${activeRetained} [data-presentation-highlight]`);
    assert.equal(await page.locator(`${activeRetained} [data-presentation-highlight][aria-pressed="true"]`).count(), 0,
      'hidden Calendar revisit kept selected presentation');
    results.push({ calendarMonthEnd: clock, recentDaysAfterReturn: 5, highlightCleared: true });
  } finally {
    await page.evaluate(() => window.__restoreCalendarDate?.());
  }

  await door('stats');
  const start = page.locator(`${activeRetained} [data-span-handle="start"]`);
  const beforeSpan = await start.getAttribute('aria-valuenow');
  await start.press('ArrowRight');
  await page.waitForTimeout(600);
  const rememberedSpan = await page.locator(`${activeRetained} [data-span-timeline]`).evaluate((rail) =>
    [rail.dataset.spanStart, rail.dataset.spanEnd]);
  assert.notEqual(rememberedSpan[0], beforeSpan, 'span selection did not change');
  const facts = page.locator(`${activeRetained} [data-span-facts-toggle]`);
  await facts.click();
  assert.equal(await facts.getAttribute('aria-expanded'), 'true');
  await home();
  await door('stats');
  assert.equal(await page.locator(`${activeRetained} [data-span-facts-toggle]`).getAttribute('aria-expanded'), 'false',
    'Look back revisit kept facts disclosed');
  assert.deepEqual(await page.locator(`${activeRetained} [data-span-timeline]`).evaluate((rail) =>
    [rail.dataset.spanStart, rail.dataset.spanEnd]), rememberedSpan, 'Look back revisit forgot selected span');
  // A key move still waiting for its 300 ms commit survives leaving the door.
  await page.evaluate(() => {
    const handle = document.querySelector('[data-retained-active] [data-span-handle="start"]');
    handle.focus();
    handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
    document.querySelector('[data-nav-item="home"]').click();
  });
  await settled();
  await door('stats');
  const keyedSpan = await page.locator(`${activeRetained} [data-span-timeline]`).evaluate((rail) =>
    [rail.dataset.spanStart, rail.dataset.spanEnd]);
  assert.notDeepEqual(keyedSpan, rememberedSpan, 'a key move made just before leaving Look back was lost');
  results.push({ keyedSpanOnLeave: keyedSpan });

  await page.evaluate(async () => {
    const { browserSession } = await import('/src/lib/stores/boot.svelte.ts');
    browserSession.recovering = true;
  });
  await page.waitForTimeout(500);
  assert.equal(await page.locator(retained).count(), 0, 'recovery kept cached doors');
  assert.equal(await page.locator('[data-app-scroll-region] .screen').count(), 0,
    'recovery mounted ordinary route behind hidden main');
  await page.evaluate(async () => {
    const { browserSession } = await import('/src/lib/stores/boot.svelte.ts');
    browserSession.recovering = false;
  });
  await settled();
  assert.equal(await page.locator(retained).count(), 1, 'recovery recreated previously visited doors');
  for (const tab of ['calendar', 'stats', 'home']) await door(tab);
  await home();
  const rapidUnlock = await page.evaluate(async () => {
    const { lockState, markUnlocked } = await import('/src/lib/stores/lock.svelte.ts');
    const before = document.querySelector('[data-retained-active] .screen');
    lockState.unlocked = false;
    await new Promise(requestAnimationFrame);
    const gate = {
      present: !!document.querySelector('#session-passphrase'),
      retained: document.querySelectorAll('[data-retained-door]').length,
      journalScreens: document.querySelectorAll('[data-app-scroll-region] .screen:not([data-gate-frame])').length
    };
    markUnlocked();
    await new Promise(requestAnimationFrame);
    const returned = document.querySelector('[data-retained-active] .screen');
    return { gate, returned: !!returned, reused: before === returned };
  });
  results.push({ rapidUnlock });
  assert.deepEqual(rapidUnlock.gate, { present: true, retained: 0, journalScreens: 0 },
    'one-frame lock kept retained journal DOM');
  assert(rapidUnlock.returned, 'rapid unlock failed to mount current door');
  assert(!rapidUnlock.reused, 'rapid unlock resumed detached cached screen');
  await page.waitForSelector(`${activeRetained} [data-home-hello]`);
  await settled();
  assert.equal(await page.locator(retained).count(), 1, 'rapid unlock restored other cached doors');
  for (const tab of ['calendar', 'stats', 'home']) await door(tab);
  const gateExit = await interruptDeparture('gate');
  results.push(gateExit);
  await page.waitForSelector('#session-passphrase');
  assert.deepEqual(gateExit.firstGate, { retained: 0, journalScreens: 0 },
    'first gate DOM kept retained doors or journal screens during outros');
  assert.equal(await page.locator(retained).count(), 0, 'first visible gate kept cached doors');
  assert.equal(await page.locator('[data-app-scroll-region] .screen:not([data-gate-frame])').count(), 0,
    'first visible gate kept journal screens');
  await page.waitForTimeout(1000);
  assert.equal(await page.locator('[data-home-hello], [data-home-header]').count(), 0);
  assert.equal(await page.locator(retained).count(), 0, 'lock kept cached doors');
  assert.equal(await page.locator('[data-app-scroll-region] .screen:not([data-gate-frame])').count(), 0,
    'lock kept journal screens');
  await page.screenshot({ path: `${out}/gate-during-exit.png` });
  await page.locator('#session-passphrase').fill('demo');
  await page.locator('[data-session-submit]').click();
  await page.waitForSelector(activeRetained);
  await settled();
  assert.equal(await page.locator(retained).count(), 1, 'unlock recreated previously visited doors');

  await home();
  const saving = await page.evaluate(async () => {
    const { journal } = await import('/src/lib/data/live/journal.svelte.ts');
    const { vocabulary } = await import('/src/lib/data/vocabulary/vocabulary.ts');
    const { getActiveDriver } = await import('/src/lib/stores/journal-ports.ts');
    const rows = await journal.entries.recentDays(2);
    const [entry, nextEntry] = rows;
    if (!entry || !nextEntry || entry.id === nextEntry.id) throw Error('save fixture needs two existing entries');
    const dimension = vocabulary.activeDimensions[0];
    if (!dimension) throw Error('save fixture needs active scale');
    const value = entry.dims[dimension.key] === dimension.min ? dimension.max : dimension.min;
    const driver = getActiveDriver();
    if (!driver) throw Error('save fixture has no installed database driver');
    const transaction = driver.transaction;
    let release;
    const held = new Promise((resolve) => { release = resolve; });
    const state = window.__heldDimsWrite = {
      entered: false, committed: false, release,
      restore: () => { driver.transaction = transaction; }
    };
    driver.transaction = async (work) => {
      let holdsWrite = false;
      const answer = await transaction.call(driver, (scope) => work(new Proxy(scope, {
        get(target, property) {
          if (property === 'run') return async (sql, params) => {
            if (!state.entered && sql.includes('INSERT INTO entry_dimension_value') && params?.[0] === entry.id) {
              holdsWrite = true;
              state.entered = true;
              await held;
            }
            return target.run(sql, params);
          };
          const implementation = Reflect.get(target, property);
          return typeof implementation === 'function' ? implementation.bind(target) : implementation;
        }
      })));
      if (holdsWrite) state.committed = true;
      return answer;
    };
    return { id: entry.id, nextId: nextEntry.id, key: dimension.key, value, nextDims: nextEntry.dims };
  });
  try {
    await navigate(`/?quickLogDims=${saving.id}`);
    await page.waitForSelector('[data-quick-log-dims]');
    await page.locator(`[data-qld-input="${saving.key}"]`).fill(String(saving.value));
    await page.locator('[data-qld-add]').click();
    await page.waitForFunction(() => window.__heldDimsWrite.entered);
    assert(await page.locator('[data-qld-add]').isDisabled(), 'dimensions write did not remain pending');
    await door('stats');
    await navigate(`/?quickLogDims=${saving.nextId}`);
    await page.waitForSelector('[data-retained-active][data-retained-door="/"]');
    await page.waitForSelector('[data-quick-log-dims]');
    await page.evaluate(() => window.__heldDimsWrite.release());
    await page.waitForFunction(() => window.__heldDimsWrite.committed);
    await page.waitForFunction(() => !document.querySelector('[data-qld-add]')?.disabled);
    assert.equal(await page.locator('[data-quick-log-dims]').count(), 1,
      'departed dimensions write closed new visit prompt');
    const committed = await page.evaluate(async ({ id, nextId, key }) => {
      const { journal } = await import('/src/lib/data/live/journal.svelte.ts');
      const entry = await journal.entries.getEntry(id);
      const nextEntry = await journal.entries.getEntry(nextId);
      return { value: entry.dims[key], nextDims: nextEntry.dims };
    }, saving);
    assert.equal(committed.value, saving.value, 'departed dimensions write failed to commit');
    assert.deepEqual(committed.nextDims, saving.nextDims, 'departed dimensions write changed new prompt entry');
    await page.locator('[data-qld-skip]').click();
  } finally {
    await page.evaluate(() => {
      window.__heldDimsWrite?.release();
      window.__heldDimsWrite?.restore();
    });
  }
  await page.reload();
  await page.waitForSelector('[data-app-root][data-boot="ready"]', { timeout: 60000 });
  const durableValue = await page.evaluate(async ({ id, key }) => {
    const { journal } = await import('/src/lib/data/live/journal.svelte.ts');
    return (await journal.entries.getEntry(id)).dims[key];
  }, saving);
  assert.equal(durableValue, saving.value, 'departed dimensions save was lost after reload');
  results.push({ departedDimensionsSave: saving, durableValue });
  assert.equal(errors.length, 0, errors.join('\n'));
  console.log('PASS idle preload identity, cached revisits, rapid door/deep, Back, reduced motion, departed sheets, revisit resets, key move on leave, month-end revisit, recovery, configured passphrase gate/unlock, departed dimensions save durability');
} finally {
  await writeFile(`${out}/lifecycle.json`, JSON.stringify({ results, errors }, null, 2));
  await browser.close();
  await server.close();
}
