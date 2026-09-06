/* What a batch arriving costs to animate, on a real phone (phase 8 features
   ticket 68).

   The ticket's question: `resize` (src/lib/motion/reveal.ts) is wired onto
   the wrapper ticket 66 built, and the wrapper's height travels roughly
   2000px over --dur-med (240ms) each time a batch of 30 rows renders. That
   is a much bigger jump than `resize` was built for - a notice's box going
   from 181px to 118px - and the question is whether it is still affordable
   here, on the device tier, while a finger is still moving the list.

   Why a page rather than a driven browser: the app sets FLAG_SECURE, so a
   screencap of it is black, and the phone's browser exposes no devtools
   socket to read numbers back through. So the page drives its own scroll,
   does its own arithmetic, and prints the readout in type large enough to
   photograph - the pattern this repo already uses for on-device evidence
   (voice-cost-device.svelte.ts).

   What is driven: a continuous scroll across two batch boundaries, not one
   batch in isolation - a finger flicking through a long list does not pause
   between one arrival and the next, and the ticket asks whether the two
   animations' tails can overlap without dropping frames. The scroll runs at
   three screen heights a second, an ordinary fast flick, computed from the
   region's own height rather than a hardcoded pixel rate.

   Frames are sampled for the whole drive, not just the two animation
   windows, matching the constellation and voice probes' own choice to
   report the worst the interaction produced rather than only its authored
   part.

   Seeded from the first requestAnimationFrame timestamp rather than from
   performance.now(), and the panel interval taken as the median of the
   deltas rather than the minimum - both the on-device measurement's own
   documented traps (a rAF timestamp can precede the call that scheduled
   it, which reads as a faster panel than the phone is actually keeping).

   Ticket 68 concluded `resize` should not ship on `BatchedList`'s wrapper
   (a structural conflict with the growth sentinel, unrelated to frame
   cost - see the ticket file), so `BatchedList.svelte` carries no
   `use:resize` today and this probe, run as committed, measures a batch
   arriving with no animation at all. To reproduce the numbers the ticket
   recorded, temporarily add `use:resize` to the div wrapping `ListCard` in
   `BatchedList.svelte` before running this file, and revert it after. */
import { mount } from 'svelte';
import '$lib/theme/fonts.css';
import '$lib/theme/base.css';
import '$lib/theme/palettes.css';
import '$lib/styles/app.css';
import '$lib/styles/components.css';
import '$lib/styles/kit.css';
import { refreshActiveFlag } from '$lib/theme/activeFlag.svelte';
import { BATCH } from '$lib/components/kit/batchedList';
import Fixture from './batched-list-cost-fixture.svelte';

const TOTAL = BATCH * 20; // generous: a few batches auto-render before layout settles (see `settled` below).
const SCREENS_PER_SECOND = 3;
const TAIL_MS = 700; // >2x --dur-med (240ms), so the second animation's tail is inside the sample.
const MAX_MS = 20000; // safety cutoff if fewer than two boundaries are ever crossed.

document.documentElement.dataset.palette = 'trans';
document.documentElement.dataset.theme = 'dark';
refreshActiveFlag();

const items = Array.from({ length: TOTAL }, (_, index) => ({
  id: `row-${index}`,
  title: `Session ${index + 1} · 2h 14m`,
  subtitle: `2026-0${(index % 9) + 1}-1${(index % 27) + 1} · a note about how it went`
}));

const host = document.querySelector<HTMLElement>('#region')!;
mount(Fixture, { target: host, props: { items } });

// Hidden (batched-list-cost-device.html's default) until finish() below
// reveals it - shown early would just be an empty <dl> over the list.
const readout = document.querySelector<HTMLElement>('#readout')!;

const region = document.querySelector<HTMLElement>('[data-app-scroll-region]')!;
const rowCount = () => document.querySelectorAll('[data-probe-row]').length;

/** Waits until the rendered row count stops moving on its own - after the
    initial mount (fonts still swapping in) and after each forced jump below,
    where the observer keeps firing for a frame or two after the DOM change
    it is reacting to. Polled on rAF rather than on a timer: the observer's
    own callback is batched against layout, on the same cadence, so a timer
    can read "stable" in the gap between two still-pending grows. */
async function settled(): Promise<void> {
  await document.fonts.ready;
  await new Promise<void>((resolve) => {
    let last = -1;
    let stableFrames = 0;
    const check = () => {
      const count = rowCount();
      stableFrames = count === last ? stableFrames + 1 : 0;
      last = count;
      if (stableFrames >= 60) resolve();
      else requestAnimationFrame(check);
    };
    requestAnimationFrame(check);
  });
}

await settled();

/* Warmed up to five batches ahead of the drive, unmeasured, so the timed
   pass below starts from a long list already in the middle of itself -
   scrolled from rest, with real content on both sides of the sentinel -
   rather than from the short initial render, where the physical scroll max
   sits only one screen down and the drive would hit two boundaries almost
   the instant it started rather than by covering any real distance. */
const WARMUP_BATCHES = 5;
while (rowCount() < WARMUP_BATCHES * BATCH && rowCount() < TOTAL) {
  region.scrollTop = region.scrollHeight;
  await settled();
}
// Backed off to leave three screens of headroom before the sentinel, so the
// timed drive below has real ground to cover before it crosses a boundary.
region.scrollTop = Math.max(0, region.scrollHeight - region.clientHeight * 3);
await settled();

{
  const velocityPxPerMs = (region.clientHeight * SCREENS_PER_SECOND) / 1000;
  const startCount = rowCount();

  let boundariesCrossed = 0;
  let lastCount = startCount;
  let secondBoundaryAt: number | null = null;

  const deltas: number[] = [];
  let last: number | null = null;
  let start: number | null = null;

  function tick(now: number) {
    if (last !== null) deltas.push(now - last);
    const dt = last === null ? 0 : now - last;
    last = now;
    start ??= now;
    const elapsed = now - start;

    const count = rowCount();
    if (count > lastCount) {
      boundariesCrossed += 1;
      lastCount = count;
      if (boundariesCrossed === 2) secondBoundaryAt = elapsed;
    }

    const doneOnBoundaries = secondBoundaryAt !== null && elapsed - secondBoundaryAt >= TAIL_MS;
    const exhausted = count === TOTAL && elapsed > TAIL_MS;
    if (doneOnBoundaries || exhausted || elapsed > MAX_MS) {
      finish(boundariesCrossed, count);
      return;
    }

    region.scrollTop += velocityPxPerMs * dt;
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  function finish(crossed: number, finalCount: number) {
    const sorted = [...deltas].sort((a, b) => a - b);
    const at = (fraction: number) => sorted[Math.min(sorted.length - 1, Math.floor(fraction * sorted.length))];
    // The panel's own interval, taken as the median rather than the minimum
    // - see this file's own header on why the minimum is the wrong number.
    const interval = at(0.5);
    const over = sorted.filter((delta) => delta > interval * 1.5).length;
    const hz = Math.round(1000 / interval);

    const row = (label: string, value: string) => `<div><dt>${label}</dt><dd>${value}</dd></div>`;
    readout.innerHTML = `<dl>${[
      row('rows rendered', `${startCount} &rarr; ${finalCount} of ${TOTAL}`),
      row('boundaries crossed', `${crossed}`),
      row('frames sampled', `${sorted.length}`),
      row('panel', `${hz} Hz`),
      row('median frame', `${interval.toFixed(2)} ms`),
      row('p95 frame', `${at(0.95).toFixed(2)} ms`),
      row('worst frame', `${sorted[sorted.length - 1].toFixed(2)} ms`),
      row('dropped (>1.5x)', `${over} of ${sorted.length}`)
    ].join('')}</dl>`;
    readout.style.display = 'block';
    document.body.setAttribute('data-cost-ready', '');
  }
}
