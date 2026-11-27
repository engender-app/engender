/* Generate deterministic WAV bytes with a readable duration for the
   decade and full demo fixtures. The voice store uses .webm names.
   Chromium sniffs the RIFF/WAVE container despite the extension, as
   for imported audio with unknown MIME type. */
const SAMPLE_RATE = 8000;
const SECONDS = 3;

export function demoAudioBytes(random: () => number): Uint8Array {
  const sampleCount = SAMPLE_RATE * SECONDS;
  const dataSize = sampleCount * 2; // 16-bit mono
  const buf = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buf);
  const writeAscii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };

  writeAscii(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(8, 'WAVE');
  writeAscii(12, 'fmt ');
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeAscii(36, 'data');
  view.setUint32(40, dataSize, true);

  // Quiet noise rather than silence, so a waveform decoded off this file
  // (media/peaks.ts) draws something rather than a flat line.
  for (let i = 0; i < sampleCount; i++) {
    const sample = Math.floor((random() * 2 - 1) * 4000);
    view.setInt16(44 + i * 2, sample, true);
  }

  return new Uint8Array(buf);
}

/** The same bytes for a video note. Its own name
    rather than a second call to the one above, because a video note's
    bytes being arbitrary rests on a different fact about a different
    table: `videoNotes.ts` writes them through unread, and the library
    draws a glyph on a note's tile rather than decoding a still out of it.
    If either of those two ever stops being true, this is the name that
    has to change. */
export const demoVideoBytes = demoAudioBytes;
