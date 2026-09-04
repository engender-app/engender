/* Browser-tier check for the own-series trends (phase 8 features ticket 29,
   ADR-0060, ADR-0061), the half no Node test can reach.

   What is only provable here: that a change of capture chain arrives on
   screen as a visible break with a sentence in it. The Node tier proves the
   runs and the reasons as data (charts/ownSeries.test.ts); only a rendered
   card can say that the runs became two separate plots, that the words
   between them are the reason for the gap rather than an empty element, and
   that switching the figure through the card's own picker redraws it.

   The other claim is a negative one, and it is the reason this ticket has a
   browser check at all: none of these plots may carry a band, a shaded
   target region or a worse-to-better colour ramp. ADR-0060 forbids all
   three on these five figures, and the surface that could break the rule is
   the markup rather than the arithmetic - the pitch figure next door draws
   bands from the same kit, so "no band anywhere in this card" is a claim
   about what was rendered.

   The card is mounted three times over made-up benchmarks: one history
   spanning two chains, one journal holding a single benchmark, and one
   whose takes all skipped the held vowel so the vowel figures have no
   readings at all. The figures are invented here rather than measured -
   what is under test is the drawing, not the acoustics. */

import { flushSync, mount } from 'svelte';
import '$lib/theme/fonts.css';
import '$lib/theme/base.css';
import '$lib/theme/palettes.css';
import '$lib/styles/app.css';
import '$lib/styles/kit.css';
import '$lib/styles/components.css';
import '$lib/styles/screens.css';
import '$lib/motion/press.css';
import { captureChainOf } from '$lib/audio/captureChain';
import type { BenchmarkForSeries } from '$lib/charts/ownSeries';
import { OWN_SERIES_METRICS } from '$lib/data/voice/metrics';
import { readFlagRoles, roleAt } from '$lib/theme/roles';
import VoiceOwnSeries from '$lib/components/VoiceOwnSeries.svelte';
import { publish } from '../probe-handshake.mjs';

const NAME = 'voice-own-series-probe';

const UNPROCESSED = { echoCancellation: false, noiseSuppression: false, autoGainControl: false };
const PIXEL = captureChainOf('Pixel 10a', 'Bottom microphone', UNPROCESSED);
const SAMSUNG = captureChainOf('SM-A546B', 'Bottom microphone', UNPROCESSED);

/** A benchmark, with every figure measured unless a case says otherwise.
    The values move with the day so a plot's own direction is readable. */
function take(epochDay: number, chain: string | null, over: Partial<BenchmarkForSeries> = {}): BenchmarkForSeries {
  return {
    epochDay,
    passageKey: 'rainbow',
    captureChain: chain,
    f0P10Hz: 150 + epochDay / 20,
    f0P90Hz: 230 + epochDay / 10,
    semitoneSd: 2.4 + epochDay / 400,
    wordsPerMinute: 138 + epochDay / 30,
    f1Hz: 620 + epochDay / 8,
    f2Hz: 1740 + epochDay / 3,
    snrDb: 22 + epochDay / 60,
    ...over
  };
}

/* Three takes on one phone, then two on another: one break, and a run on
   each side of it long enough to be a line rather than a mark. */
const HISTORY = [
  take(0, PIXEL),
  take(45, PIXEL),
  take(96, PIXEL),
  take(150, SAMSUNG),
  take(205, SAMSUNG)
];

function card(target: HTMLElement, benchmarks: BenchmarkForSeries[]) {
  const roles = readFlagRoles();
  mount(VoiceOwnSeries, {
    target,
    props: { benchmarks, role: roleAt(roles, 0), pairedRole: roleAt(roles, 1) }
  });
}

/** What one card is showing: the plots, the breaks between them, and every
    way a band could have got onto it. */
function read(root: HTMLElement) {
  const plots = [...root.querySelectorAll('[data-chart="area"]')];
  return {
    plots: plots.length,
    /* Marks per plot, so "two plots" is two lines rather than one line and
       one empty box. A path with no `d` is an empty plot. */
    lines: plots.map((plot) => [...plot.querySelectorAll('.kit-area-line')].filter((path) => (path.getAttribute('d') ?? '').length > 10).length),
    breaks: [...root.querySelectorAll('[data-own-break]')].map((note) => ({
      reason: note.getAttribute('data-own-break'),
      text: (note.textContent ?? '').trim()
    })),
    /* Every band-shaped thing the voice screens can draw, and the heat ramp
       a worse-to-better colour would come from. All of it has to be absent
       (ADR-0060). */
    bandLike: root.querySelectorAll(
      '[data-pitch-band], [data-pitch-middle], [data-pitch-comfort], [class*="band"], [class*="heat"]'
    ).length,
    /** The ends of the scale as the card prints them, which is where the
        native unit shows up without a pointer on the plot. */
    gutters: [...root.querySelectorAll('[data-chart-scale]')].map((scale) =>
      (scale.textContent ?? '').replace(/\s+/g, ' ').trim()
    ),
    legends: [...root.querySelectorAll('[data-chart-legend]')].map((legend) =>
      (legend.textContent ?? '').replace(/\s+/g, ' ').trim()
    ),
    /** What the plot says under a finger, which for a pair of lines placed
        against two ranges is the only place a number appears at all - the
        gutter is gone there by design (kit/AreaChart.svelte). */
    readouts: [...root.querySelectorAll('[data-chart-readout]')].map((readout) =>
      (readout.textContent ?? '').replace(/\s+/g, ' ').trim()
    ),
    empty: (root.querySelector('.kit-chart-empty')?.textContent ?? '').trim(),
    unmeasured: (root.querySelector('.vos-unmeasured')?.textContent ?? '').trim(),
    reference: root.querySelector<HTMLAnchorElement>('.vos-more a')?.getAttribute('href') ?? null
  };
}

/** Picks a figure through the card's own control, the way a finger does.

    Then waits: switching the figure fades the outgoing value gutter out
    rather than cutting it, so a read taken in the same frame would find the
    previous figure's units still on the card. */
async function pick(root: HTMLElement, key: string) {
  const select = root.querySelector<HTMLSelectElement>('[data-chart-picker="voice-own-figure"]')!;
  select.value = key;
  select.dispatchEvent(new Event('change', { bubbles: true }));
  flushSync();
  await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
}

/** Long enough for the chart's own transitions to finish - --dur-slow is
    the longest of them, and the gutter's fade is shorter. */
const SETTLE_MS = 600;

/** Puts a finger on the middle of every plot, which is what makes the scrub
    readout appear. The chart reads the pointer's own x against the plot's
    box, so the event has to carry a real coordinate. */
function scrub(root: HTMLElement) {
  for (const plot of root.querySelectorAll('[data-chart="area"]')) {
    const box = plot.getBoundingClientRect();
    plot.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        clientX: box.left + box.width / 2,
        clientY: box.top + box.height / 2
      })
    );
  }
  flushSync();
}

async function run() {
  const series = document.querySelector<HTMLElement>('#series')!;
  const single = document.querySelector<HTMLElement>('#single')!;
  const unmeasured = document.querySelector<HTMLElement>('#unmeasured')!;

  card(series, HISTORY);
  card(single, [take(0, PIXEL)]);
  /* Every take skipped the held vowel, so the two figures that come off it
     have no readings at all - a different empty card from "one take so
     far". */
  card(unmeasured, HISTORY.map((benchmark) => ({ ...benchmark, f1Hz: null, f2Hz: null, snrDb: null })));

  const offered = [
    ...series.querySelectorAll<HTMLOptionElement>('[data-chart-picker="voice-own-figure"] option')
  ].map((option) => option.value);

  /* The figure the card opens on, then each of the others through the
     picker: what is read back is the card after a real pick, so a figure
     that draws nothing would show up as a plot count of zero. */
  const figures: Record<string, ReturnType<typeof read>> = {};
  for (const metric of OWN_SERIES_METRICS) {
    await pick(series, metric.key);
    scrub(series);
    figures[metric.key] = read(series);
  }

  await pick(unmeasured, 'room');

  return {
    offered,
    registered: OWN_SERIES_METRICS.map((metric) => metric.key),
    figures,
    single: read(single),
    neverMeasured: read(unmeasured)
  };
}

run().then(
  (result) => publish(NAME, result),
  (error) => publish(NAME, { error: String(error?.message ?? error) })
);
