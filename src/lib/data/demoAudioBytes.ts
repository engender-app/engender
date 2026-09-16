/* Deterministic bytes for a fixture's voice recordings (phase 5 ticket 36,
   phase 11 ticket 17) - voiceRecordings.ts writes them through with no
   format check, so unlike a photo this needs no real voice, only a file a
   browser can read a duration out of. Shared between the ten-year
   generator (generate.ts) and the browser demo's full fixture
   (fullFixture.ts), which both attach a handful of these to otherwise-real
   entries.

   Four thousand random bytes until ticket 17: a browser cannot find a
   duration in noise with no container around it, which is why the memo
   browser's total read 0:00 forever (its own comment blamed players that
   "never arrive" - they were never going to). A WAV header needs no codec
   to be believed: the duration is arithmetic on the sample count in the
   header, so every browser that opens the file agrees on it, unlike a
   webm/opus stub built by hand for the same purpose. Named `.webm` by
   `voiceRecordings/names.ts` regardless - Chromium sniffs the RIFF/WAVE
   bytes rather than trusting a mismatched extension, which is what the
   player already relies on for an imported file of unknown type
   (voiceRecordings/mime.ts's own empty-type fallback). */
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

/** The same bytes for a video note (phase 11 ticket 14). Its own name
    rather than a second call to the one above, because a video note's
    bytes being arbitrary rests on a different fact about a different
    table: `videoNotes.ts` writes them through unread, and the library
    draws a glyph on a note's tile rather than decoding a still out of it.
    If either of those two ever stops being true, this is the name that
    has to change. */
export const demoVideoBytes = demoAudioBytes;
