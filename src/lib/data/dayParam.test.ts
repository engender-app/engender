import { describe, expect, it } from 'vitest';
import { parseDayParam } from './dayParam';

const today = 20732;

describe('day URL parameter', () => {
  it.each([
    ['today', today], ['0', 0], ['20731', 20731], ['99999', 99999],
    ['1970-01-01', 0], ['2011-12-30', 15338], ['2026-10-05', 20731], ['2024-02-29', 19782],
    ['9999-12-31', 2932896]
  ])('reads %s as epoch day %s', (raw, day) => {
    expect(parseDayParam(raw as string, today)).toBe(day);
  });

  it.each([
    undefined, '', 'abc', 'NaN', 'Infinity', '-1', '1.5', '1e3', '0x10',
    ' 1', '1 ', '+1', '9007199254740991', '100000001',
    '2026-02-30', '2025-02-29', '2026-13-01', '2026-00-01', '2026-01-00',
    '2026-10-5', '2026-1-05', '2026-10-05T00:00:00Z', '1969-12-31', '0000-01-01'
  ])('refuses malformed or unrepresentable day %s', (raw) => {
    expect(parseDayParam(raw, today)).toBeNull();
  });
});
