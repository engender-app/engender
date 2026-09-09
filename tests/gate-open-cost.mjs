/* What the app opening costs the person who typed the right secret
   (redesign ticket 34).

   The ticket's acceptance asks that nothing added here delay somebody typing
   a correct secret, "measured rather than asserted". The thing that could is
   real: the state change that ends a gate now happens inside a view
   transition ($lib/motion/appOpening), so it lands one frame later than the
   assignment it replaced, and the browser holds the old frame while it takes
   its photograph.

   Measured as an A/B inside one build rather than against a baseline
   checkout, because the two arms differ by exactly the thing under test:
   `openApp` falls back to a plain commit where `document.startViewTransition`
   is missing, so deleting that one method turns the ticket's change off and
   changes nothing else. A main baseline would also carry every other
   difference between the two branches.

   Three numbers per unlock, all from the moment the submit is pressed:
     gone    the frame the gate left the DOM - the commit itself
     app     the frame the screen behind it is in the DOM and laid out
     usable  the frame a tap at the middle of the screen reaches the app
             again: Chromium paints a view transition's snapshots over the
             page and hit-testing lands on the root for its whole length, so
             this is longer than the two above by the length of the
             animation.

   The third number is the one that needs a comparison rather than a floor,
   which is why the run ends with the same read taken across an ordinary door
   change. Every navigation in this app has been a view transition since
   phase 5 ticket 18, so if the unlock's window is the door's window then the
   app opening costs a frame and nothing else; if it were longer, this ticket
   would have made the gate a worse place to be than the rest of the app.

   Run: node tests/gate-open-cost.mjs [--runs 8]
   Needs a demo build on disk (VITE_DEMO=1 npm run build). */
import { preview } from 'vite';
import { launchChromium } from './browser-harness.mjs';

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const at = argv.indexOf(`--${name}`);
  return at >= 0 ? Number(argv[at + 1]) : fallback;
};
const RUNS = flag('runs', 8);
const VIEWPORT = { width: 390, height: 844 };

const app = await preview({ preview: { port: 0 } });
const base = `http://localhost:${app.httpServer.address().port}`;
const browser = await launchChromium();

/** One unlock, timed from the submit. The watcher is installed before the
    click and reads the tree on every animation frame; `usable` is a hit test
    rather than a click, because a click that lands would navigate and end
    the measurement's own screen. */
const WATCH = () => {
  window.__opened = {
    t0: performance.now(),
    gone: null,
    app: null,
    usable: null,
    /* Kept in the record so a run that measured a leftover says so instead
       of reporting a number. */
    atInstall: {
      applock: Boolean(document.querySelector('[data-applock]')),
      homeField: Boolean(document.querySelector('[data-home-field]'))
    }
  };
  const centre = () => document.elementFromPoint(innerWidth / 2, innerHeight / 2);
  const tick = () => {
    const o = window.__opened;
    const now = performance.now() - o.t0;
    if (o.gone === null && !document.querySelector('[data-applock]')) o.gone = now;
    const field = document.querySelector('[data-home-field]');
    if (o.app === null && field && field.getBoundingClientRect().height > 0) o.app = now;
    if (o.usable === null && centre()?.closest('[data-home-field], .home, .screen:not(.screen-gate)')) {
      o.usable = now;
    }
    if (o.usable === null || o.app === null) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
};

async function arm(label, kill) {
  const context = await browser.newContext({ viewport: VIEWPORT, reducedMotion: 'no-preference' });
  if (kill) {
    await context.addInitScript(() => {
      /* The one method the ticket's change hangs on. Deleted before any of
         the app's own script runs, so `openApp` takes the plain path and the
         layout's navigations do too - which is the arm that stands for the
         app before this ticket. */
      delete Document.prototype.startViewTransition;
    });
  }
  await context.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      const style = document.createElement('style');
      style.textContent =
        '[data-toast]{display:none !important}' +
        '.demo-bar{display:none !important}' +
        'body.has-demo-bar{display:block !important;height:auto !important}';
      document.head.append(style);
    });
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => console.error('page error:', e.message));

  const settle = async (path) => {
    await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-app-root][data-boot="ready"]');
    if (await page.locator('[data-leave-setup]').count()) {
      await page.locator('[data-leave-setup]').click();
      await page.waitForSelector('[data-home-hello]');
      await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
      await page.waitForSelector('[data-app-root][data-boot="ready"]');
    }
  };

  await settle('/settings/security');
  const toggle = page.getByRole('switch', { name: 'Lock on leave' });
  if ((await toggle.getAttribute('aria-checked')) !== 'true') await toggle.click();

  const runs = [];
  for (let i = 0; i < RUNS; i++) {
    await settle('/');
    await page.waitForSelector('[data-home-field]');
    await page.waitForTimeout(300);
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await page.waitForSelector('[data-applock]');
    /* The gate arriving is not the screen behind it leaving: locking is not a
       navigation, so Home unmounts on its own outro and is still in the tree
       for a beat afterwards. Measured without this wait, both arms reported
       the app "arriving" 2ms after the submit, which was the leftover from
       the lock rather than anything the unlock did. */
    await page.waitForSelector('[data-home-field]', { state: 'detached' });
    await page.waitForTimeout(300);
    await page.locator('#session-passphrase').fill('demo');
    await page.evaluate(WATCH);
    await page.locator('[data-session-submit]').click();
    await page.waitForSelector('[data-home-field]');
    await page.waitForTimeout(900);
    const one = await page.evaluate(() => window.__opened);
    if (process.env.COST_DEBUG) console.log(label, JSON.stringify(one));
    if (!one.atInstall.applock || one.atInstall.homeField) {
      throw new Error(`the run started from the wrong screen: ${JSON.stringify(one.atInstall)}`);
    }
    runs.push(one);
  }
  await context.close();

  const median = (key) => {
    const xs = runs.map((r) => r[key]).filter((x) => x !== null).sort((a, b) => a - b);
    return xs.length ? Math.round(xs[Math.floor(xs.length / 2)]) : null;
  };
  const worst = (key) => Math.round(Math.max(...runs.map((r) => r[key] ?? 0)));
  console.log(
    `${label.padEnd(22)} gone ${String(median('gone')).padStart(4)}ms (worst ${worst('gone')})  ` +
      `app ${String(median('app')).padStart(4)}ms (worst ${worst('app')})  ` +
      `usable ${String(median('usable')).padStart(4)}ms (worst ${worst('usable')})`
  );
  return { gone: median('gone'), app: median('app'), usable: median('usable') };
}

/** The same hit test across a tab change, for the length of the window to be
    compared with rather than judged on its own. */
async function doorChange() {
  const context = await browser.newContext({ viewport: VIEWPORT, reducedMotion: 'no-preference' });
  const page = await context.newPage();
  await page.goto(`${base}/`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-app-root][data-boot="ready"]');
  if (await page.locator('[data-leave-setup]').count()) {
    await page.locator('[data-leave-setup]').click();
    await page.waitForSelector('[data-home-hello]');
  }
  await page.waitForSelector('[data-home-field]');
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    window.__door = { t0: performance.now(), opaque: null, back: null };
    const tick = () => {
      const o = window.__door;
      const now = performance.now() - o.t0;
      const el = document.elementFromPoint(innerWidth / 2, innerHeight / 2);
      const root = el === document.documentElement;
      if (o.opaque === null && root) o.opaque = now;
      if (o.opaque !== null && o.back === null && !root) o.back = now;
      if (o.back === null) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await page.locator('[data-nav-item="calendar"]').click();
  await page.waitForTimeout(1400);
  const door = await page.evaluate(() => window.__door);
  await context.close();
  return Math.round((door.back ?? 0) - (door.opaque ?? 0));
}

try {
  const without = await arm('without the opening', true);
  const with_ = await arm('with the opening', false);
  const door = await doorChange();
  console.log(
    `\nthe opening costs: gone ${with_.gone - without.gone}ms, ` +
      `app ${with_.app - without.app}ms ` +
      `(median of ${RUNS} unlocks each, one frame is about 17ms)`
  );
  console.log(
    `the app is not hit-testable for ${with_.usable - with_.app}ms of the opening, ` +
      `against ${door}ms of an ordinary door change - a view transition paints over the page ` +
      `either way, and this is the app's own window rather than a new one`
  );
} finally {
  await browser.close();
  await app.close();
}
