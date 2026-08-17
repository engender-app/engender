import { test, expect } from 'vitest';
import { BODY_REGION_INTENSITY_DEFAULT, BODY_REGION_INTENSITY_MAX, BODY_REGION_INTENSITY_MIN, BODY_REGION_KEYS } from './bodyMap.ts';

test('every body region carries a unique key', () => {
  expect(BODY_REGION_KEYS.every((key) => typeof key === 'string' && key.length > 0)).toBe(true);
  expect(new Set(BODY_REGION_KEYS).size).toBe(BODY_REGION_KEYS.length);
});

test('the default intensity sits within the region range', () => {
  expect(BODY_REGION_INTENSITY_DEFAULT).toBeGreaterThanOrEqual(BODY_REGION_INTENSITY_MIN);
  expect(BODY_REGION_INTENSITY_DEFAULT).toBeLessThanOrEqual(BODY_REGION_INTENSITY_MAX);
});
