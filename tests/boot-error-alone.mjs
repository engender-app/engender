/* A failed boot shows its notice and nothing else (phase 12 ux-carpet
   ticket 213).

   The layout rendered the route whenever no gate claimed the screen, and a
   boot that failed claimed none, so Today mounted under "Couldn't open your
   journal": the greeting, the mood row, the nav and the quick-add button, on
   a journal that never opened. A person saw their home screen with an error
   on top of it, and automation that waited for `data-home-hello` read it as
   a boot (ticket 210 found it that way).

   The failure is an unreadable journal, the case ticket 210 left a phone in:
   the journal worker is swapped for one that answers every request the way
   SQLite answers a wrong key, "file is not a database", so boot() fails
   through its real path and the notice offers 210's way out. Then the page is read for anything a
   booted app draws. A normal boot is checked alongside, so the probe cannot
   pass by hiding Today altogether.

   Ticket 215 adds the database that never loads: a refused wasm request
   and a worker served without COEP both have to reach the same notice.

   Against a demo build:
     VITE_DEMO=1 npm run build
     node tests/boot-error-alone.mjs [--root <built tree>] */
import { preview } from 'vite';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium, screencast } from './browser-harness.mjs';
import { INIT_HIDE_DEMO_SCRIPT } from './yank-sweep-core.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const at = args.indexOf('--root');
const root = resolve(at >= 0 ? args[at + 1] : resolve(here, '..'));

const browser = await launchChromium();
const decoder = await browser.newPage();
const app = await preview({ root, preview: { port: 0 } });
const base = `http://localhost:${app.httpServer.address().port}`;

/* What only a booted app draws. The notice itself is not in this list. */
const APP_MARKUP = ['[data-home-hello]', '[data-app-nav]', '[data-nav-fab]', '[data-fan]'];

async function open(breakTheDatabase) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  if (breakTheDatabase) {
    await context.route(/mc-worker-[^/]*\.js$/, async (route) =>
      route.fulfill({
        response: await route.fetch(),
        body: "onmessage = (e) => postMessage({ id: e.data.id, ok: false, error: 'file is not a database' });"
      })
    );
  }
  const page = await context.newPage();
  await page.addInitScript(INIT_HIDE_DEMO_SCRIPT);
  const frames = await screencast(page, async (frames) => {
    await page.goto(base + '/');
    await page.waitForFunction(
      () => ['ready', 'error'].includes(document.querySelector('[data-app-root]')?.dataset.boot ?? ''),
      null,
      { timeout: 60000 }
    );
    /* Long enough for anything mounted on the way to the verdict to paint,
       and for the crossing to settle. */
    await page.waitForTimeout(1500);
    return frames.slice();
  });
  const state = await page.evaluate((selectors) => ({
    boot: document.querySelector('[data-app-root]')?.dataset.boot,
    present: selectors.filter((selector) => document.querySelector(selector)),
    scrollRegionText: document.querySelector('[data-app-scroll-region]')?.innerText.trim() ?? '',
    notice: !!document.querySelector('[data-retry-boot]') && !!document.querySelector('[data-unreadable-reset]')
  }), APP_MARKUP);
  await context.close();
  return { ...state, bands: await distances(frames) };
}

/** Each frame's mean channel distance from the last one, per band. */
async function distances(frames) {
  return decoder.evaluate(async (list) => {
    const pixels = async (b64) => {
      const image = new Image();
      image.src = 'data:image/png;base64,' + b64;
      await image.decode();
      const canvas = new OffscreenCanvas(image.width, image.height);
      const context = canvas.getContext('2d');
      context.drawImage(image, 0, 0);
      return context.getImageData(0, 0, image.width, image.height);
    };
    const images = [];
    for (const frame of list) images.push(await pixels(frame.data));
    const last = images[images.length - 1];
    const band = (a, y0, y1) => {
      let sum = 0;
      let n = 0;
      for (let y = y0; y < Math.min(y1, a.height); y++)
        for (let x = 0; x < a.width; x += 2) {
          const i = (y * a.width + x) * 4;
          for (let c = 0; c < 3; c++) sum += Math.abs(a.data[i + c] - last.data[i + c]);
          n += 3;
        }
      return sum / n;
    };
    return { notice: images.map((a) => band(a, 0, 200)), body: images.map((a) => band(a, 200, 700)) };
  }, frames);
}

/** How the band got from its peak to settled: the largest share of that
    distance covered in one frame, and how many frames it took. */
function crossing(series) {
  const peak = Math.max(...series);
  /* The last frame still at the peak, which is the one before the swap. */
  let peakAt = 0;
  for (let i = 0; i < series.length; i++) if (series[i] >= peak * 0.95) peakAt = i;
  let settledAt = series.length - 1;
  for (let i = peakAt; i < series.length; i++) if (series[i] < peak * 0.02) { settledAt = i; break; }
  let worst = 0;
  for (let i = peakAt + 1; i <= settledAt; i++) worst = Math.max(worst, (series[i - 1] - series[i]) / peak);
  return { worst, frames: settledAt - peakAt, peak };
}

let failures = 0;
const check = (ok, line) => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${line}`);
  if (!ok) failures++;
};

for (let pass = 1; pass <= 3; pass++) {
  const broken = await open(true);
  check(broken.boot === 'error' && broken.notice, `pass ${pass}: an unreadable journal boots to the error notice (boot=${broken.boot})`);
  check(broken.present.length === 0, `pass ${pass}: nothing a booted app draws is on screen (${broken.present.join(', ') || 'none'})`);
  check(broken.scrollRegionText === '', `pass ${pass}: the scroll region is empty (${JSON.stringify(broken.scrollRegionText.slice(0, 80))})`);
  for (const name of ['notice', 'body']) {
    const { worst, frames, peak } = crossing(broken.bands[name]);
    check(
      peak > 2 && worst <= 0.7 && frames >= 4,
      `pass ${pass}: the ${name} band crosses rather than cuts (peak ${peak.toFixed(1)}, ${Math.round(worst * 100)}% in one frame, ${frames} frames)`
    );
  }
}

const healthy = await open(false);
check(healthy.boot === 'ready' && healthy.present.includes('[data-home-hello]'), `a normal boot still reaches Today (boot=${healthy.boot})`);

/* Ticket 215: a database that never loads is a failed boot too. A blocked
   wasm request (an extension, a stale cache) left the boot at 'booting' for
   good, because the failed boot's second close went to a worker the first
   had terminated and waited for an answer that never came. Both load
   failures must reach the notice, and a healthy boot at 6x CPU must not be
   mistaken for one. */
async function verdict(prepare, cpu = 1) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  await prepare(context);
  const page = await context.newPage();
  if (cpu > 1) await (await context.newCDPSession(page)).send('Emulation.setCPUThrottlingRate', { rate: cpu });
  await page.addInitScript(INIT_HIDE_DEMO_SCRIPT);
  const started = Date.now();
  await page.goto(base + '/');
  await page
    .waitForFunction(() => ['ready', 'error'].includes(document.querySelector('[data-app-root]')?.dataset.boot ?? ''), null, {
      timeout: 30000
    })
    .catch(() => {});
  const boot = await page.evaluate(() => document.querySelector('[data-app-root]')?.dataset.boot);
  const retry = await page.locator('[data-retry-boot]').count();
  await context.close();
  return { boot, retry, ms: Date.now() - started };
}

const refusedWasm = await verdict((context) => context.route(/sqlite3[^/]*\.wasm$/, (route) => route.abort()));
check(refusedWasm.boot === 'error' && refusedWasm.retry === 1, `a refused SQLite wasm ends in the error notice (boot=${refusedWasm.boot} after ${refusedWasm.ms}ms)`);

const bareWorker = await verdict((context) =>
  context.route(/mc-worker-[^/]*\.js$/, async (route) => {
    const response = await route.fetch();
    const headers = { ...response.headers() };
    delete headers['cross-origin-embedder-policy'];
    delete headers['cross-origin-resource-policy'];
    await route.fulfill({ status: response.status(), headers, body: await response.body() });
  })
);
check(bareWorker.boot === 'error' && bareWorker.retry === 1, `a journal worker served without COEP ends in the error notice (boot=${bareWorker.boot} after ${bareWorker.ms}ms)`);

const slow = await verdict(async () => {}, 6);
check(slow.boot === 'ready', `a healthy boot at 6x CPU still reaches ready (boot=${slow.boot} after ${slow.ms}ms)`);

await browser.close();
await new Promise((done) => app.httpServer.close(done));
process.exit(failures ? 1 : 0);
