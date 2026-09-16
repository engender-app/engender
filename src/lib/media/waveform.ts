/* Reading a recording's bars in a browser (ticket 46).

   peaks.ts is the arithmetic and knows nothing about files or audio
   contexts, so it can be tested without either. This is the half that needs
   a browser: read the stored bytes, decode them at the envelope rate, and
   hand the result to the cache under the recording's file name. */

import { decodeToMono } from '$lib/audio/decode';
import { readRecording } from '$lib/stores/voiceFiles';
import { PEAK_BUCKETS, PEAKS_SAMPLE_RATE, peaksFor, peaksFromSamples } from './peaks';

/**
 * The bars for a recording, decoded once per file name and held for the life
 * of the tab. Null where the file is gone, the bytes are not audio this
 * browser decodes, or there is nothing stored yet - the transport draws a
 * plain track in all three cases rather than a waveform that is not the
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
    const samples = await decodeToMono(loaded, PEAKS_SAMPLE_RATE);
    return peaksFromSamples(samples, PEAK_BUCKETS);
  });
}
