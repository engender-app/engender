import { describe, expect, test } from 'vitest';
import { HUB_ROWS } from '../data/hubRows';
import { hubIconMaskImage } from './hubIconMasks';

describe('hub icon masks', () => {
  test('every hub row has an inlined raster mask', () => {
    for (const name of new Set(HUB_ROWS.map((row) => row.icon))) {
      expect(hubIconMaskImage(name)).toMatch(/^url\("data:image\/png;base64,/);
    }
  });
});
