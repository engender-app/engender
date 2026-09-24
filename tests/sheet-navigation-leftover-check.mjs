/* Ticket 242: a sheet's `|global` transitions used to apply to all ~36
   Sheet call sites, so navigating away while one was open played its
   380ms outro over the *new* screen instead of being removed with the
   page it belonged to - the scrim and the sheet held the top of the DOM
   for `--dur-slow`, and stayed `topOwner()` in overlayLock.ts for exactly
   as long, so Escape pressed in that window closed the departed sheet
   instead of doing nothing.

   Reproduces without the View Transitions API rather than with it: this
   app only calls `document.startViewTransition` for a handful of route
   pairs (screen-transition.ts), and inside that callback the sheet clears
   quickly regardless of `|global` (`dropOutgoingScreens()` force-removes
   `.screen`, and by the time the "new" side is captured Svelte has already
   torn the old page down). Every other navigation - most tab crossings and
   a link to a route within the same section among them - takes
   `navigateWithTransition`'s early return (`!document.startViewTransition
   || pattern === 'none'`) straight to SvelteKit's own outro-aware unmount,
   which is where a held `|global` outro actually blocks removal for the
   full `--dur-slow`. That is also every navigation in Firefox and
   LibreWolf (no View Transitions support at all) - Alicja's own browser -
   so this probe disables `document.startViewTransition` to match the
   reproducing path rather than the one Chromium happens to prefer.

   Sampled with a page-side rAF loop (per
   svelte-transitions-are-local-by-default.md: a recorder, not a
   screenshot) rather than a single screenshot, because a single frame
   that happens to land after the outro finished would pass on the old
   code too. The assertion is a clear-by deadline rather than "the new
   screen's marker never overlaps it": on the unfixed code the new page's
   own mount is serialized behind the held sheet's outro (SvelteKit does
   not mount the incoming page until the outgoing one, sheet included,
   finishes tearing down), so which one a sample catches "on top of" the
   other is a race - sometimes the marker paints first and sits under the
   stuck sheet, sometimes the stuck sheet finishes a frame before the
   marker's own query resolves. Both are the same bug (the sheet is still
   there ~400ms after the tap that should have removed it); a deadline
   catches it either way. */
import { preview } from 'vite';
import { createReporter, launchChromium } from './browser-harness.mjs';

const { ok, fail, finish, block } = createReporter();
const app = await preview({ preview: { port: 0 } });
const base = `http://localhost:${app.httpServer.address().port}`;
const browser = await launchChromium();

/* Well above ordinary async route-swap lag (observed 15-90ms on both
   branches) and well below the bug's ~400-430ms hold (observed over a
   dozen runs on main with View Transitions disabled) - see the ticket's
   own --dur-slow (380ms) figure. */
const CLEAR_DEADLINE_MS = 200;

async function freshPage() {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await context.addInitScript(() => {
    Object.defineProperty(document, 'startViewTransition', { value: undefined, configurable: true });
  });
  const page = await context.newPage();
  await page.goto(`${base}/`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-app-root][data-boot="ready"]', { timeout: 60000 });
  if (await page.locator('[data-leave-setup]').count()) {
    await page.locator('[data-leave-setup]').click();
    await page.waitForSelector('[data-home-hello]');
  }
  return { context, page };
}

async function goto(page, path) {
  await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-app-root][data-boot="ready"]', { timeout: 60000 });
}

/** Arms a page-side rAF sampler before the navigating click, so the first
    sample is at or before the click rather than after the fact. Reads it
    back with `readSamples` once `window.__sheetLeftoverDone` is true. */
async function armSampler(page, ms = 900) {
  await page.evaluate((durationMs) => {
    window.__sheetLeftoverSamples = [];
    window.__sheetLeftoverDone = false;
    const start = performance.now();
    function isPainted(el) {
      if (!el || !el.isConnected) return false;
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      const opacity = parseFloat(style.opacity || '1');
      return (
        style.display !== 'none'
        && style.visibility !== 'hidden'
        && opacity > 0.02
        && rect.width > 0
        && rect.height > 0
        && rect.bottom > 0
        && rect.right > 0
        && rect.top < window.innerHeight
        && rect.left < window.innerWidth
      );
    }
    function tick() {
      const scrim = document.querySelector('.sheet-scrim');
      const sheet = document.querySelector('[data-sheet]');
      window.__sheetLeftoverSamples.push({
        t: performance.now() - start,
        scrimPresent: !!scrim,
        scrimPainted: isPainted(scrim),
        sheetPresent: !!sheet,
        sheetPainted: isPainted(sheet)
      });
      if (performance.now() - start < durationMs) requestAnimationFrame(tick);
      else window.__sheetLeftoverDone = true;
    }
    requestAnimationFrame(tick);
  }, ms);
}

async function readSamples(page) {
  await page.waitForFunction(() => window.__sheetLeftoverDone === true, null, { timeout: 5000 });
  return page.evaluate(() => window.__sheetLeftoverSamples);
}

/* A real pointer click at the tab bar's or the link's screen coordinates
   hits the open sheet instead (it is a `position: fixed; inset: 0` scrim,
   full height regardless of how tall its content is) - the bar sinks
   behind it (components.css's `[data-app-root] > [inert]`) for exactly as
   long as the sheet is open, which is the one thing this probe must not
   wait out. A `.click()` dispatches the same trusted 'click' the element
   would receive from underneath the sheet on a build where the two didn't
   overlap, and SvelteKit's router does not care which produced it - it
   reads the event, not the pointer. */
function jsClick(page, selector) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) throw new Error(`not found: ${sel}`);
    el.click();
  }, selector);
}

/** No sample past `CLEAR_DEADLINE_MS` may still show a painted scrim or
    sheet, and by the end neither may even remain in the DOM. */
function assertNoLeftover(label, samples) {
  const stillThere = samples.find((s) => s.t > CLEAR_DEADLINE_MS && (s.scrimPainted || s.sheetPainted));
  if (stillThere) {
    fail(`${label}: sheet/scrim clears within ${CLEAR_DEADLINE_MS}ms of navigating away`,
      `still painted at t=${stillThere.t.toFixed(1)}ms of ${samples.length} frames sampled: ${JSON.stringify(stillThere)}`);
  } else {
    ok(`${label}: sheet/scrim clears within ${CLEAR_DEADLINE_MS}ms of navigating away (${samples.length} frames sampled)`);
  }

  const last = samples[samples.length - 1];
  if (!last.scrimPresent && !last.sheetPresent) {
    ok(`${label}: no [data-sheet]/.sheet-scrim left in the DOM`);
  } else {
    fail(`${label}: no [data-sheet]/.sheet-scrim left in the DOM`, JSON.stringify(last));
  }
}

await block('ticket 242 sheet navigation leftover', 5, async () => {
  // Case 1: open a sheet on care/doses, leave by the tab bar.
  {
    const { context, page } = await freshPage();
    await goto(page, '/care/doses');
    await page.locator('[data-add]').click();
    await page.waitForSelector('[data-sheet]');
    await armSampler(page);
    await jsClick(page, '[data-nav-item="home"]');
    const samples = await readSamples(page);
    assertNoLeftover('doses sheet -> tab bar to home', samples);
    await context.close();
  }

  // Case 2: open a sheet on health/appointments, leave by an in-page link
  // (the always-rendered "in the room" row, not the tab bar).
  {
    const { context, page } = await freshPage();
    await goto(page, '/health/appointments');
    await page.locator('[data-add]').click();
    await page.waitForSelector('[data-sheet]');
    await armSampler(page);
    await jsClick(page, '[data-list-row="in-the-room"]');
    const samples = await readSamples(page);
    assertNoLeftover('appointments sheet -> link to in-the-room', samples);
    await context.close();
  }

  // Case 3: Escape right after navigating away must not act on the
  // departed sheet (overlayLock.ts's topOwner stack).
  {
    const { context, page } = await freshPage();
    await goto(page, '/care/doses');
    await page.locator('[data-add]').click();
    await page.waitForSelector('[data-sheet]');
    await jsClick(page, '[data-nav-item="calendar"]');
    await page.waitForURL('**/calendar');
    /* overlayLock.ts's `onOverlayKeydown` is registered on `window` with
       `capture: true` and, for a still-registered owner, calls
       `event.preventDefault()` / `stopImmediatePropagation()` before any
       bubble-phase listener sees the key - that is the mechanism item 3
       names ("stays topOwner() ... so Escape ... acts on it"), and it is
       what a plain bubble listener added *after* navigating can prove
       directly: it only ever misses Escape if something upstream already
       consumed it. On the fixed branch the departed sheet's own listener
       is gone (unregistered by `registerOverlay`'s cleanup, run the same
       tick as its removal) before this one is even attached, so nothing
       is left to consume it. */
    await page.evaluate(() => {
      window.__escapeReachedNormalListener = false;
      window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') window.__escapeReachedNormalListener = true;
      });
    });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(50);
    const afterEscape = {
      reachedNormalListener: await page.evaluate(() => window.__escapeReachedNormalListener),
      sheets: await page.locator('[data-sheet]').count(),
      scrims: await page.locator('.sheet-scrim').count(),
      url: page.url()
    };
    if (afterEscape.reachedNormalListener && afterEscape.sheets === 0 && afterEscape.scrims === 0 && afterEscape.url.includes('/calendar'))
      ok('Escape right after navigating away is not consumed by the departed sheet');
    else fail('Escape right after navigating away is not consumed by the departed sheet', JSON.stringify(afterEscape));
    await context.close();
  }
});

process.exitCode = finish('ticket 242 sheet navigation leftover checks passed') ? 1 : 0;
await browser.close();
await app.httpServer.close();
