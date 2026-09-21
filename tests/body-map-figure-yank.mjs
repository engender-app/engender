/* The no-yank proof for the body map's redrawn figure (phase 11 ticket 47).

   Two appearances happen on this component and the ticket's clause binds
   both: the panels arriving, and an ink edge moving from one panel to
   another when a region is picked. A yank is Alicja's own word and it has a
   mechanical test - "things teleporting/disappearing in 1 frame" - so
   nothing may be painted at its destination before it travelled there, and
   there may be no frame in which something is in neither place.

   Nothing on this figure moves, which is the point: a panel is a piece of
   the body and two regions are not adjacent the way tabs are, so the
   arrival is the clip band widening and the selection is an edge growing
   from nothing. That makes the sampled properties the widths rather than
   the positions - but the positions are sampled too, because "nothing
   moves" is a claim and not an assumption.

   Run: node tests/body-map-figure-yank.mjs [--out <abs dir>]
   Writes yank.json and prints a verdict per scene. */
import { createServer } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './browser-harness.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const at = args.indexOf('--out');
const outDir = resolve(at >= 0 ? args[at + 1] : resolve(here, '../.claude/ticket47'));
await mkdir(outDir, { recursive: true });

const server = await createServer({
  configFile: `${here}/browser-tier/browser-tier.vite.config.ts`,
  server: { port: 0 }
});
await server.listen();
const port = server.config.server.port;

const browser = await launchChromium();
const page = await browser.newPage({ viewport: { width: 1200, height: 1400 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (err) => errors.push(String(err)));

/* One frame of the saturated scene: every clip band's width, every picked
   edge's stroke width, and every panel's box. A rAF sampler reads before a
   ResizeObserver callback in the same frame, so the pixels are the
   authority on what was painted - these samples are the authority on the
   curves. */
const SAMPLE = `(() => new Promise((done) => {
  const frames = [];
  const scene = document.querySelector('[data-scene-figure="saturated"]');
  const read = (t) => {
    const row = { t: Math.round(t) };
    for (const clip of scene.querySelectorAll('clipPath')) {
      /* Only the region bands. The figure's other clip path is the body
         itself, which is a path and has no width to animate. */
      if (!clip.id.includes('-band-')) continue;
      const rect = clip.querySelector('rect');
      const id = clip.id.replace(/^.*-band-/, '');
      /* The computed width rather than a box: a clipPath's children are not
         rendered, so they have no box - and the width is what the arrival
         animates, as a CSS geometry property. */
      row['w:' + id] = parseFloat(getComputedStyle(rect).width);
    }
    for (const edge of scene.querySelectorAll('[data-region-edge]')) {
      const id = edge.dataset.regionEdge;
      row['pick:' + id] = parseFloat(getComputedStyle(edge.querySelector('.region-pick')).strokeWidth);
      row['band:' + id] = parseFloat(getComputedStyle(edge.querySelector('.region-pick-band')).strokeWidth);
    }
    for (const art of scene.querySelectorAll('[data-region-art]')) {
      const box = art.getBoundingClientRect();
      row['x:' + art.dataset.regionArt] = Math.round(box.x * 10) / 10;
      row['y:' + art.dataset.regionArt] = Math.round(box.y * 10) / 10;
    }
    frames.push(row);
  };
  const started = performance.now();
  const tick = (now) => {
    try {
      read(now - started);
    } catch (err) {
      /* A throw inside a frame callback is swallowed, and the promise this
         sampler hands back would never settle: the run hangs with nothing
         on stdout. Report it as a frame instead. */
      done([{ error: String(err) }]);
      return;
    }
    if (now - started < 900) requestAnimationFrame(tick);
    else done(frames);
  };
  requestAnimationFrame(tick);
}))()`;

const scenes = {};

/* The arrival. Reloading is the only honest way to see it: the animation
   runs once, on the frame the panels are first painted. */
await page.goto(`http://localhost:${port}/body-map.html`, { waitUntil: 'commit' });
await page.waitForSelector('[data-scene-figure="saturated"] .region-art', { state: 'attached', timeout: 20000 });
scenes.arrival = await page.evaluate(SAMPLE);

await page.waitForTimeout(600);
/* A selection change, to a region that is not next to the one leaving:
   "no travelling indicator between regions" is most visible where a pill
   would have had furthest to fly. */
const clicked = page.evaluate(SAMPLE);
await page.locator('[data-scene-figure="saturated"] [data-region="hairline"]').click();
scenes.select = await clicked;

await browser.close();
await server.close();

for (const [name, rows] of Object.entries(scenes)) {
  if (rows.length === 1 && rows[0].error) {
    console.log(`${name}: the sampler threw - ${rows[0].error}`);
    process.exitCode = 1;
  }
}

const keys = (rows, prefix) =>
  [...new Set(rows.flatMap((row) => Object.keys(row)))].filter((key) => key.startsWith(prefix));

/* A yank, mechanically: a property that reaches its destination in one
   frame from nowhere near it. Anything under a third of its own travel in
   one frame is a curve; a single frame carrying more than that is a jump. */
const verdict = {};
for (const [name, rows] of Object.entries(scenes)) {
  const findings = [];
  for (const prefix of ['w:', 'pick:', 'band:']) {
    for (const key of keys(rows, prefix)) {
      const series = rows.map((row) => row[key]).filter((v) => typeof v === 'number');
      if (!series.length) continue;
      const travel = Math.max(...series) - Math.min(...series);
      if (travel === 0) continue;
      let steps = 0;
      let worst = 0;
      for (let i = 1; i < series.length; i += 1) {
        const step = Math.abs(series[i] - series[i - 1]);
        worst = Math.max(worst, step);
        if (step > travel / 3) steps += 1;
      }
      const frames = series.filter((v, i) => i === 0 || v !== series[i - 1]).length;
      if (steps > 0 || frames < 4) {
        findings.push({
          key,
          travel: Math.round(travel * 100) / 100,
          worstStep: Math.round(worst * 100) / 100,
          changedFrames: frames
        });
      }
    }
  }
  /* Nothing on this figure moves, and a position that changed would mean
     something travelled that was supposed to grow in place. */
  const moved = [];
  for (const key of [...keys(rows, 'x:'), ...keys(rows, 'y:')]) {
    const series = rows.map((row) => row[key]).filter((v) => typeof v === 'number');
    const spread = Math.max(...series) - Math.min(...series);
    if (spread > 0.5) moved.push({ key, spread });
  }
  /* How many of the sampled properties actually travelled. A sweep that
     found nothing because nothing animated is not a pass, and a property
     that never moves is skipped above rather than reported. */
  const travelled = [];
  for (const prefix of ['w:', 'pick:', 'band:']) {
    for (const key of keys(rows, prefix)) {
      const series = rows.map((row) => row[key]).filter((v) => typeof v === 'number');
      if (Math.max(...series) - Math.min(...series) > 0.01) travelled.push(key);
    }
  }

  /* And the other half of the clause: no frame in which the ink edge is in
     neither place. It leaves one panel while it arrives on another, so some
     panel carries some of it in every frame of the change. */
  const gone = rows.filter((row) => {
    const widths = keys(rows, 'pick:').map((key) => row[key] ?? 0);
    return widths.length > 0 && Math.max(...widths) === 0;
  }).length;

  verdict[name] = { frames: rows.length, travelled, findings, moved, framesWithNoEdge: gone };
  console.log(
    `${name}: ${rows.length} frames, ${travelled.length} properties travelled, ${findings.length} yanks, ${moved.length} things that moved`
  );
  if (name === 'select') console.log(`  frames with the edge in neither place: ${gone}`);
  for (const f of findings) {
    console.log(
      `  YANK ${f.key} travelled ${f.travel} with a ${f.worstStep} step over ${f.changedFrames} frames`
    );
  }
  for (const m of moved) console.log(`  MOVED ${m.key} by ${m.spread.toFixed(1)}px`);
}

if (errors.length) console.log('page errors:', errors);
await writeFile(`${outDir}/yank.json`, JSON.stringify({ verdict, scenes }, null, 2));
console.log(`\n${outDir}/yank.json`);
