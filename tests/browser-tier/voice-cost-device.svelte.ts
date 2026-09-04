/* What the live pitch figure costs to keep up to date, on a real phone
   (phase 8 features ticket 09).

   The ticket says the hundred-millisecond poll may only change against a
   measurement rather than quietly, and that the measurement is taken on the
   Pixel rather than in an emulator - both emulators run with the GPU
   disabled, so no rendering answer can come from one at all.

   Why this is a page rather than a driven browser. The app sets
   FLAG_SECURE, so a screencap of it is black, and the phone's browser
   exposes no devtools socket to read numbers back through. So the page does
   its own arithmetic and prints it in type big enough to photograph, which
   is the pattern this repo already uses for on-device evidence.

   What is measured: the heaviest thing the figure ever draws, updated at
   the real cadence. Both cited ranges, the region between them, four gutter
   numbers, a comfort bracket, the run bar, the caption, and a 200-frame
   trace - replaced wholesale every 100 ms, which is what one poll does.
   The trace is synthesized rather than captured: this is the cost of
   drawing a reading, and the microphone would only add noise to that
   question (the capture path itself is voice-benchmark-probe.ts's).

   Reported against the device's own frame interval rather than against
   16.7 ms. A Pixel 10a runs its panel at 120 Hz when nothing throttles it,
   so the budget worth knowing is the one the phone is actually keeping. */
import { mount } from 'svelte';
import '$lib/theme/fonts.css';
import '$lib/theme/base.css';
import '$lib/theme/palettes.css';
import '$lib/styles/app.css';
import '$lib/styles/components.css';
import '$lib/styles/screens.css';
import '$lib/styles/kit.css';
import '$lib/motion/press.css';
import '$lib/motion/materials.css';
import { refreshActiveFlag } from '$lib/theme/activeFlag.svelte';
import type { PitchFrame } from '$lib/audio/pitch';
import type { QualityReport } from '$lib/audio/quality';
import VoiceGauge from '$lib/components/VoiceGauge.svelte';

const POLL_MS = 100;
const TRACE_FRAMES = 200;
const SAMPLE_SECONDS = 8;

document.documentElement.dataset.palette = 'trans';
document.documentElement.dataset.theme = 'dark';
refreshActiveFlag();

const host = document.querySelector('#figure')!;
const readout = document.querySelector('#readout')!;

/** A trace that moves the way a read passage does, so the polyline really
    is re-diffed rather than handed back an identical string. */
function traceAt(tick: number): PitchFrame[] {
  const frames: PitchFrame[] = [];
  for (let i = 0; i < TRACE_FRAMES; i++) {
    const at = (tick * TRACE_FRAMES + i) * 0.01;
    // Around 190 Hz, sliding by three semitones, with a gap every second so
    // the trace is drawn as several polylines rather than one.
    const voiced = i % 100 < 88;
    frames.push({
      atSeconds: at,
      hz: voiced ? 190 * 2 ** ((Math.sin(at * 1.7) * 3) / 12) : null
    });
  }
  return frames;
}

const report = (tick: number): QualityReport => ({
  peak: 0.6 + Math.sin(tick / 7) * 0.2,
  snrDb: 22 + Math.sin(tick / 5) * 4,
  voicedSeconds: 2,
  longestVoicedSeconds: 1.1 + (tick % 20) / 20,
  f0Cv: 0.03,
  failed: [],
  passed: true
});

let tick = 0;
let frames = $state<PitchFrame[]>(traceAt(0));
let reading = $state<QualityReport>(report(0));

mount(VoiceGauge, {
  target: host,
  props: {
    get frames() {
      return frames;
    },
    get report() {
      return reading;
    },
    targetSeconds: 1.5,
    label: 'device cost probe',
    advice: [],
    comfort: { lowHz: 200, highHz: 235 },
    language: 'en'
  }
});

const poll = setInterval(() => {
  tick += 1;
  frames = traceAt(tick);
  reading = report(tick);
}, POLL_MS);

/* Sampling starts a second in, so the first paint and the font swap are not
   counted as jank in a figure that is only being asked about steady state. */
const deltas: number[] = [];
setTimeout(() => {
  /* Seeded from the first frame's own timestamp rather than from
     performance.now(): a rAF timestamp is the moment the frame began, which
     can be *before* the call that scheduled it, and seeding from the clock
     produced a negative first delta - which then read as the fastest frame
     on the panel and inferred a 120 Hz budget the phone was not keeping. */
  let last: number | null = null;
  let start: number | null = null;
  const sample = (now: number) => {
    if (last !== null) deltas.push(now - last);
    last = now;
    start ??= now;
    if (now - start < SAMPLE_SECONDS * 1000) requestAnimationFrame(sample);
    else finish();
  };
  requestAnimationFrame(sample);
}, 1000);

function finish() {
  clearInterval(poll);
  const sorted = [...deltas].sort((a, b) => a - b);
  const at = (fraction: number) => sorted[Math.min(sorted.length - 1, Math.floor(fraction * sorted.length))];
  /* The panel's own interval, taken as the median rather than the minimum:
     the budget worth reporting is the one this phone is actually keeping,
     and one anomalous short frame should not decide it. A dropped frame is
     one that took half again as long as that. */
  const interval = at(0.5);
  const over = sorted.filter((delta) => delta > interval * 1.5).length;
  const hz = Math.round(1000 / interval);

  readout.innerHTML = `
    <dl>
      <div><dt>frames</dt><dd>${sorted.length}</dd></div>
      <div><dt>panel</dt><dd>${hz} Hz</dd></div>
      <div><dt>median</dt><dd>${interval.toFixed(2)} ms</dd></div>
      <div><dt>p95</dt><dd>${at(0.95).toFixed(2)} ms</dd></div>
      <div><dt>worst</dt><dd>${sorted[sorted.length - 1].toFixed(2)} ms</dd></div>
      <div><dt>jitter</dt><dd>${(sorted[sorted.length - 1] - interval).toFixed(2)} ms</dd></div>
      <div><dt>dropped</dt><dd>${over} of ${sorted.length}</dd></div>
    </dl>`;
  document.body.setAttribute('data-cost-ready', '');
}
