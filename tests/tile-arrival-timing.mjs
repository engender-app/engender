/* How long Today's and Look back's tiles take to arrive (phase 12 ux-carpet
   ticket 200).

   The tiles on both screens wait for their reads, and on Android every read
   used to wait for the one before it to cross the Capacitor bridge and come
   back: 1.3-1.6 s for a warm Today on the Pixel against 20-37 ms of SQL. The
   Android driver pipelines its calls now (ADR-0089). This is the budget that
   keeps the read path short, measured where CI can measure it:

   - warm: the app is open on the other tab and the nav link is clicked; the
     time from the click to the first frame the tiles are on screen. Budget
     WARM_MS.
   - cold: a full load of the screen; the time from the first frame the
     screen's shell is up (boot ready) to the first frame with the tiles.
     Budget COLD_MS.

   "Tiles on screen" is Home's lower ReadReserve body existing, and Look
   back's reading grid dropping `is-held` - the moments ReadReserve and
   ReadGroup let them paint.

   What this does not cover: the Android bridge itself. This is the web
   tier, a worker that has always taken statements back to back, so it holds
   the fan-out, the waterfalls and the gates above the driver - the part a
   screen change can make slower on both platforms - and says nothing about
   round trips. The device numbers live in the ticket and ADR-0089; the
   device bench is `.claude/scratch/bench.mjs` on the ticket branch, not
   something CI can drive. Each case runs RUNS times and is judged on its
   median, since a shared runner's one slow frame is noise rather than a
   regression; every run is printed.

   Run against a demo build:
     VITE_DEMO=1 npm run build
     node tests/tile-arrival-timing.mjs [--runs 5] [--root <built tree>]
   Failed warm cases save a diagnostic replay in ci-logs/. --diagnostics
   captures both warm routes even when the measured guard passes.
   --read-delay 40 adds controlled worker round trips to expose waterfalls. */
import { dirname, resolve } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { launchChromium, settlePage, previewBuild } from './browser-harness.mjs';
import { FILL_EVERY_FEATURE_EXPRESSION, INIT_HIDE_DEMO_SCRIPT, RESET_PERSONA_EXPRESSION } from './yank-sweep-core.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? args[at + 1] : fallback;
};
const RUNS = Number(flag('runs', '5'));
const WARM_MS = 250;
const COLD_MS = 300;
const READ_DELAY_MS = Number(flag('read-delay', '0'));
if (!Number.isFinite(READ_DELAY_MS) || READ_DELAY_MS < 0) throw new Error('--read-delay must be a nonnegative number');

const TILES = {
  '/': `!!document.querySelector('[data-home-reserve="below"] [data-read-reserve-body]')`,
  '/stats': `(() => {
    const grid = document.querySelector('[data-lookback-readings]');
    const members = grid && grid.closest('.read-group-members');
    return !!members && !members.classList.contains('is-held');
  })()`
};

/* An expression that polls after each frame's paint (a task queued from
   rAF), for up to 8 s, and answers the ms from `t0` to the first poll the
   condition held. `before` runs first, in the same task as `t0`. Built as
   a string and evaluated over CDP, which the page's CSP does not govern. */
const FIRST_FRAME = (condition, { t0 = 'performance.now()', before = '' } = {}) => `(() => {
  const t0 = ${t0};
  ${before}
  return new Promise((done) => {
    const tick = () => {
      const at = performance.now() - t0;
      if (${condition}) return done(at);
      if (at > 8000) return done(null);
      requestAnimationFrame(() => setTimeout(tick, 0));
    };
    tick();
  });
})()`;

const browser = await launchChromium();
const app = await previewBuild(resolve(flag('root', resolve(here, '..'))));
const base = `http://localhost:${app.httpServer.address().port}`;
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (err) => errors.push(String(err)));
await page.addInitScript(INIT_HIDE_DEMO_SCRIPT);
await page.addInitScript(() => {
  const post = Worker.prototype.postMessage;
  Worker.prototype.postMessage = function(message, ...options) {
    const delay = message?.op === 'query' ? Math.max(window.__queryDelayMs ?? 0, (window.__lateReadUntil ?? 0) - performance.now()) : 0;
    if (delay) setTimeout(() => post.call(this, message, ...options), delay);
    else post.call(this, message, ...options);
  };
});

/* The fullest journal the demo has, so every tile has something to read. */
await settlePage(page, base, '/', 'light');
if (!(await page.evaluate(RESET_PERSONA_EXPRESSION))) throw new Error('persona reset never reached Home');
await page.evaluate(FILL_EVERY_FEATURE_EXPRESSION);
await page.waitForTimeout(1500);

/* page.waitForFunction evaluates its string with eval, which the app's CSP
   refuses; page.evaluate goes over CDP, which the CSP does not govern. */
async function waitFor(expression) {
  const until = Date.now() + 20000;
  while (Date.now() < until) {
    if (await page.evaluate(expression)) return;
    await page.waitForTimeout(50);
  }
  throw new Error(`timed out waiting for ${expression.slice(0, 80)}`);
}

let captureWorkerTiming = false;

async function warm(to, readDelay = 0) {
  const from = to === '/' ? '/stats' : '/';
  await page.goto(`${base}${from}`, { waitUntil: 'networkidle' });
  await waitFor(TILES[from]);
  await page.waitForTimeout(800);
  await page.evaluate((delay) => { window.__queryDelayMs = delay; }, readDelay);
  if (captureWorkerTiming) {
    for (const worker of page.workers()) {
      if (!worker.url().includes('mc-worker')) continue;
      await worker.evaluate(() => {
        const received = new Map();
        const receive = self.onmessage;
        self.onmessage = function(event) {
          received.set(event.data.id, performance.timeOrigin + performance.now());
          return receive.call(this, event);
        };
        const post = self.postMessage;
        self.postMessage = function(message, ...options) {
          const timing = { received: received.get(message.id), replied: performance.timeOrigin + performance.now() };
          received.delete(message.id);
          return post.call(this, { ...message, diagnosticTiming: timing }, ...options);
        };
      });
    }
  }
  return page.evaluate(
    FIRST_FRAME(`location.pathname === '${to}' && ${TILES[to]}`, {
      before: `document.querySelector('nav a[href="${to}"]').click();`
    })
  );
}

async function cold(path) {
  await page.goto(`${base}${path}`, { waitUntil: 'commit' });
  const shellAt = await page.evaluate(FIRST_FRAME(`!!document.querySelector('[data-app-root][data-boot="ready"]')`, { t0: '0' }));
  const tilesAt = await page.evaluate(FIRST_FRAME(TILES[path], { t0: '0' }));
  return shellAt == null || tilesAt == null ? null : tilesAt - shellAt;
}

/* Each screen's own first element, which the other screen does not have:
   the header selector alone matches the old screen's header too while the
   address has already changed. */
const SCREEN = {
  '/': `!!document.querySelector('[data-home-hello]')`,
  '/stats': `!!document.querySelector('[data-lookback-rail], [data-lookback-readings]') || /Look back/.test(document.querySelector('h1')?.textContent ?? '')`
};

/* The frames after a click, one sample per painted frame: whether the new
   route is up, whether its tiles are, and whether any placeholder is. */
const FRAMES_AFTER_CLICK = (to) => `(() => {
  const t0 = performance.now();
  document.querySelector('nav a[href="${to}"]').click();
  const out = [];
  return new Promise((done) => {
    const tick = () => {
      const at = performance.now() - t0;
      out.push({
        at: Math.round(at),
        route: location.pathname === '${to}' && ${SCREEN[to]},
        tiles: location.pathname === '${to}' && ${TILES[to]},
        skeleton: [...document.querySelectorAll('.skeleton, [data-read-reserve-hold], .read-group-wait')].some((el) => el.getClientRects().length > 0),
        /* Where every block of the screen stands, and how opaque the read
           layers are: a revisit that paints from memory has nothing left to
           move or fade in. */
        layout: [...document.querySelectorAll('.screen > *')].map((el) => Math.round(el.getBoundingClientRect().top) + ':' + Math.round(el.getBoundingClientRect().height)).join(' '),
        faded: [...document.querySelectorAll('.read-group-members, [data-read-reserve-body]')].some((el) => Number(getComputedStyle(el).opacity) < 0.99)
      });
      if (at > 1500) return done(out);
      requestAnimationFrame(() => setTimeout(tick, 0));
    };
    requestAnimationFrame(() => setTimeout(tick, 0));
  });
})()`;

/** A second visit to a tab in the same session: the frames from the click
    until the tiles are up. Passes when the first frame showing the new
    route already has its tiles and no placeholder anywhere. */
async function revisit(to) {
  const from = to === '/' ? '/stats' : '/';
  await page.goto(`${base}${from}`, { waitUntil: 'networkidle' });
  await waitFor(TILES[from]);
  await page.evaluate(`document.querySelector('nav a[href="${to}"]').click()`);
  await waitFor(`location.pathname === '${to}' && ${TILES[to]}`);
  await page.waitForTimeout(800);
  await page.evaluate(`document.querySelector('nav a[href="${from}"]').click()`);
  await waitFor(`location.pathname === '${from}' && ${TILES[from]}`);
  await page.waitForTimeout(800);
  const frames = await page.evaluate(FRAMES_AFTER_CLICK(to));
  const first = frames.findIndex((f) => f.route);
  const after = first >= 0 ? frames.slice(first) : [];
  const moved = after.findIndex((f) => f.layout !== after[0].layout);
  const faded = after.findIndex((f) => f.faded);
  return {
    frames,
    first,
    moved: moved < 0 ? null : after[moved].at,
    faded: faded < 0 ? null : after[faded].at,
    ok: first >= 0 && frames[first].tiles && !after.some((f) => f.skeleton) && moved < 0 && faded < 0
  };
}

const median = (xs) => [...xs].sort((a, b) => a - b)[xs.length >> 1];
let failed = false;
const timingResults = [];
const cases = [
  ['warm Look back -> Today', () => warm('/'), WARM_MS, '/'],
  ['warm Today -> Look back', () => warm('/stats'), WARM_MS, '/stats'],
  ['cold Today, shell to tiles', () => cold('/'), COLD_MS],
  ['cold Look back, shell to tiles', () => cold('/stats'), COLD_MS]
];
/* Optional fault injection: delay each query equally without serializing
   its peers. Ordinary CI keeps the original four timing measurements. */
if (READ_DELAY_MS > 0) cases.push(
  [`${READ_DELAY_MS}ms worker round trips, Today`, () => warm('/', READ_DELAY_MS), WARM_MS, '/', READ_DELAY_MS],
  [`${READ_DELAY_MS}ms worker round trips, Look back`, () => warm('/stats', READ_DELAY_MS), WARM_MS, '/stats', READ_DELAY_MS]
);
for (const [name, run, budget, to, readDelay = 0] of cases) {
  const times = [];
  for (let i = 0; i < RUNS; i++) times.push(await run());
  const missing = times.some((t) => t == null);
  const m = missing ? null : median(times);
  const ok = !missing && m <= budget;
  timingResults.push({ name, to, readDelay, budget, times, median: m, ok });
  if (!ok) failed = true;
  console.log(
    `${ok ? 'ok  ' : 'FAIL'} ${name}: median ${m == null ? 'never' : Math.round(m) + 'ms'} (budget ${budget}ms), ` +
      `runs ${times.map((t) => (t == null ? 'never' : Math.round(t))).join('/')}`
  );
}
for (const to of ['/', '/stats']) {
  for (let i = 0; i < RUNS; i++) {
    const { frames, first, moved, faded, ok } = await revisit(to);
    if (!ok) failed = true;
    const tilesAt = frames.findIndex((f) => f.tiles);
    console.log(
      `${ok ? 'ok  ' : 'FAIL'} revisit ${to}: route first painted at ${first >= 0 ? frames[first].at + 'ms' : 'never'}, ` +
        `tiles ${tilesAt < 0 ? 'never' : tilesAt === first ? 'in that frame' : `${tilesAt - first} frames later (${frames[tilesAt].at}ms)`}` +
        `${frames.slice(Math.max(first, 0)).some((f) => f.skeleton) ? ', a placeholder showed' : ''}` +
        `${moved !== null ? `, a block moved at ${moved}ms` : ''}${faded !== null ? `, a read layer was under full opacity at ${faded}ms` : ''}`
    );
  }
}
/* Android's presentation path over the real web journal. The native bridge
   is measured on the phone; this checks the same field/reveal coordination
   in CI without replacing the read model or navigating to probe screens. */
await page.goto(`${base}/more`, { waitUntil: 'networkidle' });
await page.evaluate(`window.Capacitor.getPlatform = () => 'android'`);
async function androidArrival(to) {
  return page.evaluate(`(() => {
    const start = performance.now();
    document.querySelector('nav a[href="${to}"]').click();
    const frames = [];
    const visible = (node) => {
      if (!node || !node.getClientRects().length) return false;
      let opacity = 1;
      for (let at = node; at && !at.matches('[data-app-scroll-region]'); at = at.parentElement) {
        const style = getComputedStyle(at);
        if (style.visibility === 'hidden' || style.display === 'none') return false;
        opacity *= Number(style.opacity);
      }
      const entrances = node.getAnimations({ subtree: true }).filter((animation) =>
        animation.animationName === 'kit-block-in');
      return opacity >= 0.99 && entrances.every((animation) =>
        animation.playState === 'finished' || animation.effect.getComputedTiming().progress >= 0.99);
    };
    return new Promise((done) => {
      const tick = () => {
        const screen = [...document.querySelectorAll('[data-app-scroll-region] .screen')].at(-1);
        const field = screen?.querySelector('[data-home-field], [data-screen-field]');
        const bodies = [...(screen?.querySelectorAll('.cal-days, [data-read-reserve-body], .read-group-members:not(.is-held), [data-hub-index]') ?? [])];
        const gate = screen?.querySelector('.cal-days')?.parentElement;
        frames.push({
          at: performance.now() - start,
          route: location.pathname === '${to}',
          moving: field?.classList.contains('is-tab-bridging') ?? false,
          readable: bodies.length > 0 && bodies.every(visible) &&
            !bodies.some((body) => {
              for (let at = body; at && at !== screen; at = at.parentElement) {
                if (at.getAnimations().some((animation) => animation.playState === 'running' &&
                    animation.effect.getKeyframes().some((frame) => frame.height !== undefined))) return true;
              }
              return false;
            }),
          placeholder: !!screen?.querySelector('[data-gate-skeleton], [data-read-reserve-hold], .read-group-members.is-held'),
          height: gate?.getBoundingClientRect().height ?? null
        });
        if (performance.now() - start > 1200) done(frames);
        else requestAnimationFrame(() => setTimeout(tick, 0));
      };
      requestAnimationFrame(() => setTimeout(tick, 0));
    });
  })()`);
}
for (const pass of ['first', 'repeat']) for (const to of ['/calendar', '/stats', '/more', '/']) {
  const frames = await androidArrival(to);
  const lastMotion = frames.findLastIndex((f) => f.route && f.moving);
  const deadline = frames[lastMotion + 1];
  const readable = frames.find((f) => f.route && f.readable);
  const ok = lastMotion >= 0 && deadline?.readable;
  if (!ok) failed = true;
  console.log(`${ok ? 'ok  ' : 'FAIL'} Android presentation ${pass} ${to}: readable ${Math.round(readable?.at ?? -1)}ms, field end ${Math.round(deadline?.at ?? -1)}ms`);
  const heights = frames.filter((f) => f.route && f.height !== null).map((f) => f.height);
  const reversal = heights.some((height, i) => i > 0 && height < heights[i - 1] - 2);
  if (reversal) failed = true;
  if (to === '/calendar') console.log(`${reversal ? 'FAIL' : 'ok  '} Journal arrival never expands then collapses before settling`);
}

await page.goto(`${base}/more`, { waitUntil: 'networkidle' });
await page.evaluate(`window.Capacitor.getPlatform = () => 'android'; window.__lateReadUntil = performance.now() + 250`);
const during = await androidArrival('/stats');
const duringEnd = during.findLastIndex((f) => f.route && f.moving);
const duringOk = during[duringEnd + 1]?.readable;
if (!duringOk) failed = true;
console.log(`${duringOk ? 'ok  ' : 'FAIL'} reads finishing during motion also finish nested tile entrances by field end`);
/* CI printed only the verdict when this went red on main (run 37385237608),
   which could not say whether the reads had landed during the motion. */
if (!duringOk) {
  for (const f of during.slice(Math.max(0, duringEnd - 8), duringEnd + 3)) {
    console.log(`     ${Math.round(f.at)}ms ${f.moving ? 'moving' : 'still '} ${f.readable ? 'readable' : 'unread  '} ${f.placeholder ? 'placeholder' : ''}`);
  }
}

/* Hold actual worker reads past the field deadline on an uncached visit.
   Releasing every first-wave query at one time avoids fabricating a slow
   SQL waterfall. The ordinary chained reads still run afterwards. */
await page.goto(`${base}/more`, { waitUntil: 'networkidle' });
await page.evaluate(`(() => {
  window.Capacitor.getPlatform = () => 'android';
  window.__lateReadUntil = performance.now() + 650;
})()`);
const late = await androidArrival('/calendar');
const motionEnd = late.findLastIndex((f) => f.route && f.moving);
const waited = late[motionEnd + 1]?.placeholder && !late[motionEnd + 1]?.readable;
const arrived = late.find((f) => f.route && f.readable);
const lateHeights = late.filter((f) => f.route && f.height !== null).map((f) => f.height);
const bounced = lateHeights.some((height, i) => i > 0 && height < lateHeights[i - 1] - 2);
const lateOk = waited && arrived?.at < 1200 && !bounced;
if (!lateOk) failed = true;
console.log(`${lateOk ? 'ok  ' : 'FAIL'} unfinished Journal read keeps placeholder, then reveals without a height reversal (${Math.round(arrived?.at ?? -1)}ms)`);
/* Replay failed warm cases after every measured assertion. These observers
   never run during the guard's measurements; replay timings do not gate. */
const diagnosticCases = timingResults.filter((result) => result.to && (!result.ok || args.includes('--diagnostics')));
if (diagnosticCases.length) {
  const report = { timings: timingResults, pageErrors: [...errors], browser: browser.version(), source: process.env.GITHUB_SHA ?? null, replays: [] };
  try {
    await page.addInitScript(() => {
      Error.stackTraceLimit = 30;
      let events = [];
      const record = (kind, detail = {}) => events.push({ at: performance.now(), kind, ...detail });
      document.addEventListener('click', (event) => {
        const link = event.target.closest?.('nav a');
        if (link) {
          events = [];
          record('click', { to: link.getAttribute('href') });
        }
      }, true);
      window.__tileArrivalDiagnostics = () => ({ timeOrigin: performance.timeOrigin, events });
      const workers = new WeakSet();
      const post = Worker.prototype.postMessage;
      Worker.prototype.postMessage = function(message, ...options) {
        if (!workers.has(this)) {
          workers.add(this);
          this.addEventListener('message', (event) => record('worker-result', { id: event.data?.id, ok: event.data?.ok, timing: event.data?.diagnosticTiming }));
        }
        record('worker-post', {
          id: message?.id,
          op: message?.op,
          sql: message?.op === 'query' ? message.args?.sql : undefined,
          stack: message?.op === 'query' ? new Error().stack : undefined
        });
        return post.call(this, message, ...options);
      };
      const startTransition = document.startViewTransition;
      if (startTransition) document.startViewTransition = function(...options) {
        record('transition-start');
        const transition = startTransition.apply(this, options);
        transition.ready.then(() => record('transition-ready'), () => record('transition-skipped'));
        transition.finished.then(() => record('transition-end'), () => record('transition-aborted'));
        return transition;
      };
      let previous = '';
      new MutationObserver(() => {
        const grid = document.querySelector('[data-lookback-readings]');
        const state = {
          route: location.pathname,
          hello: !!document.querySelector('[data-home-hello]'),
          below: !!document.querySelector('[data-home-reserve="below"] [data-read-reserve-body]'),
          grid: !!grid,
          held: grid?.closest('.read-group-members')?.classList.contains('is-held') ?? null
        };
        const next = JSON.stringify(state);
        if (next !== previous) {
          previous = next;
          record('dom', { state });
        }
      }).observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
      new PerformanceObserver((list) => {
        for (const task of list.getEntries()) record('longtask', { start: task.startTime, duration: task.duration });
      }).observe({ type: 'longtask' });
    });
    captureWorkerTiming = true;
    for (const { name, to, readDelay } of diagnosticCases) {
      const replay = { name };
      report.replays.push(replay);
      try {
        replay.observedMs = await warm(to, readDelay);
        Object.assign(replay, await page.evaluate(() => ({
          ...window.__tileArrivalDiagnostics(),
          environment: {
            userAgent: navigator.userAgent,
            platform: navigator.platform,
            hardwareConcurrency: navigator.hardwareConcurrency,
            deviceMemory: navigator.deviceMemory,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
            motion: document.documentElement.dataset.a11yMotion,
            durations: Object.fromEntries(['--dur-fast', '--dur-med', '--dur-slow'].map((name) =>
              [name, getComputedStyle(document.documentElement).getPropertyValue(name)]))
          }
        })));
      } catch (error) {
        replay.error = String(error);
      }
    }
  } catch (error) {
    report.error = String(error);
  }
  const output = resolve('ci-logs', `tile-arrival-${Date.now()}-${process.pid}.json`);
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, JSON.stringify(report, null, 2));
  console.log(`Tile arrival diagnostic replay: ${output}`);
}

/* Scope checks run after timings: SQL observation and controlled failures
   must not change a measured frame. Exercise the same built screens whose
   arrival cost is guarded above. */
const scopeStarted = Date.now();
const scopeReport = {};
const scopeCheck = (ok, message) => {
  if (!ok) failed = true;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${message}`);
};
try {
  await page.addInitScript(() => {
    Error.stackTraceLimit = 30;
    window.__scopeQueries = [];
    window.__scopeHeld = [];
    // The deliberately rejected driver promise may also surface as an
    // unhandled rejection. Suppress only this exact injected fault.
    window.addEventListener('unhandledrejection', (event) => {
      if (event.reason?.message === 'controlled pin last-write failure') event.preventDefault();
    });
    const logError = console.error;
    console.error = (...args) => {
      if (args[0] === 'a journal query failed' && args[1]?.message === 'controlled pin last-write failure') window.__scopeReadFailed = true;
      logError(...args);
    };
    const post = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function(message, ...options) {
      if (message?.op === 'query') {
        window.__scopeQueries.push({ ...message.args, route: location.pathname, stack: new Error().stack });
        if (window.__scopeFailWear && message.args.sql.includes('MAX(start_timestamp) AS ts FROM wear_session')) {
          window.__scopeFailed = (window.__scopeFailed ?? 0) + 1;
          queueMicrotask(() => this.dispatchEvent(new MessageEvent('message', {
            data: { id: message.id, ok: false, error: 'controlled pin last-write failure' }
          })));
          return;
        }
        if (window.__scopeHold) {
          window.__scopeHeld.push(() => post.call(this, message, ...options));
          return;
        }
      }
      return post.call(this, message, ...options);
    };
  });
  await page.goto(`${base}/more`, { waitUntil: 'networkidle' });
  await page.evaluate(() => { window.__scopeQueries = []; });
  await page.locator('[data-nav-item="stats"]').click();
  await waitFor(TILES['/stats']);
  const tilesSql = await page.evaluate(() => window.__scopeQueries);
  scopeReport.tiles = tilesSql;
  const spread = (query) => query.sql.includes('FIRST_VALUE(value) OVER day_order');
  const tagShare = (query) => query.sql.trim().endsWith('GROUP BY t.id ORDER BY entries DESC, id');
  const averages = (query) => query.sql.includes('AVG(value) AS value, COUNT(*) AS entries FROM metric_value');
  // Correlation cards compare every scale independently of the day-by-day tile.
  const tileAverages = (query) => averages(query) && !query.stack.includes('Object.getCards');
  const metricKey = (query) => query.sql.includes('gd.key = ?') ? query.params[0] : 'mood';
  scopeCheck(!tilesSql.some(spread) && !tilesSql.some(tagShare), 'Look back tiles omit screen-only spreads and tag shares');
  const initialTileKeys = new Set(tilesSql.filter(tileAverages).map(metricKey));
  scopeCheck(initialTileKeys.size <= 2, 'Look back tiles read mood and highest-days scale without loading every scale');
  scopeCheck(tilesSql.filter((query) => query.sql.includes('FROM journaling_pause')).length === 1, 'Look back reads annotations only for its history rail');

  await page.goto(`${base}/stats/day-by-day`, { waitUntil: 'networkidle' });
  await waitFor(`!!document.querySelector('[data-values-list] li') && !!document.querySelector('[data-chart="area"]')`);
  const chartSql = await page.evaluate(() => window.__scopeQueries);
  const metricOptions = await page.locator('[data-chart-picker="stats-metric"] option').evaluateAll((options) => options.map((option) => option.value));
  const seriesKeys = new Set(chartSql.filter(averages).map(metricKey));
  scopeCheck(metricOptions.length > 2 && metricOptions.every((key) => seriesKeys.has(key)) && chartSql.some(spread), 'Day by day screen retains every scale, spreads and accessible values');
  scopeCheck(chartSql.some((query) => query.sql.includes('FROM journaling_pause')), 'Day by day screen retains chart annotations');

  const selectedMetric = metricOptions.at(-1);
  await page.locator('[data-chart-picker="stats-metric"]').selectOption(selectedMetric);
  await page.locator('[data-nav-item="settings"]').click();
  await waitFor(`location.pathname === '/more'`);
  await page.waitForTimeout(300);
  await page.evaluate(() => { window.__scopeQueries = []; });
  await page.locator('[data-nav-item="stats"]').click();
  await waitFor(TILES['/stats']);
  const changedSql = await page.evaluate(() => window.__scopeQueries);
  scopeReport.changedMetric = { selectedMetric, queries: changedSql };
  const changedKeys = new Set(changedSql.filter(tileAverages).map(metricKey));
  scopeCheck(changedKeys.has(selectedMetric) && [...changedKeys].every((key) => key === selectedMetric || initialTileKeys.has(key)), 'Look back tile follows changed active scale');

  await page.goto(`${base}/stats/days`, { waitUntil: 'networkidle' });
  await waitFor(`!!document.querySelector('[data-chart="donut"]')`);
  scopeCheck((await page.evaluate(() => window.__scopeQueries)).some(tagShare), 'Days screen retains tag shares and donut');

  await page.goto(`${base}/`, { waitUntil: 'networkidle' });
  await waitFor(TILES['/']);
  await page.locator('[data-list-row="edit-today"]').click();
  await waitFor(`!!document.querySelector('[data-today-editor]')`);
  const inventory = await page.locator('[data-edit-pinned-row], [data-edit-add]').evaluateAll((rows) => rows.map((row) => row.dataset.editPinnedRow ?? row.dataset.editAdd).sort());
  const initialPins = await page.locator('[data-edit-pinned-row]').evaluateAll((rows) => rows.map((row) => row.dataset.editPinnedRow));
  if (!initialPins.includes('wear')) await page.locator('[data-edit-add="wear"]').click();
  for (const key of initialPins.filter((key) => key !== 'wear')) await page.locator(`[data-edit-unpin="${key}"]`).click();
  await page.locator('[data-edit-done]').click();
  await waitFor(`!document.querySelector('[data-today-editor]') && !!document.querySelector('[data-pinned-row="wear"]')`);
  // The layout checks the return gap on every Home arrival. Count that
  // full read separately from the pin's selected read.
  await page.locator('[data-nav-item="settings"]').click();
  await waitFor(`location.pathname === '/more'`);
  await page.waitForTimeout(300);
  await page.evaluate(() => { window.__scopeQueries = []; window.__scopeFailWear = true; });
  await page.locator('[data-nav-item="home"]').click();
  await waitFor(`${TILES['/']} && window.__scopeReadFailed === true`);
  await page.waitForTimeout(100);
  const pinSql = await page.evaluate(() => window.__scopeQueries);
  scopeReport.pins = pinSql;
  const cycleLastWrite = (query) => query.sql.includes('FROM cycle_event') && query.sql.includes('ORDER BY epoch_day DESC LIMIT 1');
  // The layout's return-gap offer still owns one full last-write read.
  scopeCheck(pinSql.filter(cycleLastWrite).length === 1, 'Wear-only arrival adds no unrelated last-write read to return-gap check');

  await page.evaluate(() => {
    window.__scopeQueries = [];
    window.__scopeFailWear = false;
    window.__scopeHold = true;
    window.__scopeEarlyEditor = false;
    window.__scopeEditorObserver = new MutationObserver(() => {
      if (window.__scopeHold && document.querySelector('[data-today-editor]')) window.__scopeEarlyEditor = true;
    });
    window.__scopeEditorObserver.observe(document.body, { childList: true, subtree: true });
  });
  await page.locator('[data-list-row="edit-today"]').click();
  await page.waitForTimeout(100);
  scopeCheck(await page.evaluate(() => window.__scopeHeld.length > 0 && !window.__scopeEarlyEditor && !document.querySelector('[data-today-editor]')), 'Editor waits for expanded reads after failed pin-only read');
  await page.evaluate(() => {
    window.__scopeEditorObserver.disconnect();
    window.__scopeHold = false;
    for (const release of window.__scopeHeld.splice(0)) release();
  });
  await waitFor(`!!document.querySelector('[data-today-editor]')`);
  const expandedSql = await page.evaluate(() => window.__scopeQueries);
  const expandedInventory = await page.locator('[data-edit-pinned-row], [data-edit-add]').evaluateAll((rows) => rows.map((row) => row.dataset.editPinnedRow ?? row.dataset.editAdd).sort());
  scopeCheck(expandedSql.some(cycleLastWrite) && JSON.stringify(expandedInventory) === JSON.stringify(inventory), 'Editor expands reads and retains complete pin inventory');
  const careLine = await page.locator('[data-edit-add="care"]').innerText();
  await page.locator('[data-edit-add="voice-benchmark"]').click();
  await page.locator('[data-edit-grip="voice-benchmark"]').press('ArrowUp');
  await waitFor(`document.querySelector('[data-edit-pinned-row]')?.dataset.editPinnedRow === 'voice-benchmark'`);
  await page.locator('[data-edit-done]').click();
  await waitFor(`!document.querySelector('[data-today-editor]')`);
  const arranged = await page.locator('[data-pinned-row]').evaluateAll((rows) => rows.map((row) => row.dataset.pinnedRow));
  scopeCheck(JSON.stringify(arranged) === JSON.stringify(['voice-benchmark', 'wear']), 'Added pins retain keyboard order after closing editor');
  await page.locator('[data-list-row="edit-today"]').click();
  await waitFor(`!!document.querySelector('[data-today-editor]')`);
  scopeCheck(await page.locator('[data-edit-add="care"]').innerText() === careLine, 'Reopened editor retains forward facts for unpinned rows');
  await page.locator('[data-edit-unpin="voice-benchmark"]').click();
  await page.locator('[data-edit-done]').click();
  await waitFor(`!document.querySelector('[data-today-editor]')`);
  scopeCheck(await page.locator('[data-pinned-row="voice-benchmark"]').count() === 0, 'Unpinned row stays removed after editor closes');
} catch (error) {
  scopeCheck(false, `scope lifecycle regression: ${error}`);
}
if (failed) {
  const output = resolve('ci-logs', `tile-arrival-scope-${Date.now()}-${process.pid}.json`);
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, JSON.stringify(scopeReport, null, 2));
  console.log(`Tile arrival scope queries: ${output}`);
}
console.log(`Scope lifecycle checks: ${Date.now() - scopeStarted}ms`);
if (errors.length) {
  failed = true;
  console.log(`page errors:\n  ${errors.join('\n  ')}`);
}

await browser.close();
await app.close();
process.exit(failed ? 1 : 0);
