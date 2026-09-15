/* Browser-tier check for the pitch density and the figure blocks (redesign
   ticket 42), the half no Node test can reach.

   density.test.ts proves the arithmetic: that a tenth of the shape's area
   lies below the p10 mark, and that a five-second read is not a comb. What
   it cannot say is where any of that landed on a drawn figure, and four of
   this ticket's claims are about exactly that:

   - a take with no stored track draws its sentence and no empty shape,
     which is the same rule a trackless take's trace already follows;
   - a first benchmark draws six values and no history plot anywhere, so
     there is no empty chart on the screen;
   - a change of capture chain takes the history off every figure at once
     (ADR-0061), not only off the ones the compare tab happens to draw;
   - the density carries the ink rule 9 gives a series, the spine the ink it
     gives a guide, and the bands stay on the pitch figure and nowhere near
     a figure block (ADR-0059, ADR-0060).

   Each of those is a question about the rendered tree or about a computed
   style, so they live here. */

import { mount } from 'svelte';
import '$lib/theme/fonts.css';
import '$lib/theme/base.css';
import '$lib/theme/palettes.css';
import '$lib/styles/app.css';
import '$lib/styles/kit.css';
import '$lib/styles/components.css';
import '$lib/styles/screens.css';
import '$lib/motion/press.css';
import { encodePitchTrack } from '$lib/audio/track';
import { readFlagRoles, roleAt } from '$lib/theme/roles';
import VoiceTake from '$lib/components/VoiceTake.svelte';
import VoiceFigures from '$lib/components/VoiceFigures.svelte';
import { publish } from '../probe-handshake.mjs';

const NAME = 'voice-density-probe';

/** A read: thirty seconds at the stored four points a second, wandering
    around a median the way speech does. Deterministic, so a failure here is
    the same failure twice. */
function track(medianHz: number, seed: number): string {
  let value = seed;
  const random = () => {
    value = (value * 1103515245 + 12345) % 2147483648;
    return value / 2147483648;
  };
  const points: number[] = [];
  let semitones = 0;
  for (let at = 0; at < 120; at++) {
    semitones = semitones * 0.84 + (random() - 0.5) * 2.2;
    points.push(medianHz * 2 ** (semitones / 12));
  }
  return encodePitchTrack(points)!;
}

const FIGURES = {
  f0MedianHz: 178,
  f0P10Hz: 152,
  f0P90Hz: 205,
  semitoneSd: 2.4,
  wordsPerMinute: 148
};

const CHAIN = 'Pixel|Microphone|ec=off ns=off agc=off';
const OTHER_CHAIN = 'Pixel 10a|Microphone|ec=off ns=off agc=off';

const take = (epochDay: number, captureChain: string, at: number) => ({
  epochDay,
  passageKey: 'builtin-en',
  captureChain,
  f0P10Hz: 150 + at,
  f0P90Hz: 200 + at * 2,
  semitoneSd: 2.2 + at * 0.1,
  wordsPerMinute: 140 + at * 3,
  f1Hz: 600 + at * 8,
  f2Hz: 1700 + at * 12,
  snrDb: 22 + at,
  resonanceScale: 0.95 + at * 0.01
});

/** What one mounted figure list says about itself. */
function figuresIn(root: string) {
  const blocks = [...document.querySelectorAll(`${root} .vf-grid [data-figure]`)];
  return {
    blocks: blocks.length,
    /* Every block states a figure, measured or not: a block with no value
       is the empty row this layout replaced. */
    stated: blocks.filter((block) => (block.querySelector('.vf-value')?.textContent ?? '').trim())
      .length,
    lines: document.querySelectorAll(`${root} .vf-run`).length,
    rings: document.querySelectorAll(`${root} .vf-ring`).length,
    /* No history plot may carry a reference band: ADR-0059 allows those on
       the pitch figure and on nothing else, and a band behind a sparkline
       would be a published range for a figure that has none. */
    bands: document.querySelectorAll(`${root} .vf-line rect, ${root} .vf-line .pf-band`).length,
    against: [...document.querySelectorAll(`${root} .vf-against`)].map((line) =>
      (line.textContent ?? '').trim()
    ),
    /* The one figure with a block behind its value (rule 3). */
    pitchBlocks: document.querySelectorAll(`${root} .vf-pitch-block`).length
  };
}

try {
  const role = roleAt(readFlagRoles(), 0);

  mount(VoiceTake, {
    target: document.querySelector('#drawn')!,
    props: {
      pitchTrack: track(178, 20260914),
      medianHz: FIGURES.f0MedianHz,
      p10Hz: FIGURES.f0P10Hz,
      p90Hz: FIGURES.f0P90Hz,
      language: 'en' as const,
      role
    }
  });

  mount(VoiceTake, {
    target: document.querySelector('#trackless')!,
    props: {
      pitchTrack: null,
      medianHz: FIGURES.f0MedianHz,
      p10Hz: FIGURES.f0P10Hz,
      p90Hz: FIGURES.f0P90Hz,
      language: 'en' as const,
      role
    }
  });

  /* Three histories, one figure list each: the first benchmark there has
     ever been, four takes on one chain, and the same four with this take on
     another. */
  for (const [target, series] of [
    ['#first', [take(20300, CHAIN, 3)]],
    ['#joined', [0, 1, 2, 3].map((at) => take(20200 + at * 30, CHAIN, at))],
    [
      '#broken',
      [
        ...[0, 1, 2].map((at) => take(20200 + at * 30, CHAIN, at)),
        take(20300, OTHER_CHAIN, 3)
      ]
    ]
  ] as const) {
    mount(VoiceFigures, {
      target: document.querySelector(target)!,
      props: {
        figures: FIGURES,
        formants: { f1Hz: 624, f2Hz: 1712 },
        snrDb: 25,
        resonanceScale: 0.97,
        series,
        role
      }
    });
  }

  const density = document.querySelector('#drawn [data-pitch-density]');
  const outline = density?.querySelector('.pf-outline') ?? null;
  const spine = density?.querySelector('.pf-spine') ?? null;
  const ink = (node: Element | null) => {
    if (!node) return null;
    const style = getComputedStyle(node);
    return {
      width: style.strokeWidth,
      cap: style.strokeLinecap,
      join: style.strokeLinejoin,
      fill: style.fill,
      stroke: style.stroke
    };
  };

  /** Where a mark ends, as a share of the shape's own width at that
      frequency. The claim is that the median mark stops on the outline
      rather than crossing the box: both are read off the rendered SVG. */
  const markOnOutline = () => {
    const mark = density?.querySelector<SVGLineElement>('[data-density-median]');
    const shape = density?.querySelector<SVGPolylineElement>('.pf-outline');
    if (!mark || !shape) return null;
    const y = mark.y1.baseVal.value;
    const at = [...shape.points].reduce((best, point) =>
      Math.abs(point.y - y) < Math.abs(best.y - y) ? point : best
    );
    return { markEndsAt: mark.x2.baseVal.value, outlineAt: at.x, y };
  };

  publish(NAME, {
    drawn: {
      densities: document.querySelectorAll('#drawn [data-pitch-density]').length,
      outlinePoints: (outline as SVGPolylineElement | null)?.points.length ?? 0,
      marks: {
        median: document.querySelectorAll('#drawn [data-density-median]').length,
        span: document.querySelectorAll('#drawn [data-density-span]').length
      },
      /* The bands run across the plot and the shape as one ground, which is
         what makes "where I sit against the published figures" one reading
         rather than a lookup. */
      bandsBehindShape: density?.querySelectorAll('.pf-band').length ?? 0,
      onOutline: markOnOutline(),
      outlineInk: ink(outline),
      spineInk: ink(spine),
      traceInk: ink(document.querySelector('#drawn .pf-trace')),
      guideColour: getComputedStyle(document.documentElement).getPropertyValue('--text-2').trim()
    },
    trackless: {
      densities: document.querySelectorAll('#trackless [data-pitch-density]').length,
      traces: document.querySelectorAll('#trackless [data-pitch-trace]').length,
      said: (document.querySelector('#trackless [data-vb-no-track]')?.textContent ?? '').trim()
    },
    first: figuresIn('#first'),
    joined: figuresIn('#joined'),
    broken: figuresIn('#broken')
  });
} catch (error) {
  publish(NAME, { error: String(error) });
}
