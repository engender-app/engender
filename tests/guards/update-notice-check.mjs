/* Inject a waiting worker into the real update module because the
   dev server registers none. Measure the notice under the field at
   390, 1024 and 1280 and sample entry, navigation and exit. Dismissal
   survives lock/unlock on the current page. Check the real handover
   and confirm a fresh page offers a waiting update again. */
import assert from 'node:assert/strict';
import { realpathSync } from 'node:fs';
import { createServer } from 'vite';
import { continueToTheRest, launchChromium, untilSplashLets } from '../browser-harness.mjs';
import { clientRoute } from '../browser-tier/built-flow.mjs';

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
const settled = async () => {
  // Svelte can schedule its transition for the next rendering step.
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.waitForFunction(() => !document.documentElement.dataset.nav &&
    document.getAnimations().every((a) => a.playState !== 'running' || a.effect?.getComputedTiming().iterations === Infinity));
};

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

/** The rail, the column, the scroll region, the screen, its field and the
    notice, in CSS px. */
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
    field: box('[data-app-scroll-region] [data-home-field], [data-app-scroll-region] [data-screen-field]'),
    foot: box('[data-home-foot]'),
    notice: box('[data-update-notice]'),
    inHeader: !!document.querySelector('[data-home-header] [data-update-notice], [data-screen-header] [data-update-notice]')
  };
});
const near = (a, b, tolerance = 0.5) => Math.abs(a - b) <= tolerance;
/** Under the field, in its header, 12px below its edge, at the content's width. */
const underField = (l) => !!l.notice && !!l.field && l.inHeader && near(l.notice.top - l.field.bottom, 12, 1) &&
  near(l.notice.left, l.screen.left + 20, 1) && near(l.notice.right, l.screen.right - 20, 1);
const where = (l) => l.notice ? `notice ${l.notice.left}-${l.notice.right} x ${l.notice.top}-${l.notice.bottom}, field to ${l.field?.bottom}, content ${l.screen.left + 20}-${l.screen.right - 20}` : 'no notice';

/* Every animation frame: how much of the notice's band is painted (its box
   less the clip covering it from the top) and its opacity, and where Home's
   foot - the line under the field, and so under the notice - stands. */
const startSampling = () => page.evaluate(() => {
  window.noticeFrames = [];
  window.noticeSampling = true;
  const tick = (now) => {
    if (!window.noticeSampling) return;
    // The band is what arrives (UpdateNotice.svelte); the unfixed tree had only the notice.
    const node = document.querySelector('[data-update-band]') ?? document.querySelector('[data-update-notice]');
    const foot = document.querySelector('[data-home-foot]').getBoundingClientRect();
    let painted = null;
    if (node) {
      const style = getComputedStyle(node);
      const r = node.getBoundingClientRect();
      const clipTop = Number(/inset\(([\d.]+)px/.exec(style.clipPath)?.[1] ?? 0);
      painted = { height: Math.max(0, r.height - clipTop), opacity: Number(style.opacity), top: r.top + clipTop };
    }
    window.noticeFrames.push({ now, painted, footTop: foot.top, footLeft: foot.left, footWidth: foot.width });
    if (window.noticeSampling) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});
/* Counts each time the polite region starts saying the notice's title. */
const listen = () => page.evaluate(() => {
  window.updateSpoken = 0;
  let saying = false;
  new MutationObserver(() => {
    const now = !!document.querySelector('[data-announce]')?.textContent.includes('A new version is ready');
    if (now && !saying) window.updateSpoken++;
    saying = now;
  }).observe(document.body, { subtree: true, childList: true, characterData: true });
});
const spoken = () => page.evaluate(() => window.updateSpoken);
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
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.locator('[data-applock]').waitFor();
  ok(await notice.count() === 0, 'the lock screen draws no update notice');
  await page.evaluate(() => { window.updateSpoken = 0; });
  await page.locator('#session-passphrase').fill('demo');
  await page.locator('[data-session-submit]').click();
  await page.locator('[data-applock]').waitFor({ state: 'detached' });
  // A new entry is a step with no tab bar or rail, so it is back on its own handle.
  await page.waitForSelector('[data-nav-item="home"], [data-rail-item="home"], [data-entry-step]');
  /* The screen loads the notice behind a dynamic import; once the module is
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

  await listen();
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
    ok(underField(shown), `${width}px: the notice is under the field at the content's full width (${where(shown)})`);
    ok(near(shown.rail.left, shown.frame.left) && near(shown.rail.width, quiet.rail.width) &&
      near(shown.column.left, shown.rail.right) && near(shown.column.right, shown.frame.right),
      `${width}px: rail ${shown.rail.left}-${shown.rail.right} and column ${shown.column.left}-${shown.column.right} keep their places with an update waiting`);
    ok(near(shown.scroll.width, shown.frame.width - quiet.rail.width),
      `${width}px: the scroll region keeps everything beside the rail (${shown.scroll.width}px of ${shown.frame.width - quiet.rail.width})`);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await settled();
  const phone = await layout();
  ok(!phone.rail && near(phone.column.width, phone.frame.width) && underField(phone),
    `390px: the same rule, under the field at the content's width (${where(phone)})`);
  await page.setViewportSize({ width: 1024, height: 768 });
  await settled();

  /* A navigation while the notice is up. It has its own view-transition
     group, so it is one object travelling from under Today's field to under
     Journal's while the screens cross, rather than a picture in each
     screen's snapshot fading and scaling with it. Sampled per frame: the
     group's vertical offset. */
  await page.evaluate(() => {
    window.vtFrames = [];
    window.vtSampling = true;
    const tick = () => {
      const pseudos = document.getAnimations().map((a) => a.effect?.pseudoElement ?? '');
      const transform = getComputedStyle(document.documentElement, '::view-transition-group(update-notice)').transform;
      const y = /matrix\(([^)]+)\)/.exec(transform)?.[1].split(',').map(Number)[5];
      window.vtFrames.push({ crossing: pseudos.some((p) => p.includes('(screen)')), ownGroup: pseudos.includes('::view-transition-group(update-notice)'), y: y ?? null });
      if (window.vtSampling) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  const fromHome = await layout();
  await page.locator('[data-rail-item="calendar"]').click();
  await page.waitForURL(/\/calendar/);
  await settled();
  const crossing = (await page.evaluate(() => { window.vtSampling = false; return window.vtFrames; })).filter((f) => f.crossing);
  const onJournal = await layout();
  const ys = crossing.filter((f) => f.ownGroup && f.y !== null).map((f) => f.y);
  const travelled = ys.length ? ys.at(-1) - ys[0] : 0;
  const ySteps = steps(ys);
  const monotone = ys.slice(1).every((y, i) => Math.sign(y - ys[i]) * Math.sign(travelled) >= 0);
  console.log('navigation', crossing.map((f) => f.y?.toFixed(1)).join(' '), 'home', fromHome.notice?.top, 'journal', onJournal.notice?.top);
  ok(crossing.length > 3 && ys.length > 3 && monotone &&
    near(travelled, onJournal.notice.top - fromHome.notice.top, 2) && Math.max(0, ...ySteps) <= Math.max(2, Math.abs(travelled) / 4) && underField(onJournal),
    `a navigation carries the one notice from under Today's field (${fromHome.notice?.top}) to under Journal's (${onJournal.notice?.top}) over ${ys.length} frames, largest step ${Math.max(0, ...ySteps).toFixed(1)}px`);
  await page.locator('[data-rail-item="home"]').click();
  await page.waitForURL((url) => url.pathname === '/');
  await settled();
  ok(await spoken() === 1, `the notice is announced once when the release arrives, not again by each screen that draws it (${await spoken()})`);

  /* On one side of a transition only, the notice's picture fades over
     --dur-fast rather than cutting: a transition taken with the band on
     screen and gone from the new state, then the reverse. */
  const lone = (show) => page.evaluate(async (show) => {
    const band = document.querySelector('[data-update-band]') ?? document.querySelector('[data-update-notice]');
    band.style.display = show ? 'none' : '';
    const transition = document.startViewTransition(() => { band.style.display = show ? '' : 'none'; });
    await transition.ready;
    const fades = document.getAnimations().filter((a) => /(old|new)\(update-notice\)/.test(a.effect?.pseudoElement ?? ''))
      .map((a) => ({ name: a.animationName, duration: a.effect.getComputedTiming().duration }));
    await transition.finished;
    band.style.display = '';
    return fades;
  }, show);
  const loneOut = await lone(false);
  const loneIn = await lone(true);
  ok(loneOut.some((a) => /fade-out/.test(a.name) && a.duration >= 100) && loneIn.some((a) => /fade-in/.test(a.name) && a.duration >= 100),
    `a notice on one side of a transition fades (${JSON.stringify(loneOut)} out, ${JSON.stringify(loneIn)} in)`);
  await settled();

  // The arrival: nothing painted at full size in its first frame, and what is under it moves down rather than sideways.
  const arrived = frames.filter((f) => f.painted);
  const finalHeight = arrived.at(-1)?.painted.height ?? 0;
  ok(arrived.length > 5 && arrived[0].painted.height < finalHeight * 0.25,
    `the notice opens over ${arrived.length} frames (first painted ${arrived[0]?.painted.height.toFixed(1)} of ${finalHeight.toFixed(1)}px)`);
  const tops = frames.map((f) => f.footTop);
  const lefts = frames.map((f) => f.footLeft);
  ok(Math.max(...steps(lefts)) < 0.5 && Math.max(...steps(frames.map((f) => f.footWidth))) < 0.5,
    `what is under the notice never moves sideways while it arrives (largest step ${Math.max(...steps(lefts)).toFixed(1)}px)`);
  const travel = tops.at(-1) - tops[0];
  const moving = steps(tops).filter((s) => s > 0.5);
  console.log('arrival', frames.map((f) => `${f.now.toFixed(0)}:${f.footTop.toFixed(1)}`).join(' '));
  ok(travel > 40 && moving.length >= 10 && Math.max(...moving) <= travel / 4,
    `the line under the field travels ${travel.toFixed(1)}px down over ${moving.length} frames, largest step ${Math.max(...moving).toFixed(1)}px`);

  // Dismiss: it leaves over several frames and the screen comes back up.
  await startSampling();
  await notice.getByRole('button', { name: 'Dismiss' }).click();
  await notice.waitFor({ state: 'detached' });
  await page.waitForTimeout(100);
  frames = await stopSampling();
  const leaving = frames.filter((f) => f.painted);
  const upTops = frames.map((f) => f.footTop);
  const back = upTops[0] - upTops.at(-1);
  const rising = steps(upTops).filter((s) => s > 0.5);
  console.log('dismissal', frames.map((f) => `${f.now.toFixed(0)}:${f.footTop.toFixed(1)}`).join(' '));
  ok(back > 40 && rising.length >= 10 && Math.max(...rising) <= back / 4 && near(upTops.at(-1), quiet.foot.top),
    `the dismissed notice gives its ${back.toFixed(1)}px back over ${rising.length} frames, largest step ${Math.max(...rising).toFixed(1)}px`);

  // Lock and unlock: the same page keeps the dismissal, and says nothing about it.
  await lockAndUnlock();
  ok(await page.locator('[data-home-header]').count() === 1, 'unlock remounts Home after a notice dismissal');
  ok(await notice.count() === 0, 'after lock and unlock the dismissed notice stays dismissed');
  ok(await spoken() === 0, 'and the unlocked page does not announce it again');
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
  await listen();
  await watch();
  await page.evaluate(() => window.releaseArrives());
  await notice.waitFor();
  await settled();
  ok(underField(await layout()), 'a fresh page offers the waiting release again, under the field');

  // Lock with the notice open: unlocking brings it back, and Update now still hands over.
  await lockAndUnlock();
  await notice.waitFor();
  await settled();
  ok(underField(await layout()), 'an undismissed notice is back under the field after unlock');
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
  ok(underField(reduced) && near(reduced.column.left, reduced.rail.right), 'reduced motion: the same place under the field');

  // A gate still tears down the editor and restores its encrypted draft.
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await clientRoute(page, '/entry/new/2026-10-05?seedMood=4');
  await continueToTheRest(page);
  const draft = 'Update notice lock regression: keep this unsaved note.';
  await page.locator('#ed-note').fill(draft);
  await lockAndUnlock();
  // The remounted editor opens on its first step with the draft read back under it.
  await continueToTheRest(page);
  await page.waitForFunction((text) => document.querySelector('#ed-note')?.value === text, draft);
  ok(new URL(page.url()).pathname === '/entry/new/2026-10-05', 'unlock keeps the editor route and restores its unsaved note');

  ok(errors.length === 0, `no uncaught page errors${errors.length ? `: ${errors.join('; ')}` : ''}`);
  assert.deepEqual(failures, [], 'every update notice check passed');
  assert.equal(checks, 29, 'all update notice checks ran');
  console.log(`Update notice passed: ${checks} checks`);
} finally {
  await context.close();
  await browser.close();
  await server.close();
}
