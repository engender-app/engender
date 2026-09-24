/* Home at idle keeps its hands off the rasteriser (phase 12 ux-carpet
   ticket 227).

   The flag sun breathes forever, on purpose. While each ring also carried its
   entrance animation, the two animated the same transform and Chromium ran
   the breath on the main thread, re-rastering the rings every frame: about
   300 raster tasks a second on a Home nobody was touching, on the web and on
   the phone alike. FlagSun now drops the entrance once it has ended, and the
   compositor runs the breath with no raster at all.

   This loads Home over the "fill every feature" journal, waits for the
   entrance to finish, then records five seconds of a Chromium trace and
   counts the raster tasks in it. What legitimately rasters at idle is small:
   a running timer ticking once a second. The mood faces' glance and blink
   repaint on the main thread only in the frames they visibly move (SVG
   children cannot composite), and those repaints raster nothing on their
   own. RUNS runs, each judged on its own.

   Run against a demo build:
     VITE_DEMO=1 npm run build
     node tests/home-idle-raster.mjs [--runs 3] [--root <built tree>] */
import { preview } from 'vite';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium, settlePage } from './browser-harness.mjs';
import { FILL_EVERY_FEATURE_EXPRESSION, INIT_HIDE_DEMO_SCRIPT, RESET_PERSONA_EXPRESSION } from './yank-sweep-core.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? args[at + 1] : fallback;
};
const RUNS = Number(flag('runs', '3'));
/* Five seconds of a once-a-second timer is a handful of raster tasks; the
   defect was 1500. */
const RASTER_BUDGET = 40;
const IDLE_MS = 5000;

const browser = await launchChromium();
const app = await preview({ root: resolve(flag('root', resolve(here, '..'))), preview: { port: 0 } });
const base = `http://localhost:${app.httpServer.address().port}`;
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (err) => errors.push(String(err)));
await page.addInitScript(INIT_HIDE_DEMO_SCRIPT);

await settlePage(page, base, '/', 'light');
if (!(await page.evaluate(RESET_PERSONA_EXPRESSION))) throw new Error('persona reset never reached Home');
await page.evaluate(FILL_EVERY_FEATURE_EXPRESSION);
await page.waitForTimeout(1500);

const cdp = await page.context().newCDPSession(page);
let failed = false;
for (let run = 1; run <= RUNS; run++) {
  await page.goto(`${base}/`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-home-hello]');
  // Past every ring's entrance (the last ends ~1.4s in) and Home's arrivals.
  await page.waitForTimeout(4000);
  const rings = await page.evaluate(() => document.querySelectorAll('[data-flag-sun] i').length);

  const events = [];
  const onData = (e) => events.push(...e.value);
  cdp.on('Tracing.dataCollected', onData);
  const complete = new Promise((r) => cdp.once('Tracing.tracingComplete', r));
  await cdp.send('Tracing.start', { categories: 'disabled-by-default-devtools.timeline,devtools.timeline', transferMode: 'ReportEvents' });
  await page.waitForTimeout(IDLE_MS);
  await cdp.send('Tracing.end');
  await complete;
  cdp.off('Tracing.dataCollected', onData);

  const count = (name) => events.filter((e) => e.name === name && (e.ph === 'X' || e.ph === 'B')).length;
  const raster = count('RasterTask');
  const ok = raster <= RASTER_BUDGET && rings > 0;
  if (!ok) failed = true;
  console.log(
    `${ok ? 'ok  ' : 'FAIL'} run ${run}: ${raster} raster tasks in ${IDLE_MS / 1000}s idle (budget ${RASTER_BUDGET}), ` +
      `${count('Paint')} paints, ${rings} sun rings`
  );
}
if (errors.length) console.log(`page errors:\n  ${errors.join('\n  ')}`);

await browser.close();
await app.close();
process.exit(failed ? 1 : 0);
