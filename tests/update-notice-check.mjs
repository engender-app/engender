/* Last-audit UI ticket 21 (audit U12, U31): the waiting-update notice keeps
   its place and its dismissal.

   The notice was a direct child of `.app`, which is a row at desktop width,
   so a waiting release drew it as a third column between the rail and the
   content and squeezed the screen. And its dismissal lived in the component,
   which the layout unmounts at every lock, so unlocking brought back a
   notice the person had already closed for this page.

   Drives the production update module (src/lib/pwa/update.ts) with a
   registration whose waiting worker is put there by hand, the way
   tests/browser-tier/update-probe.ts does: the dev server registers no
   service worker. Measures the rail, the column and the notice at 390, 1024
   and 1280, samples every animation frame while the notice arrives and
   leaves, dismisses, locks and unlocks, applies the update through the real
   handover, and reloads to confirm a fresh page offers it again. */
import assert from 'node:assert/strict';
import { realpathSync } from 'node:fs';
import { createServer } from 'vite';
import { launchChromium, untilSplashLets } from './browser-harness.mjs';

const server = await createServer({
  cacheDir: '.svelte-kit/update-notice-vite',
  server: { port: 0, fs: { allow: [process.cwd(), realpathSync('node_modules')] } },
  plugins: [{ name: 'update-notice-no-watch', configResolved(config) { config.server.watch = null; } }]
});
await server.listen();
const browser = await launchChromium();
const context = await browser.newContext({ viewport: { width: 1024, height: 768 }, locale: 'en-GB' });
const page = await context.newPage();
page.setDefaultTimeout(30000);
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
let checks = 0;
const failures = [];
/* Records and carries on, so a run on the unfixed tree reports every
   criterion it misses rather than only the first. */
function ok(value, message) { checks++; console.log(`${value ? 'PASS' : 'FAIL'} ${message}`); if (!value) failures.push(message); }

const notice = page.locator('[data-update-notice]');
const settled = () => page.waitForFunction(() => !document.documentElement.dataset.nav &&
  document.getAnimations().every((a) => a.playState !== 'running' || a.effect?.getComputedTiming().iterations === Infinity));

/** Puts a fake registration under the real update module. `arrive` puts a
    worker in `waiting` the way the browser does when a release installs
    behind the running one; the page records what was posted to it and
    whether the handover reloaded. */
const watch = () => page.evaluate(async () => {
  const { watchForUpdates } = await import('/src/lib/pwa/update.ts');
  const listeners = [];
  const controller = [];
  window.updatePosted = [];
  window.updateReloads = 0;
  const registration = {
    active: {},
    waiting: null,
    installing: null,
    async update() {},
    addEventListener(_type, listener) { listeners.push(listener); }
  };
  window.releaseArrives = () => {
    registration.waiting = { postMessage(message) { window.updatePosted.push(message); for (const l of controller) l(); } };
    for (const listener of listeners) listener();
  };
  watchForUpdates(registration, {
    onControllerChange(listener) { controller.push(listener); return () => controller.splice(controller.indexOf(listener), 1); },
    reload() { window.updateReloads++; }
  });
});

/** The rail, the column, the scroll region and the notice, in CSS px. */
const layout = () => page.evaluate(() => {
  const box = (selector) => {
    const node = document.querySelector(selector);
    if (!node) return null;
    const r = node.getBoundingClientRect();
    return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
  };
  const rail = document.querySelector('[data-app-rail]');
  return {
    frame: box('[data-app-root]'),
    rail: rail && getComputedStyle(rail).display !== 'none' ? box('[data-app-rail]') : null,
    column: box('[data-app-column]'),
    scroll: box('[data-app-scroll-region]'),
    screen: box('[data-app-scroll-region] .screen'),
    notice: box('[data-update-notice]'),
    inColumn: !!document.querySelector('[data-app-column] [data-update-notice]')
  };
});
const near = (a, b, tolerance = 0.5) => Math.abs(a - b) <= tolerance;

/* Every animation frame: how much of the notice's band is painted (its box
   less the clip covering it from the top) and its opacity, and where the
   scroll region stands. */
const startSampling = () => page.evaluate(() => {
  window.noticeFrames = [];
  window.noticeSampling = true;
  const tick = (now) => {
    // The band is what arrives (UpdateNotice.svelte); the unfixed tree had only the notice.
    const node = document.querySelector('[data-update-band]') ?? document.querySelector('[data-update-notice]');
    const region = document.querySelector('[data-app-scroll-region]').getBoundingClientRect();
    let painted = null;
    if (node) {
      const style = getComputedStyle(node);
      const r = node.getBoundingClientRect();
      const clipTop = Number(/inset\(([\d.]+)px/.exec(style.clipPath)?.[1] ?? 0);
      painted = { height: Math.max(0, r.height - clipTop), opacity: Number(style.opacity), top: r.top + clipTop };
    }
    window.noticeFrames.push({ now, painted, regionTop: region.top, regionLeft: region.left, regionWidth: region.width });
    if (window.noticeSampling) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});
const stopSampling = () => page.evaluate(() => { window.noticeSampling = false; return window.noticeFrames; });
const steps = (values) => values.slice(1).map((v, i) => Math.abs(v - values[i]));

/** Lock the way the lock timing does when the page is hidden, then unlock
    with the demo passphrase. */
async function lockAndUnlock() {
  await page.evaluate(async () => {
    const { prefs } = await import('/src/lib/data/prefs/store.svelte.ts');
    prefs.lockAfter = 'immediately';
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    delete document.visibilityState;
  });
  await page.locator('[data-applock]').waitFor();
  ok(await notice.count() === 0, 'the lock screen draws no update notice');
  await page.evaluate(() => {
    window.updateSpoken = 0;
    new MutationObserver(() => {
      if (document.querySelector('[data-announce]')?.textContent.includes('A new version is ready')) window.updateSpoken++;
    }).observe(document.body, { subtree: true, childList: true, characterData: true });
  });
  await page.locator('#session-passphrase').fill('demo');
  await page.locator('[data-session-submit]').click();
  await page.locator('[data-applock]').waitFor({ state: 'detached' });
  await page.waitForSelector('[data-nav-item="home"], [data-rail-item="home"]');
  /* The layout loads the notice behind a dynamic import; once the module is
     in and two frames have passed, a notice that is coming is on screen. */
  await page.evaluate(async () => {
    await import('/src/lib/components/UpdateNotice.svelte');
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  });
  await page.waitForTimeout(300); // The announcer's 100ms write, observed past.
}

try {
  await page.goto(server.resolvedUrls.local[0]);
  await page.waitForSelector('[data-app-root][data-boot="ready"]', { timeout: 90000 });
  await untilSplashLets(page);
  if (await page.locator('[data-leave-setup]').count()) await page.locator('[data-leave-setup]').click();
  const hide = page.getByRole('button', { name: 'Hide this bar', exact: true });
  if (await hide.isVisible()) await hide.click();
  await settled();

  // Desktop container width: the column keeps its place beside the rail.
  const quiet = await layout();
  ok(quiet.rail && near(quiet.column.left, quiet.rail.right), `1024px without an update: the column starts at the rail (${quiet.column.left} vs ${quiet.rail?.right})`);

  await watch();
  await startSampling();
  await page.evaluate(() => window.releaseArrives());
  await notice.waitFor();
  await page.waitForTimeout(600);
  let frames = await stopSampling();
  await settled();

  for (const width of [1024, 1280]) {
    await page.setViewportSize({ width, height: 768 });
    await settled();
    const shown = await layout();
    ok(shown.inColumn, `${width}px: the notice is part of the content column`);
    ok(near(shown.rail.left, shown.frame.left) && near(shown.rail.width, quiet.rail.width) &&
      near(shown.column.left, shown.rail.right) && near(shown.column.right, shown.frame.right),
      `${width}px: rail ${shown.rail.left}-${shown.rail.right} and column ${shown.column.left}-${shown.column.right} keep their places with an update waiting`);
    ok(near(shown.scroll.width, shown.frame.width - quiet.rail.width),
      `${width}px: the scroll region keeps everything beside the rail (${shown.scroll.width}px of ${shown.frame.width - quiet.rail.width})`);
    ok(shown.notice.bottom <= shown.scroll.top + 0.5 && shown.notice.top >= shown.column.top,
      `${width}px: the notice is a band above the screen (${shown.notice.top}-${shown.notice.bottom}, screen from ${shown.scroll.top})`);
    ok(shown.screen && near(shown.notice.left, shown.screen.left + 20, 1) && near(shown.notice.right, shown.screen.right - 20, 1),
      `${width}px: the notice lines up with the screen's content (${shown.notice.left}-${shown.notice.right})`);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await settled();
  const phone = await layout();
  ok(!phone.rail && near(phone.column.left, 0) && near(phone.column.width, phone.frame.width) && phone.notice.bottom <= phone.scroll.top + 0.5,
    `390px: the notice stays above the screen at the column's full width (${phone.notice.left}-${phone.notice.right})`);
  await page.setViewportSize({ width: 1024, height: 768 });
  await settled();

  /* A navigation while the notice is up. It has its own view-transition
     group, so the screens cross under it while it shows the same picture
     throughout rather than fading and scaling with the screen's snapshot. */
  await page.evaluate(() => {
    window.vtFrames = [];
    window.vtSampling = true;
    const tick = () => {
      const pseudos = document.getAnimations().map((a) => a.effect?.pseudoElement ?? '');
      const node = document.querySelector('[data-update-notice]');
      window.vtFrames.push({
        crossing: pseudos.some((p) => p.includes('(screen)')),
        ownGroup: pseudos.some((p) => p === '::view-transition-group(update-notice)'),
        noticeAnimations: pseudos.filter((p) => /(old|new)\(update-notice\)/.test(p)).length,
        opacity: Number(getComputedStyle(document.documentElement, '::view-transition-new(update-notice)').opacity),
        top: node?.getBoundingClientRect().top ?? null
      });
      if (window.vtSampling) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await page.locator('[data-rail-item="calendar"]').click();
  await page.waitForURL(/\/calendar/);
  await settled();
  const crossing = (await page.evaluate(() => { window.vtSampling = false; return window.vtFrames; })).filter((f) => f.crossing);
  ok(crossing.length > 3 && crossing.some((f) => f.ownGroup) && crossing.every((f) => f.noticeAnimations === 0 && f.opacity === 1 && f.top !== null && near(f.top, crossing[0].top)),
    `a navigation crosses the screens under the notice for ${crossing.length} frames while it holds still at full opacity`);
  await page.locator('[data-rail-item="home"]').click();
  await page.waitForURL((url) => url.pathname === '/');
  await settled();

  // The arrival: nothing painted at full size in its first frame, and the screen moves down rather than sideways.
  const arrived = frames.filter((f) => f.painted);
  const finalHeight = arrived.at(-1)?.painted.height ?? 0;
  ok(arrived.length > 5 && arrived[0].painted.height < finalHeight * 0.25,
    `the notice opens over ${arrived.length} frames (first painted ${arrived[0]?.painted.height.toFixed(1)} of ${finalHeight.toFixed(1)}px)`);
  const tops = frames.map((f) => f.regionTop);
  const lefts = frames.map((f) => f.regionLeft);
  ok(Math.max(...steps(lefts)) < 0.5 && Math.max(...steps(frames.map((f) => f.regionWidth))) < 0.5,
    `the screen never moves sideways while the notice arrives (largest step ${Math.max(...steps(lefts)).toFixed(1)}px)`);
  const travel = tops.at(-1) - tops[0];
  const moving = steps(tops).filter((s) => s > 0.5);
  console.log('arrival', frames.map((f) => `${f.now.toFixed(0)}:${f.regionTop.toFixed(1)}`).join(' '));
  ok(travel > 40 && moving.length >= 10 && Math.max(...moving) <= travel / 4,
    `the screen travels ${travel.toFixed(1)}px down over ${moving.length} frames, largest step ${Math.max(...moving).toFixed(1)}px`);
  ok(await page.locator('[data-announce]').textContent() === 'A new version is ready', 'the arriving notice is announced through the standing live region');

  // Dismiss: it leaves over several frames and the screen comes back up.
  await startSampling();
  await notice.getByRole('button', { name: 'Dismiss' }).click();
  await notice.waitFor({ state: 'detached' });
  await page.waitForTimeout(100);
  frames = await stopSampling();
  const leaving = frames.filter((f) => f.painted);
  const upTops = frames.map((f) => f.regionTop);
  const back = upTops[0] - upTops.at(-1);
  const rising = steps(upTops).filter((s) => s > 0.5);
  console.log('dismissal', frames.map((f) => `${f.now.toFixed(0)}:${f.regionTop.toFixed(1)}`).join(' '));
  ok(back > 40 && rising.length >= 10 && Math.max(...rising) <= back / 4 && near(upTops.at(-1), quiet.scroll.top),
    `the dismissed notice gives its ${back.toFixed(1)}px back over ${rising.length} frames, largest step ${Math.max(...rising).toFixed(1)}px`);

  // Lock and unlock: the same page keeps the dismissal, and says nothing about it.
  await lockAndUnlock();
  ok(await notice.count() === 0, 'after lock and unlock the dismissed notice stays dismissed');
  ok(await page.evaluate(() => window.updateSpoken) === 0, 'and the unlocked page does not announce it again');
  ok(await page.evaluate(async () => (await import('/src/lib/pwa/update.ts')).updateReady()), 'the release is still waiting behind the dismissal');

  // A fresh page offers it again (the existing policy: dismissal is for this load).
  await page.reload();
  await page.waitForSelector('[data-app-root][data-boot="ready"]', { timeout: 90000 });
  await untilSplashLets(page);
  if (await page.locator('[data-applock]').count()) {
    await page.locator('#session-passphrase').fill('demo');
    await page.locator('[data-session-submit]').click();
    await page.locator('[data-applock]').waitFor({ state: 'detached' });
  }
  await settled();
  await watch();
  await page.evaluate(() => window.releaseArrives());
  await notice.waitFor();
  ok(true, 'a fresh page offers the waiting release again');

  // Lock with the notice open: unlocking brings it back, and Update now still hands over.
  await lockAndUnlock();
  await notice.waitFor();
  ok(await page.evaluate(() => window.updateSpoken) >= 1, 'an undismissed notice is back after unlock and announced');
  await notice.locator('[data-update-apply]').click();
  await page.waitForFunction(() => window.updateReloads === 1);
  ok(await page.evaluate(() => window.updatePosted.length === 1 && window.updatePosted[0] === 'engender:skip-waiting'),
    'Update now asks the waiting worker to take over and reloads once the journal hands over');

  // Reduced motion: the existing cut, at the same place.
  await page.reload();
  await page.waitForSelector('[data-app-root][data-boot="ready"]', { timeout: 90000 });
  await untilSplashLets(page);
  if (await page.locator('[data-applock]').count()) {
    await page.locator('#session-passphrase').fill('demo');
    await page.locator('[data-session-submit]').click();
    await page.locator('[data-applock]').waitFor({ state: 'detached' });
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForFunction(() => document.documentElement.dataset.a11yMotion === 'reduce');
  await settled();
  await watch();
  await startSampling();
  await page.evaluate(() => window.releaseArrives());
  await notice.waitFor();
  await page.waitForTimeout(200);
  frames = await stopSampling();
  const cut = frames.filter((f) => f.painted);
  ok(cut.length > 0 && cut.every((f) => near(f.painted.height, cut.at(-1).painted.height)), 'reduced motion: the notice is cut in at its resting size');
  const reduced = await layout();
  ok(reduced.inColumn && near(reduced.column.left, reduced.rail.right), 'reduced motion: the same band above the content');

  ok(errors.length === 0, `no uncaught page errors${errors.length ? `: ${errors.join('; ')}` : ''}`);
  assert.deepEqual(failures, [], 'every update notice check passed');
  assert.equal(checks, 29, 'all update notice checks ran');
  console.log(`Update notice passed: ${checks} checks`);
} finally {
  await context.close();
  await browser.close();
  await server.close();
}
