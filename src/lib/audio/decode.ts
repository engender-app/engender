/* Recorded audio back into samples, at whatever rate the caller analyses at.

   Lifted out of voiceBenchmark.ts on ticket 46, which needed the same decode
   for a waveform's bars. The OfflineAudioContext's own rate is what does the
   resampling, so there is no resampler in this tree to get wrong, and a
   caller that wants an envelope rather than a pitch can ask for a quarter of
   the rate and wait a quarter as long. */

/**
 * Recorded bytes as mono samples at `sampleRate`. Throws what
 * `decodeAudioData` throws: bytes that are not audio this browser decodes.
 */
export async function decodeToMono(bytes: Uint8Array, sampleRate: number): Promise<Float32Array> {
  // A one-frame context: it is never rendered, it is only the decoder's
  // target rate. `slice()` because decodeAudioData detaches the buffer it is
  // given, and these bytes are also what gets stored.
  const context = new OfflineAudioContext(1, 1, sampleRate);
  const decoded = await context.decodeAudioData(bytes.slice().buffer as ArrayBuffer);
  if (decoded.numberOfChannels === 1) return decoded.getChannelData(0);

  const mixed = new Float32Array(decoded.length);
  for (let channel = 0; channel < decoded.numberOfChannels; channel++) {
    const data = decoded.getChannelData(channel);
    for (let i = 0; i < mixed.length; i++) mixed[i] += data[i] / decoded.numberOfChannels;
  }
  return mixed;
}
