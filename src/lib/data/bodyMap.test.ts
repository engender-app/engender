import { test, expect } from 'vitest';
import { BODY_REGION_INTENSITY_DEFAULT, BODY_REGION_INTENSITY_MAX, BODY_REGION_INTENSITY_MIN } from './bodyMap.ts';

test('the default intensity sits within the region range', () => {
  expect(BODY_REGION_INTENSITY_DEFAULT).toBeGreaterThanOrEqual(BODY_REGION_INTENSITY_MIN);
  expect(BODY_REGION_INTENSITY_DEFAULT).toBeLessThanOrEqual(BODY_REGION_INTENSITY_MAX);
});
