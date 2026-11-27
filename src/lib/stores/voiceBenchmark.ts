/* One microphone stream feeds MediaRecorder and the live gauge, so the
   app needs one recording indicator and one Android permission prompt.

   Store results from the decoded take. AnalyserNode polling can repeat
   or skip samples and is suitable for feedback only. Avoid a separate
   AudioWorklet bundle and CSP surface for the gauge. Analyze at 16 kHz
   for sub-4 kHz formants and a smaller YIN search range. Keep the
   MediaRecorder bytes intact. */

import { decodeToMono } from '$lib/audio/decode';
import { makeLiveGauge, type LiveGauge } from '$lib/audio/live';
import type { PitchFrame } from '$lib/audio/pitch';
import type { QualityGate, QualityReport } from '$lib/audio/quality';
import { captureChainOfStream, openMicrophone, recordStream, type MicRefusal } from './voiceRecording';

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

interface BenchmarkTake {
  /** The recorded file, as stored. */
  bytes: Uint8Array;
  /** The same take decoded at the analysis rate. */
  samples: Float32Array;
}

export interface TakeSession {
  /** What this take is being recorded through, read off the track the
      moment it opened (audio/captureChain.ts, ticket 28). Here rather than
      on the finished take because it is a fact about the open microphone,
      and `getSettings()` is only answerable while the track is live. */
  readonly captureChain: string;
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

/** Decodes recorded audio to mono samples at the analysis rate. The decode
    itself is audio/decode.ts, shared with the waveform's bars;
    the rate is this file's. */
const decodeTake = (bytes: Uint8Array) => decodeToMono(bytes, ANALYSIS_SAMPLE_RATE);

/** Opens the microphone and starts a take, or says why it could not. The
    refusal is returned rather than announced: the recording screen holds a
    state for it, which is what the ticket's denied-permission case asks for.

    `signal` covers the two awaits below - opening the microphone and reading
    its chain - which is the window in which the screen that asked for this
    take can be gone before either resolves (a tab switch mid-permission-
    prompt, most often). Aborting there stops the tracks this function
    already opened and returns null instead of a session nothing will ever
    read; both call sites hang their own `AbortController` on `onDestroy`. */
export async function startTake(
  gate: QualityGate,
  signal?: AbortSignal
): Promise<TakeSession | MicRefusal | null> {
  // Unprocessed: a benchmark measures the microphone's own answer, not the
  // browser's cleaned-up version of it (voiceRecording.ts's UNPROCESSED_AUDIO).
  const stream = await openMicrophone(true);
  if (typeof stream === 'string') return stream;

  /* What actually came back, not what was asked for (ADR-0061). Read here,
     before anything is recorded, because the track stops answering once
     the take is over. */
  let captureChain: string;
  let context: AudioContext | undefined;
  let analyser: AnalyserNode;
  let recording;
  try {
    captureChain = await captureChainOfStream(stream);
    if (signal?.aborted) {
      for (const track of stream.getTracks()) track.stop();
      return null;
    }
    context = new AudioContext({ sampleRate: ANALYSIS_SAMPLE_RATE });
    analyser = context.createAnalyser();
    analyser.fftSize = ANALYSER_FFT_SIZE;
    context.createMediaStreamSource(stream).connect(analyser);
    recording = recordStream(stream);
  } catch (error) {
    for (const track of stream.getTracks()) track.stop();
    await context?.close();
    throw error;
  }
  const audioContext = context;

  const gauge: LiveGauge = makeLiveGauge(ANALYSIS_SAMPLE_RATE, gate);
  const latest = new Float32Array(analyser.fftSize);
  let lastPollAt = audioContext.currentTime;

  const poll = setInterval(() => {
    analyser.getFloatTimeDomainData(latest);
    const elapsed = audioContext.currentTime - lastPollAt;
    lastPollAt = audioContext.currentTime;
    // Only what arrived since the last poll, taken off the end of the
    // analyser's window: everything before that has already been counted.
    const fresh = Math.min(latest.length, Math.round(elapsed * ANALYSIS_SAMPLE_RATE));
    if (fresh > 0) gauge.push(latest.slice(latest.length - fresh));
  }, POLL_MS);

  const close = async () => {
    clearInterval(poll);
    await audioContext.close();
  };

  return {
    captureChain,
    read: () => gauge.read(),
    recentFrames: (count) => gauge.recentFrames(count),
    secondsCaptured: () => gauge.secondsCaptured(),

    async finish() {
      let bytes: Uint8Array | null;
      try {
        bytes = await recording.stop();
      } finally {
        await close();
      }
      if (!bytes) return null;
      return { bytes, samples: await decodeTake(bytes) };
    },

    async discard() {
      try {
        await recording.stop();
      } finally {
        await close();
      }
    }
  };
}
