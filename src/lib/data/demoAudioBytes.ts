/* Deterministic, arbitrary bytes for a fixture's voice recordings (phase 5
   ticket 36) - voiceRecordings.ts writes them through with no decoding or
   format check, so unlike a photo this needs no real audio, only a size
   worth attaching. Shared between the ten-year generator (generate.ts) and
   the browser demo's full fixture (fullFixture.ts), which both attach a
   handful of these to otherwise-real entries. */
export function demoAudioBytes(random: () => number): Uint8Array {
  const bytes = new Uint8Array(4000);
  for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(random() * 256);
  return bytes;
}

/** The same bytes for a video note (phase 11 ticket 14). Its own name
    rather than a second call to the one above, because a video note's
    bytes being arbitrary rests on a different fact about a different
    table: `videoNotes.ts` writes them through unread, and the library
    draws a glyph on a note's tile rather than decoding a still out of it.
    If either of those two ever stops being true, this is the name that
    has to change. */
export const demoVideoBytes = demoAudioBytes;
