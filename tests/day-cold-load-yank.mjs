/* The day view's cold load, one surface at a time (ux-carpet ticket 174).

   `marginNotesRead`/`doseDrugsRead` are chained off the day read over
   whichever entries/doses it turns out to hold. Their query's very first
   run answers for an empty id list before the day read has landed, and
   `LiveQuery.loading` never reports loading again after that - so the day's
   `ReadGate` used to open on the day read alone, and the entry card's margin
   notes (and a dose row's drug name) landed a few frames later, inserting
   height under content that had already settled.

   Sampled from the document's first frame under a slowed CPU, the order a
   phone always sees and the desktop sweep only caught 6 of 6 runs in dark.

   Also checks that content stays visible when Android delivers the reveal's
   completion callback after its animation ends (ux-carpet ticket 290).

   Run against a demo build:
     VITE_DEMO=1 npm run build
     node tests/day-cold-load-yank.mjs [--runs 5] [--cpu 4] [--out <abs dir>]
   Exits 1 on any finding. */
import { preview } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium, settlePage } from './browser-harness.mjs';
import {
  DEMO_THEME_EXPRESSION,
  FILL_EVERY_FEATURE_EXPRESSION,
  INIT_HIDE_DEMO_SCRIPT,
  RESET_PERSONA_EXPRESSION,
  yesterdayEpochDay
} from './yank-sweep-core.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? args[at + 1] : fallback;
};
const RUNS = Number(flag('runs', '5'));
const CPU = Number(flag('cpu', '4'));
const THEME = flag('theme', 'dark');
const WINDOW_MS = 1800;
const outDir = resolve(flag('out', resolve(here, '../.claude/day-cold-load')));
await mkdir(outDir, { recursive: true });

const SCENES = [
  { name: 'day-today', path: '/day/today' },
  { name: 'day-yesterday', path: `/day/${yesterdayEpochDay()}` }
];

/* Installed before any of the app's own scripts, and armed only by the
   probe's own flag, so the persona setup loads are not sampled. Also stubs
   `navigator.storage.persist` - headless Chromium never grants it, and the
   "didn't grant persistent storage" toast fading in reads as a dropout to a
   naive sampler otherwise. */
const SAMPLER = `(() => {
  if (navigator.storage) {
    navigator.storage.persist = async () => true;
    navigator.storage.persisted = async () => true;
  }
  if (sessionStorage.getItem('day-probe') !== '1') return;
  /* Keep the real animation, but delay its completion callback as Android
     can under load. Its last painted frame must hold until the gate clears
     the CSS that hides the content before the reveal. */
  const animate = Element.prototype.animate;
  Element.prototype.animate = function(keyframes, options) {
    const animation = animate.call(this, keyframes, options);
    if (Array.isArray(keyframes) && keyframes[0]?.opacity === 0 && keyframes.at(-1)?.opacity === 1) {
      const finished = animation.finished;
      Object.defineProperty(animation, 'finished', {
        value: finished.then((result) => new Promise((resolve) => setTimeout(() => resolve(result), 80)))
      });
    }
    return animation;
  };
  const frames = [];
  window.__dayFrames = frames;
  const t0 = performance.now();
  const tick = (now) => {
    const add = document.querySelector('[data-add]');
    const era = document.querySelector('[data-start-era]');
    const card = document.querySelector('[data-day-card]');
    let opacity = card ? 1 : null;
    for (let node = card; node; node = node.parentElement) {
      opacity *= Number(getComputedStyle(node).opacity);
    }
    frames.push({
      at: Math.round(now - t0),
      skeleton: !!document.querySelector('.screen .skeleton-block'),
      card: !!card,
      opacity,
      noteLists: document.querySelectorAll('.margin-note-list').length,
      noteAdds: document.querySelectorAll('[data-margin-note-add]').length,
      add: add ? Math.round(add.getBoundingClientRect().top) : null,
      era: era ? Math.round(era.getBoundingClientRect().top) : null
    });
    if (now - t0 < ${WINDOW_MS}) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
})()`;

const browser = await launchChromium();
const app = await preview({ root: resolve(here, '..'), preview: { port: 0 } });
const base = `http://localhost:${app.httpServer.address().port}`;
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
await page.emulateMedia({ reducedMotion: args.includes('--reduced-motion') ? 'reduce' : 'no-preference' });
const errors = [];
page.on('pageerror', (err) => errors.push(String(err)));
await page.addInitScript(INIT_HIDE_DEMO_SCRIPT);
await page.addInitScript(SAMPLER);

await settlePage(page, base, '/', THEME);
if (!(await page.evaluate(RESET_PERSONA_EXPRESSION))) throw new Error('the persona reset never reached Home');
await page.evaluate(FILL_EVERY_FEATURE_EXPRESSION);
await page.waitForTimeout(1500);
await page.evaluate(DEMO_THEME_EXPRESSION(THEME));
await page.waitForTimeout(500);

/* The fixture's own margin notes are a seeded roll (demo-fixture-seeded-
   rolls-can-yield-nothing) - today or yesterday can land with none. Add one
   through the real UI, once, per scene, so the scene this probe measures
   reliably has what it needs rather than depending on the roll. */
for (const scene of SCENES) {
  await page.goto(`${base}${scene.path}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-day-card]', { timeout: 10000 }).catch(() => {});
  const already = await page.evaluate(() => document.querySelectorAll('.margin-note-list').length > 0);
  if (already) continue;
  const addBtn = page.locator('[data-margin-note-add]').first();
  if (!(await addBtn.count())) continue; // no entries this day - nothing to seed
  await addBtn.click();
  await page.fill('[data-margin-note-input]', `probe seed for ${scene.name}`);
  await page.click('[data-margin-note-save]');
  await page.waitForSelector('.margin-note-list');
}

const cdp = await page.context().newCDPSession(page);
const sceneResults = {};
let anyFailed = false;

for (const scene of SCENES) {
  const runs = [];
  for (let run = 0; run < RUNS; run += 1) {
    await page.evaluate(() => sessionStorage.setItem('day-probe', '1'));
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });
    await page.goto(`${base}${scene.path}`, { waitUntil: 'commit', timeout: 40000 });
    await page.waitForTimeout(WINDOW_MS + 400 * CPU);
    const frames = await page.evaluate(() => window.__dayFrames ?? []);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    await page.evaluate(() => sessionStorage.removeItem('day-probe'));

    /* The gate's own skeleton-to-content reveal (ticket 144's mechanism, not
       this ticket's) is a resize transition that a rAF sampler can catch
       mid-flight or read one tick ahead of the ResizeObserver that starts
       it - a known artifact (ticket 184's care mood card hit the same
       thing). Settled = at least 350ms of wall clock past the card's first
       frame, past the transition's own ~240ms. What this probe is actually
       after is a step in the settled region: the day's records changing
       shape once they are already on screen, which is what a chained read
       landing late looks like. */
    const cardFirstAt = frames.findIndex((f) => f.card);
    const settledFromMs = cardFirstAt >= 0 ? frames[cardFirstAt].at + 350 : Infinity;
    let worstAddStep = 0;
    let worstAddAt = null;
    let worstEraStep = 0;
    let worstEraAt = null;
    for (let i = 1; i < frames.length; i += 1) {
      const a = frames[i - 1];
      const b = frames[i];
      if (b.at < settledFromMs) continue;
      if (a.add !== null && b.add !== null) {
        const step = Math.abs(b.add - a.add);
        if (step > worstAddStep) {
          worstAddStep = step;
          worstAddAt = b.at;
        }
      }
      if (a.era !== null && b.era !== null) {
        const step = Math.abs(b.era - a.era);
        if (step > worstEraStep) {
          worstEraStep = step;
          worstEraAt = b.at;
        }
      }
    }
    /* A note-list count that grows after the card's own first frame: notes
       that arrived after the entries did - the bug this ticket names. The
       add button's own step on that exact frame is the size of the pop it
       causes, reported regardless of the "settled" window above (this one
       is the opposite case: a chained read landing so soon after the day
       read that it is gone before that window even starts). */
    const noteListsAtCard = cardFirstAt >= 0 ? frames[cardFirstAt].noteLists : 0;
    const noteFrameIdx = frames.findIndex((f, i) => i > cardFirstAt && f.noteLists > noteListsAtCard);
    const noteListsLater = Math.max(0, ...frames.map((f) => f.noteLists)) - noteListsAtCard;
    let addStepAtNote = 0;
    if (noteFrameIdx > 0) {
      const a = frames[noteFrameIdx - 1];
      const b = frames[noteFrameIdx];
      if (a.add !== null && b.add !== null) addStepAtNote = Math.abs(b.add - a.add);
    }

    const firstCard = frames.find((f) => f.card)?.at ?? null;
    const firstVisible = frames.findIndex((f) => f.opacity >= 0.98);
    const dropouts = firstVisible < 0 ? [] : frames.slice(firstVisible + 1).filter((f) => f.opacity === null || f.opacity < 0.5);
    runs.push({
      run,
      frames: frames.length,
      firstCard,
      visible: firstVisible >= 0,
      dropouts: dropouts.length,
      worstAddStep,
      worstAddAt,
      worstEraStep,
      worstEraAt,
      noteListsAtCard,
      noteListsLater,
      addStepAtNote
    });
    console.log(
      `${scene.name} run ${run + 1}: ${frames.length} frames, card at ${firstCard}ms, ` +
        `worst settled add-button step ${worstAddStep}px at ${worstAddAt}ms, ` +
        `${dropouts.length} dropout frame(s) after becoming visible, ` +
        `${noteListsAtCard} note-list(s) with the card, ${noteListsLater} arriving later ` +
        `(add button stepped ${addStepAtNote}px when it did)`
    );
    await writeFile(`${outDir}/${scene.name}-run-${run + 1}.frames.json`, JSON.stringify(frames));
  }
  sceneResults[scene.name] = runs;
  const cardless = runs.filter((r) => r.firstCard === null).length;
  const failed = runs.filter((r) => !r.visible || r.worstAddStep >= 24 || r.worstEraStep >= 24 || r.noteListsLater > 0 || r.dropouts > 0).length;
  if (cardless) console.log(`${scene.name}: ${cardless} run(s) never drew the day card - not a measurement`);
  console.log(`${scene.name}: ${failed} of ${runs.length} run(s) with a finding`);
  if (failed || cardless) anyFailed = true;
}

await page.close();
await browser.close();
await app.close();

await writeFile(`${outDir}/report.json`, JSON.stringify({ cpu: CPU, scenes: sceneResults, errors }, null, 2));
if (errors.length) {
  console.log('page errors:', errors);
  anyFailed = true;
}
console.log(`\n${outDir}/report.json`);
if (anyFailed) process.exitCode = 1;
