import { describe, expect, it } from 'vitest';

import {
  breaches,
  LONG_FRAME_SHARE_CAP,
  P95_PERIOD_MULTIPLE,
  unrecordedMaterials
} from './frame-budget.ts';
import type { FrameStats } from './frame-stats.ts';

const PERIOD = 1000 / 120;

function stats(over: Partial<FrameStats> = {}): FrameStats {
  return {
    frames: 40,
    spanMs: 40 * PERIOD,
    medianMs: PERIOD,
    p95Ms: PERIOD,
    worstMs: PERIOD,
    longFrames: 0,
    longFrameShare: 0,
    ...over
  };
}

describe('the pass rule', () => {
  it('passes a material that kept the reference cadence', () => {
    expect(breaches(stats(), PERIOD)).toEqual([]);
  });

  it('allows a share of long frames up to the cap and no further', () => {
    expect(breaches(stats({ longFrameShare: LONG_FRAME_SHARE_CAP, longFrames: 2 }), PERIOD)).toEqual([]);
    const over = breaches(stats({ longFrameShare: 0.1, longFrames: 4 }), PERIOD);
    expect(over).toHaveLength(1);
    expect(over[0]).toMatch(/10(\.0)?% of frames/);
    expect(over[0]).toMatch(/4 of 40/);
  });

  it('allows p95 up to the period multiple and no further', () => {
    expect(breaches(stats({ p95Ms: PERIOD * P95_PERIOD_MULTIPLE }), PERIOD)).toEqual([]);
    const over = breaches(stats({ p95Ms: PERIOD * 2 }), PERIOD);
    expect(over).toHaveLength(1);
    expect(over[0]).toContain('p95');
  });

  it('names both limits when a material breaks both', () => {
    expect(breaches(stats({ longFrameShare: 0.4, longFrames: 16, p95Ms: 40 }), PERIOD)).toHaveLength(2);
  });

  it('quotes the reference period, so a reader can tell 120Hz from 60Hz', () => {
    expect(breaches(stats({ p95Ms: 40 }), PERIOD)[0]).toContain('8.3ms');
  });
});

describe('the record', () => {
  const record = { 'card-clip-reveal': { verdict: 'ship' } };

  it('treats a measured material with no entry as a breach, not a pass', () => {
    const missing = unrecordedMaterials(
      [
        { name: 'card-clip-reveal', what: 'a', stats: stats() },
        { name: 'scrim-blur-radius', what: 'b', stats: stats() }
      ],
      record
    );
    expect(missing).toHaveLength(1);
    expect(missing[0]).toContain('scrim-blur-radius');
    expect(missing[0]).toContain('frame-budgets.json');
  });

  it('says nothing when every measured material is recorded', () => {
    expect(unrecordedMaterials([{ name: 'card-clip-reveal', what: 'a', stats: stats() }], record)).toEqual([]);
  });
});
