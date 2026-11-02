/* Which version of the voice analysis measured a benchmark (functional audit
   ticket 50). The figures a benchmark stores are a measurement of a file under
   a known analyzer (schema.ts, voice_benchmark), and the analyzer is the
   pitch tracker (pitch.ts), the formant estimate (resonance.ts) and the
   quality gate (quality.ts). Raise this by one whenever a change to any of
   them could move a figure it already reported, so a later reader can tell a
   take that changed because the voice did from one that changed because the
   arithmetic did. A benchmark taken before the column existed holds null. */
export const ANALYZER_VERSION = 1;
