import { describe, expect, it } from 'vitest';

import { drawBars, leaderShares, type BarRow } from './barRow';

const row = (key: string, amount: number): BarRow => ({ key, name: key, value: String(amount), amount });

describe('drawBars', () => {
  it('measures a leader row against the tallest row in the set', () => {
    const out = drawBars([row('a', 2), row('b', 8)], 'leader');
    expect(out.map((r) => r.share)).toEqual([25, 100]);
  });

  it('measures a track row against the track itself', () => {
    const out = drawBars([row('a', 0.25), row('b', 0.9)], 'track');
    expect(out.map((r) => r.share)).toEqual([25, 90]);
  });

  it('flags only the tallest row as the leader, and only under the leader measure', () => {
    const leader = drawBars([row('a', 2), row('b', 8)], 'leader');
    expect(leader.map((r) => r.isLeader)).toEqual([false, true]);

    const track = drawBars([row('a', 2), row('b', 8)], 'track');
    expect(track.map((r) => r.isLeader)).toEqual([false, false]);
  });

  it('changes the computed lengths when the measure changes on the same data', () => {
    const rows = [row('a', 0.5), row('b', 0.8)];
    const leader = drawBars(rows, 'leader').map((r) => r.share);
    const track = drawBars(rows, 'track').map((r) => r.share);
    expect(leader).not.toEqual(track);
  });

  it('draws nothing for a leader set with nothing logged', () => {
    const out = drawBars([row('a', 0), row('b', 0)], 'leader');
    expect(out.map((r) => r.share)).toEqual([0, 0]);
    expect(out.every((r) => !r.isLeader)).toBe(true);
  });
});

describe('leaderShares', () => {
  it('reads each amount against the tallest one in the set', () => {
    expect(leaderShares([1, 4, 2])).toEqual([25, 100, 50]);
  });

  it('is zero across the board when nothing was counted', () => {
    expect(leaderShares([0, 0])).toEqual([0, 0]);
  });
});
