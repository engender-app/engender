import { expect, it } from 'vitest';
import { measurementNoticeTravel } from './measurement-notice-observation.mjs';

const key = '1:aside.kit-notice[data-protocol]';
type Frame = { at: number; vt: boolean; boxes: Record<string, number>; ops: Record<string, number> };
function frames(appear = 650, end = 2300, top = (_at: number) => 100): Frame[] {
  return Array.from({ length: end / 50 + 1 }, (_, index): Frame => {
    const at = index * 50;
    return { at, vt: false, boxes: at >= appear ? { [key]: top(at) } : {}, ops: at >= appear ? { [key]: 1 } : {} };
  });
}

it('accepts a stationary notice first visible after 510 ms', () => {
  expect(measurementNoticeTravel(frames())).toEqual([]);
});

it('fails explicitly when the notice never appears', () => {
  expect(measurementNoticeTravel(frames(Infinity, 10000))).toEqual(['measuring notice never appeared']);
});

it('fails when observation ends before the full interval after appearance', () => {
  expect(measurementNoticeTravel(frames(650, 1000))).toEqual(['measuring notice observation incomplete: less than 1600ms after appearance']);
});

it('fails explicitly when small continuous movement never settles', () => {
  expect(measurementNoticeTravel(frames(650, 2300, (at) => 100 + ((at / 50) % 2)))).toEqual(['measuring notice did not settle for 200ms']);
});

it.each([200, 1200])('rejects travel greater than 3px at %ims', (movementAt) => {
  expect(measurementNoticeTravel(frames(100, 1800, (at) => at >= movementAt ? 104 : 100))).toContain('measuring notice traveled 4px after appearing');
});

it('retains the 3px tolerance', () => {
  expect(measurementNoticeTravel(frames(650, 2300, (at) => at >= 1200 ? 103 : 100))).toEqual([]);
});

it('fails when frames are missing inside the observation interval', () => {
  const samples = frames().filter((frame) => frame.at < 1000 || frame.at > 1400);
  expect(measurementNoticeTravel(samples)).toContain('measuring notice observation incomplete: frame gap exceeds 250ms');
});

it('fails when the notice disappears during observation', () => {
  const samples = frames();
  samples[20].ops[key] = 0;
  expect(measurementNoticeTravel(samples)).toContain('measuring notice observation incomplete: notice became hidden');
});

it('fails when appearance exceeds the readiness bound', () => {
  expect(measurementNoticeTravel(frames(10050, 11700))).toContain('measuring notice did not appear within 10000ms');
});
