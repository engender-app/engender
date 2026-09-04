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
   decodeTake() run unchanged over it.

   Phase 8 features ticket 09 adds the two halves that ticket needs proving
   here rather than in Node: that the take a real recording produces carries
   a stored pitch track, and that the figure drawn from a live session puts
   its trace where the absolute axis says 185 Hz is, with its reference
   bands, their source and the averages caveat all on screen. The gauge is
   mounted for real, so what is measured is the component's own output over
   frames that came off a microphone. */

import { mount } from 'svelte';
import { analysePassage } from '../../src/lib/audio/benchmark.ts';
import { DEFAULT_PITCH_AXIS, axisFraction } from '../../src/lib/audio/bands.ts';
import { decodePitchTrack } from '../../src/lib/audio/track.ts';
import type { PitchFrame } from '../../src/lib/audio/pitch.ts';
import { PASSAGE_CHECKS, VOWEL_CHECKS, type QualityCheck, type QualityReport } from '../../src/lib/audio/quality.ts';
import { installFakeMicrophone } from '../fake-microphone.mjs';
import { ANALYSIS_SAMPLE_RATE, startTake } from '../../src/lib/stores/voiceBenchmark.ts';
import VoiceGauge from '../../src/lib/components/VoiceGauge.svelte';
import VoiceTake from '../../src/lib/components/VoiceTake.svelte';
import { publish } from '../probe-handshake.mjs';

/** The oscillator's own note. Everything the figure is checked against is
    derived from this rather than from a pixel measured once. */
const SIGNAL_HZ = 185;

/** Mounts the live gauge over frames that arrived from the microphone, and
    reads back what it drew. Static: the frames are already in hand, so
    nothing here depends on a poll landing during the assertion. */
function drawnFigure(frames: readonly PitchFrame[], report: QualityReport) {
  const target = document.createElement('div');
  document.body.append(target);
  mount(VoiceGauge, {
    target,
    props: {
      frames,
      report,
      targetSeconds: 1.5,
      label: 'probe',
      advice: [],
      comfort: { lowHz: 200, highHz: 230 },
      language: 'en' as const
    }
  });

  const traces = [...target.querySelectorAll('[data-pitch-trace]')];
  /* Every y the trace was drawn at, in the figure's own 0-to-100 box. The
     claim is that they sit where the axis puts 185 Hz, which is what makes
     this an absolute axis rather than a relative one. */
  const ys = traces.flatMap((trace) =>
    (trace.getAttribute('points') ?? '')
      .split(' ')
      .filter(Boolean)
      .map((pair) => Number(pair.split(',')[1]))
  );

  return {
    traceRuns: traces.length,
    tracePoints: ys.length,
    traceMeanY: ys.length ? ys.reduce((a, b) => a + b, 0) / ys.length : null,
    expectedY: (1 - axisFraction(SIGNAL_HZ, DEFAULT_PITCH_AXIS)) * 100,
    bands: [...target.querySelectorAll('[data-pitch-band]')].map((li) =>
      li.getAttribute('data-pitch-band')
    ),
    /* Every Hz figure the legend printed, in order. The figures are what
       ADR-0059 requires beside the labels, and counting them says so
       without this test asserting on anybody's wording. */
    bandFigures: [...target.querySelectorAll('[data-pitch-band]')].map(
      (li) => (li.textContent ?? '').match(/\d+/g)?.length ?? 0
    ),
    middleEdges: target.querySelectorAll('[data-pitch-middle] line').length,
    middleFills: target.querySelectorAll('[data-pitch-middle] rect').length,
    comfortMarks: target.querySelectorAll('[data-pitch-comfort] line').length,
    sourceText: target.querySelector('[data-pitch-source]')?.textContent?.trim() ?? '',
    caveatText: target.querySelector('[data-pitch-caveat]')?.textContent?.trim() ?? ''
  };
}

const NAME = 'voice-benchmark-probe';
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function take(kind: 'steady' | 'loud' | 'wobble', seconds: number, checks: readonly QualityCheck[]) {
  const microphone = installFakeMicrophone(kind);
  const session = await startTake(checks);
  if (typeof session === 'string') throw new Error(`the microphone refused: ${session}`);

  await delay(seconds * 1000);
  const live = session.read();
  const frames = session.recentFrames(200);
  const finished = await session.finish();
  microphone.stop();
  if (!finished) throw new Error('nothing was captured');

  return { live, frames, liveFrames: frames.length, ...finished };
}

/** A finished benchmark, drawn from its stored track and then from none.
    The second case is every benchmark taken before schema v58: the frames
    were summarized and dropped, so the screen has to say so rather than
    draw a field with bands and no trace, which would read as a take that
    had no voice in it. */
function drawnTake(pitchTrack: string | null) {
  const target = document.createElement('div');
  document.body.append(target);
  mount(VoiceTake, {
    target,
    props: { pitchTrack, medianHz: SIGNAL_HZ, p10Hz: 176, p90Hz: 194, language: 'en' as const }
  });

  return {
    traceRuns: target.querySelectorAll('[data-pitch-trace]').length,
    hasMedian: target.querySelectorAll('[data-pitch-median]').length,
    spanEdges: target.querySelectorAll('[data-pitch-span]').length,
    saysNoTrack: target.querySelectorAll('[data-vb-no-track]').length,
    marksText: target.querySelector('[data-vb-take-marks]')?.textContent?.trim() ?? ''
  };
}

async function run() {
  // A steady take, long enough to clear the gate's length floor twice over.
  const steady = await take('steady', 4, PASSAGE_CHECKS);
  const analysed = analysePassage(steady.samples, ANALYSIS_SAMPLE_RATE, 100);

  const loud = await take('loud', 2, VOWEL_CHECKS);

  /* The figure, over the frames the live gauge actually saw. */
  const figure = drawnFigure(steady.frames, steady.live);

  /* The stored track, decoded back the way the screen decodes it. */
  const stored = decodePitchTrack(analysed.pitchTrack);
  const storedVoiced = (stored ?? []).filter((frame) => frame.hz !== null);

  return {
    figure,
    take: drawnTake(analysed.pitchTrack),
    takeWithoutTrack: drawnTake(null),
    storedPoints: stored?.length ?? 0,
    storedVoicedPoints: storedVoiced.length,
    storedSpanSeconds: stored?.length ? stored[stored.length - 1].atSeconds : 0,
    storedWorstHzError: storedVoiced.length
      ? Math.max(...storedVoiced.map((frame) => Math.abs((frame.hz as number) - SIGNAL_HZ)))
      : null,
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
