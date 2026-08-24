/* The pass rule a candidate motion material has to clear (phase 5 ticket 28),
   and the rule for reading the record it goes into.

   DIRECTION.md's performance contract said only transform and opacity
   animate. This ticket replaces that prohibition with a number, so the
   number needs a definition that does not move with taste:

   A material ships only if, in the test bed, on the device named in
   frame-budgets.json, it holds the cadence that transform and opacity hold
   there. Not the panel's refresh rate and not 60Hz - the baseline material's
   own measured median, because that is what the contract being amended
   actually costs on this hardware. Both sides of the comparison then run
   under the same WebView, the same frame-rate policy and the same test bed,
   and a difference between them is the material rather than the phone.

   Two limits, because one number hides the wrong thing. A share of long
   frames catches scattered stutter; a p95 catches a run that is uniformly
   slower without ever missing badly enough to count as a stutter. A
   material has to clear both.

   These are deliberately written down before any measurement was taken.
   A cap chosen after seeing the numbers is a description of the numbers. */

import type { FrameStats } from './frame-stats.ts';

/** At most one frame in twenty may run long. Below that a stutter is not
    reliably visible in a transition of a few hundred milliseconds; above it,
    it is. */
export const LONG_FRAME_SHARE_CAP = 0.05;

/** 95% of frames land within a quarter of a frame of the reference period.
    A material that is smooth but consistently a third slower reads as the
    app getting heavier, and no long-frame count catches that. */
export const P95_PERIOD_MULTIPLE = 1.25;

/** The material every other one is measured against: the current contract,
    transform and opacity, in the same bed. Its median interval is the
    reference period. */
export const BASELINE_MATERIAL = 'baseline-transform';

export interface MaterialResult {
  name: string;
  /** What the material is, for whoever reads the run. */
  what: string;
  stats: FrameStats;
}

const percent = (share: number) => `${(share * 100).toFixed(1)}%`;
const ms = (value: number) => `${value.toFixed(1)}ms`;

/** Every limit the material broke, one line each, ready to print. Empty
    means it holds. */
export function breaches(stats: FrameStats, periodMs: number): string[] {
  const found: string[] = [];

  if (stats.longFrameShare > LONG_FRAME_SHARE_CAP) {
    found.push(
      `${percent(stats.longFrameShare)} of frames ran long (${stats.longFrames} of ${stats.frames}), ` +
        `over a cap of ${percent(LONG_FRAME_SHARE_CAP)}, against a reference period of ${ms(periodMs)}`
    );
  }

  const p95Cap = periodMs * P95_PERIOD_MULTIPLE;
  if (stats.p95Ms > p95Cap) {
    found.push(
      `p95 frame ${ms(stats.p95Ms)} over a cap of ${ms(p95Cap)} ` +
        `(${P95_PERIOD_MULTIPLE}x a reference period of ${ms(periodMs)})`
    );
  }

  return found;
}

/** Materials the run measured that frame-budgets.json says nothing about.

    A breach rather than a pass, for the reason long-journal's budgets.mjs
    gives: adding a material to the probe and forgetting to record it would
    otherwise leave a number nobody has read. */
export function unrecordedMaterials(
  results: MaterialResult[],
  record: Record<string, unknown>
): string[] {
  return results
    .filter((result) => !(result.name in record))
    .map(
      (result) =>
        `${result.name} was measured but is not in frame-budgets.json - record it with a verdict, ` +
        `or the run says nothing about it`
    );
}
