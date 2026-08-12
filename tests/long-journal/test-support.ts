/* Shared by the two Node-tier test files here (phase 2 ticket 20). */

import type { NormalizedPhoto } from '../../src/lib/data/journal/photos.ts';

/** Photo bytes without a canvas, which the Node tier has not got. What the
    tests below care about is that the rows and the files land, not what
    they depict, so these are a pattern rather than a JPEG - the browser
    probe supplies real ones. Length varies with `n` so one photo is
    distinguishable from its neighbour. */
export const bytePatternPhoto = async (n: number): Promise<NormalizedPhoto> => ({
  full: new Uint8Array(64 + (n % 8)).fill(n % 251),
  thumb: new Uint8Array(16).fill(n % 251)
});
