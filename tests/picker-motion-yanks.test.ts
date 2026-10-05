import { expect, test } from 'vitest';
import { findDrumYanks, findMonthYanks, findSurfaceYanks } from './picker-motion-yanks.mjs';

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

const month = (t: number, l: number, vop = 1, k = 1) => ({
  t, open: true as const, vw: 310, vop, panels: [{ k, l }]
});

test('month travel spanning missed samples is judged per elapsed frame', () => {
  // Chromium's 240ms picker easing travels 169.179px of 326px in 33ms.
  expect(findMonthYanks([month(0, 0), month(33, -169.179)])).toEqual([]);
  expect(findMonthYanks([month(0, 0), month(33, 169.179)])).toEqual([]);
});

test('hosted Today travel passes with and without its intermediate sample', () => {
  // Run 37244570805, artifact 11318209002, today-light: 191.4px over 33ms.
  const samples = [
    { ...month(39, 20), vw: 350 },
    { ...month(55, -86.5), vw: 350 },
    { ...month(72, -171.4), vw: 350 }
  ];
  expect(findMonthYanks(samples)).toEqual([]);
  expect(findMonthYanks([samples[0], samples[2]])).toEqual([]);
  expect(findMonthYanks([samples[0], { ...samples[2], t: 55 }])).toHaveLength(1);
});

test('a month jumping more than half the viewport in one frame still fails', () => {
  expect(findMonthYanks([month(0, 0), month(16, -191)])).toHaveLength(1);
  expect(findMonthYanks([month(0, 0), month(16, 191)])).toHaveLength(1);
  expect(findMonthYanks([month(0, 0), month(16, 155)])).toEqual([]);
  expect(findMonthYanks([month(0, 0), month(8, 156)])).toHaveLength(1);
});

test('a month exceeding the per-frame limit across a sampling gap still fails', () => {
  expect(findMonthYanks([month(0, 0), month(33, -326)])).toHaveLength(1);
});

test('month travel follows month identity and skips hidden rebases and picker mount', () => {
  expect(findMonthYanks([month(0, 0), month(16, 326, 1, 2)])).toEqual([]);
  expect(findMonthYanks([month(0, 0, 0), month(16, 326)])).toEqual([]);
  expect(findMonthYanks([month(0, 0), month(16, 326, 0)])).toEqual([]);
  expect(findMonthYanks([closed(0), month(16, 326), closed(32)])).toEqual([]);
});
