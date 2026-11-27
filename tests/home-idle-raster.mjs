/* Trace five seconds on Home after the entrance over a filled journal.
   Sample the first 30 seconds after input, while the sun breathes.
   FlagSun drops the entrance transform animation to let the breath
   composite without raster work. holdWhileStill.ts pauses the faces'
   SVG animation between movements to avoid main frames. Count raster
   tasks and main frames per run. A running timer can paint once a second.
   home-ambient-check covers the later idle pause.

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
/* The faces' moves, each with a frame or two either side, and the timer's
   tick: 74-76 in five seconds after 228. A loop left running is 300. */
const MAIN_FRAME_BUDGET = 130;
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
  await cdp.send('Tracing.start', { categories: 'disabled-by-default-devtools.timeline,devtools.timeline,cc', transferMode: 'ReportEvents' });
  await page.waitForTimeout(IDLE_MS);
  await cdp.send('Tracing.end');
  await complete;
  cdp.off('Tracing.dataCollected', onData);

  const count = (name) => events.filter((e) => e.name === name && (e.ph === 'X' || e.ph === 'B')).length;
  const raster = count('RasterTask');
  const mainFrames = count('ProxyMain::BeginMainFrame');
  const ok = raster <= RASTER_BUDGET && mainFrames <= MAIN_FRAME_BUDGET && rings > 0;
  if (!ok) failed = true;
  console.log(
    `${ok ? 'ok  ' : 'FAIL'} run ${run}: in ${IDLE_MS / 1000}s idle, ${raster} raster tasks (budget ${RASTER_BUDGET}), ` +
      `${mainFrames} main frames (budget ${MAIN_FRAME_BUDGET}), ${count('Paint')} paints, ${rings} sun rings`
  );
}
if (errors.length) console.log(`page errors:\n  ${errors.join('\n  ')}`);

await browser.close();
await app.close();
process.exit(failed ? 1 : 0);
