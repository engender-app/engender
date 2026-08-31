/* A microphone that is not a microphone (phase 5 deepening ticket 15).

   The browser-tier probe and the gallery both need a take whose answer is
   known: Chromium's own fake audio device plays a beep whose frequency is
   not part of anybody's contract, and a real microphone in a headless
   browser is silence. So both hand the app a stream built from an
   oscillator instead - synthesized input, the same choice the node tier's
   tests make, arriving through the same getUserMedia the app calls.

   Not test-only in the shipped sense: it lives under test-support/ and
   nothing in src/routes imports it. It is here rather than in tests/
   because two callers in two tiers need the same signal, and a second copy
   would be a second definition of what a "steady take" is. */

export type FakeTake =
  /** In range, steady, comfortably below the rails: clears the gate. */
  | 'steady'
  /** The same note pushed into full scale: fails on clipping. */
  | 'loud'
  /** Sliding around by three semitones: fails on steadiness. */
  | 'wobble'
  /** Nothing but room tone: fails on length, with no pitch to report. */
  | 'silent';

export interface FakeMicrophone {
  stream: MediaStream;
  stop(): void;
}

/** A stream carrying a synthesized voice-like tone: a sawtooth at 185 Hz,
    which is inside the tracker's range and away from either end of it. */
export function fakeMicrophone(kind: FakeTake = 'steady'): FakeMicrophone {
  const context = new AudioContext();
  const destination = context.createMediaStreamDestination();

  const gain = context.createGain();
  gain.gain.value = kind === 'silent' ? 0.0008 : kind === 'loud' ? 4 : 0.35;
  gain.connect(destination);

  const source = context.createOscillator();
  source.type = 'sawtooth';
  source.frequency.value = 185;

  if (kind === 'wobble') {
    // Three semitones either way, slowly, which is well past the gate's 8%.
    const drift = context.createOscillator();
    drift.frequency.value = 1.1;
    const depth = context.createGain();
    depth.gain.value = 32;
    drift.connect(depth).connect(source.frequency);
    drift.start();
  }

  source.connect(gain);
  source.start();

  return {
    stream: destination.stream,
    stop() {
      source.stop();
      void context.close();
    }
  };
}

/** Replaces getUserMedia for the rest of the page's life, so the app's own
    capture path runs unchanged against a known signal. */
export function installFakeMicrophone(kind: FakeTake = 'steady'): FakeMicrophone {
  const microphone = fakeMicrophone(kind);
  navigator.mediaDevices.getUserMedia = async () => microphone.stream;
  return microphone;
}
