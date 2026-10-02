import { expect, test } from 'vitest';
import { findDrumYanks, findSurfaceYanks } from './picker-motion-yanks.mjs';

const shown = (t: number, amount: number) => ({ t, open: true as const, seen: 1, shown: amount, op: 1 });
const closed = (t: number) => ({ t, open: false as const });

test('surface jumps still fail within one frame, including mount and removal', () => {
  expect(findSurfaceYanks([shown(0, 0), shown(16, 0.46)])).toHaveLength(1);
  expect(findSurfaceYanks([closed(0), shown(16, 1)])).toHaveLength(1);
  expect(findSurfaceYanks([shown(0, 1), closed(16)])).toHaveLength(1);
});

test('a compositor animation spanning missed samples is judged per elapsed frame', () => {
  expect(findSurfaceYanks([shown(0, 0), shown(48, 0.69)])).toEqual([]);
  expect(findSurfaceYanks([shown(0, 1), shown(32, 0.28)])).toEqual([]);
  expect(findSurfaceYanks([shown(0, 0), shown(32, 0.95)])).toHaveLength(1);
});

test('ordinary travel and a surface present before sampling do not fail', () => {
  expect(findSurfaceYanks([shown(0, 0), shown(16, 0.3), shown(32, 0.6)])).toEqual([]);
  expect(findSurfaceYanks([shown(0, 1)])).toEqual([]);
});

const drum = (t: number, y: number, op = 1) => ({ t, open: true as const, drums: { minute: { y, op } } });

test('drum travel spanning missed samples is judged per elapsed frame', () => {
  expect(findDrumYanks([drum(0, 0), drum(32, 318)])).toEqual([]);
  expect(findDrumYanks([drum(0, 0), drum(48, 600)])).toEqual([]);
});

test('a drum moving its five-row window in one frame still fails', () => {
  expect(findDrumYanks([drum(0, 0), drum(16, 240)])).toHaveLength(1);
  expect(findDrumYanks([drum(0, 0), drum(32, 480)])).toHaveLength(1);
});

test('hidden drums and picker mount or removal do not report drum travel', () => {
  expect(findDrumYanks([drum(0, 0, 0), drum(16, 816)])).toEqual([]);
  expect(findDrumYanks([drum(0, 0), drum(16, 816, 0)])).toEqual([]);
  expect(findDrumYanks([closed(0), drum(16, 816), closed(32)])).toEqual([]);
});
