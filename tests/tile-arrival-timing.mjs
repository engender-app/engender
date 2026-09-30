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
     node tests/tile-arrival-timing.mjs [--runs 5] [--root <built tree>] */
import { dirname, resolve } from 'node:path';
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
    const delay = message?.op === 'query' ? Math.max(0, (window.__lateReadUntil ?? 0) - performance.now()) : 0;
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

async function warm(to) {
  const from = to === '/' ? '/stats' : '/';
  await page.goto(`${base}${from}`, { waitUntil: 'networkidle' });
  await waitFor(TILES[from]);
  await page.waitForTimeout(800);
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
const cases = [
  ['warm Look back -> Today', () => warm('/'), WARM_MS],
  ['warm Today -> Look back', () => warm('/stats'), WARM_MS],
  ['cold Today, shell to tiles', () => cold('/'), COLD_MS],
  ['cold Look back, shell to tiles', () => cold('/stats'), COLD_MS]
];
for (const [name, run, budget] of cases) {
  const times = [];
  for (let i = 0; i < RUNS; i++) times.push(await run());
  const missing = times.some((t) => t == null);
  const m = missing ? null : median(times);
  const ok = !missing && m <= budget;
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
if (errors.length) {
  failed = true;
  console.log(`page errors:\n  ${errors.join('\n  ')}`);
}

await browser.close();
await app.close();
process.exit(failed ? 1 : 0);
