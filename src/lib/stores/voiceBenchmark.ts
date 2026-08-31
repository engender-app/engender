/* Making a benchmark take, with the gate reading out while it happens
   (phase 5 deepening ticket 15, CONTEXT: "Voice benchmark").

   The browser half of the acoustic engine: one microphone stream feeding two
   things at once - MediaRecorder, which produces the bytes that get stored,
   and an AudioContext, which produces the samples the gauge reads. One
   stream, not two, so there is one microphone indicator and, on Android, one
   permission moment (voiceRecording.ts's recordStream).

   **The gauge is feedback; the decoded take is the verdict.** What is
   analysed for storage is the recorded file, decoded once at the end
   (`decodeTake`), never the samples the gauge saw. The live path polls an
   AnalyserNode, which hands back its most recent window rather than a
   contiguous stream, so a few samples at each poll boundary are duplicated
   or missed - which is fine for a bar that moves and wrong for a number that
   gets written down. The alternative, an AudioWorklet, is a second bundle
   entry and a CSP surface for a gauge whose answer is thrown away.

   Analysis runs at 16 kHz throughout: formants of interest sit under 4 kHz
   and YIN's cost grows with the search range, so the AudioContext is opened
   at that rate and the stored file is decoded back to it. The recording
   itself is untouched - the bytes are whatever MediaRecorder produced. */

import { makeLiveGauge, type LiveGauge } from '$lib/audio/live';
import type { PitchFrame } from '$lib/audio/pitch';
import type { QualityCheck, QualityReport } from '$lib/audio/quality';
import { openMicrophone, recordStream, type MicRefusal } from './voiceRecording';

/** Formants under 4 kHz need 8 kHz of bandwidth; 16 kHz is the standard
    analysis rate for this and keeps YIN's lag search short. */
export const ANALYSIS_SAMPLE_RATE = 16000;

/** How often the gauge re-reads. Slower than a frame of animation on
    purpose: the bar interpolates between readings, and re-running the gate
    sixty times a second would spend the phone's main thread on numbers
    nobody can see change that fast. */
const POLL_MS = 100;

/** 128 ms of audio at the analysis rate, which is longer than one poll -
    so a poll that arrives late still finds the samples it missed. */
const ANALYSER_FFT_SIZE = 2048;

export interface BenchmarkTake {
  /** The recorded file, as stored. */
  bytes: Uint8Array;
  /** The same take decoded at the analysis rate. */
  samples: Float32Array;
}

export interface TakeSession {
  /** The gate's live reading. */
  read(): QualityReport;
  /** The most recent pitch frames, for the gauge's trace. */
  recentFrames(count: number): readonly PitchFrame[];
  secondsCaptured(): number;
  /** Stops, closes the microphone, and returns the take decoded and ready to
      analyse. Null when nothing was captured. */
  finish(): Promise<BenchmarkTake | null>;
  /** Stops and closes the microphone, keeping nothing. */
  discard(): Promise<void>;
}

/** Decodes recorded audio to mono samples at the analysis rate. The
    OfflineAudioContext's own rate is what does the resampling, so there is
    no resampler in this tree to get wrong. */
export async function decodeTake(bytes: Uint8Array): Promise<Float32Array> {
  // A one-frame context: it is never rendered, it is only the decoder's
  // target rate. `slice()` because decodeAudioData detaches the buffer it is
  // given, and these bytes are also what gets stored.
  const context = new OfflineAudioContext(1, 1, ANALYSIS_SAMPLE_RATE);
  const decoded = await context.decodeAudioData(bytes.slice().buffer as ArrayBuffer);
  if (decoded.numberOfChannels === 1) return decoded.getChannelData(0);

  const mixed = new Float32Array(decoded.length);
  for (let channel = 0; channel < decoded.numberOfChannels; channel++) {
    const data = decoded.getChannelData(channel);
    for (let i = 0; i < mixed.length; i++) mixed[i] += data[i] / decoded.numberOfChannels;
  }
  return mixed;
}

/** Opens the microphone and starts a take, or says why it could not. The
    refusal is returned rather than announced: the recording screen holds a
    state for it, which is what the ticket's denied-permission case asks for. */
export async function startTake(checks: readonly QualityCheck[]): Promise<TakeSession | MicRefusal> {
  const stream = await openMicrophone();
  if (typeof stream === 'string') return stream;

  const recording = recordStream(stream);
  const context = new AudioContext({ sampleRate: ANALYSIS_SAMPLE_RATE });
  const analyser = context.createAnalyser();
  analyser.fftSize = ANALYSER_FFT_SIZE;
  context.createMediaStreamSource(stream).connect(analyser);

  const gauge: LiveGauge = makeLiveGauge(ANALYSIS_SAMPLE_RATE, checks);
  const window = new Float32Array(analyser.fftSize);
  let lastPollAt = context.currentTime;

  const poll = setInterval(() => {
    analyser.getFloatTimeDomainData(window);
    const elapsed = context.currentTime - lastPollAt;
    lastPollAt = context.currentTime;
    // Only what arrived since the last poll, taken off the end of the
    // analyser's window: everything before that has already been counted.
    const fresh = Math.min(window.length, Math.round(elapsed * ANALYSIS_SAMPLE_RATE));
    if (fresh > 0) gauge.push(window.slice(window.length - fresh));
  }, POLL_MS);

  const close = async () => {
    clearInterval(poll);
    await context.close();
  };

  return {
    read: () => gauge.read(),
    recentFrames: (count) => gauge.recentFrames(count),
    secondsCaptured: () => gauge.secondsCaptured(),

    async finish() {
      const bytes = await recording.stop();
      await close();
      if (!bytes) return null;
      return { bytes, samples: await decodeTake(bytes) };
    },

    async discard() {
      await recording.stop();
      await close();
    }
  };
}
