/* Reading a recording's bars in a browser (ticket 46).

   peaks.ts is the arithmetic and knows nothing about files or audio
   contexts, so it can be tested without either. This is the half that needs
   a browser: read the stored bytes, decode them at the envelope rate, and
   hand the result to the cache under the recording's file name. */

import { decodeToPeaks } from '../audio/decode';
import { MediaBudgetError } from '../data/media/budget';
import { readRecording } from '../stores/voiceFiles';
import { PEAK_BUCKETS, PEAKS_SAMPLE_RATE, peaksFor } from './peaks';

/**
 * The bars for a recording, decoded once per file name and held for the life
 * of the tab. Null where the file is gone, the bytes are not audio this
 * browser decodes, the recording is longer than the decode budget allows
 * (audio-budget.ts), or there is nothing stored yet - the transport draws a
 * plain track in all four cases rather than a waveform that is not the
 * recording's own.
 *
 * `bytes` is what the entry editor holds for a recording just made, which
 * has no stored file to read and no stable name to remember it under.
 */
export async function waveformFor(
  fileName: string | null,
  bytes?: Uint8Array
): Promise<Float32Array | null> {
  return peaksFor(bytes ? null : fileName, async () => {
    const loaded = bytes ?? (fileName ? await readRecording(fileName) : null);
    if (!loaded) return null;
    try {
      return await decodeToPeaks(loaded, PEAKS_SAMPLE_RATE, PEAK_BUCKETS);
    } catch (error) {
      /* A recording over the duration budget is stored and played; it just
         has no bars, like one the browser cannot decode. */
      if (error instanceof MediaBudgetError) return null;
      throw error;
    }
  });
}
