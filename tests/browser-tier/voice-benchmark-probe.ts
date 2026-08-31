/* Browser-tier check for ticket 15's acoustic engine, the half the node tier
   cannot reach.

   What is only provable here: that a take recorded through MediaRecorder,
   stored as opus in a webm container and decoded back through an
   OfflineAudioContext still measures what it measured before it made that
   round trip. The DSP itself is node-tested against synthesized buffers
   (src/lib/audio/*.test.ts); none of those tests can say whether the codec,
   the container and the resample leave the numbers intact, and that is the
   path every stored benchmark actually goes through.

   The signal is an oscillator rather than Chromium's fake device: 185 Hz is
   in the contract, and the fake device's beep frequency is not
   (tests/fake-microphone.mjs). The app's own startTake() and
   decodeTake() run unchanged over it. */

import { analysePassage } from '../../src/lib/audio/benchmark.ts';
import { PASSAGE_CHECKS, VOWEL_CHECKS, type QualityCheck } from '../../src/lib/audio/quality.ts';
import { installFakeMicrophone } from '../fake-microphone.mjs';
import { ANALYSIS_SAMPLE_RATE, startTake } from '../../src/lib/stores/voiceBenchmark.ts';
import { publish } from '../probe-handshake.mjs';

const NAME = 'voice-benchmark-probe';
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function take(kind: 'steady' | 'loud' | 'wobble', seconds: number, checks: readonly QualityCheck[]) {
  const microphone = installFakeMicrophone(kind);
  const session = await startTake(checks);
  if (typeof session === 'string') throw new Error(`the microphone refused: ${session}`);

  await delay(seconds * 1000);
  const live = session.read();
  const liveFrames = session.recentFrames(200).length;
  const finished = await session.finish();
  microphone.stop();
  if (!finished) throw new Error('nothing was captured');

  return { live, liveFrames, ...finished };
}

async function run() {
  // A steady take, long enough to clear the gate's length floor twice over.
  const steady = await take('steady', 4, PASSAGE_CHECKS);
  const analysed = analysePassage(steady.samples, ANALYSIS_SAMPLE_RATE, 100);

  const loud = await take('loud', 2, VOWEL_CHECKS);

  return {
    sampleRate: ANALYSIS_SAMPLE_RATE,
    // The decode's own answer about what it produced.
    decodedSeconds: steady.samples.length / ANALYSIS_SAMPLE_RATE,
    storedBytes: steady.bytes.length,
    // What the stored take measures after the codec round trip.
    medianHz: analysed.figures?.f0MedianHz ?? null,
    semitoneSd: analysed.figures?.semitoneSd ?? null,
    passageFailed: analysed.quality.failed,
    // The live gauge saw the same take arrive frame by frame.
    liveFrames: steady.liveFrames,
    liveVoicedSeconds: steady.live.longestVoicedSeconds,
    liveFailedWhileSteady: steady.live.failed,
    // And a take at full scale is caught rather than stored.
    loudPeak: loud.live.peak,
    loudFailed: loud.live.failed
  };
}

run().then(
  (result) => publish(NAME, result),
  (error) => publish(NAME, { error: String(error?.message ?? error) })
);
