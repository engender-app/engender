/* Synthesized input for the acoustic engine's tests.

   Committed audio fixtures were the alternative and were rejected: a WAV in
   the tree is a binary nobody can read a diff of, its provenance is somebody's
   voice, and the thing under test is whether the analyzer recovers a number
   that is only known because a fixture's own metadata claims it. Synthesis
   makes the answer arithmetic instead - a sine at 180 Hz has an F0 of 180 Hz
   by construction, and a vowel built from two resonators has the formants it
   was built from. */

export interface Signal {
  samples: Float32Array;
  sampleRate: number;
}

/** A pure tone. The F0 reference: whatever YIN says about this is measured
    against the frequency it was built at. */
export function sine(hz: number, seconds: number, sampleRate = 16000, amplitude = 0.5): Signal {
  const samples = new Float32Array(Math.round(seconds * sampleRate));
  for (let i = 0; i < samples.length; i++) {
    samples[i] = amplitude * Math.sin((2 * Math.PI * hz * i) / sampleRate);
  }
  return { samples, sampleRate };
}

/** A glottal-ish source: a band-limited sawtooth, which is a harmonic stack
    with the 1/n roll-off a voice roughly has. Formant filtering needs
    harmonics to shape; a sine has none. */
function sawtooth(hz: number, seconds: number, sampleRate: number, amplitude: number): Float32Array {
  const samples = new Float32Array(Math.round(seconds * sampleRate));
  const harmonics = Math.floor(sampleRate / 2 / hz);
  for (let i = 0; i < samples.length; i++) {
    let value = 0;
    for (let n = 1; n <= harmonics; n++) {
      value += Math.sin((2 * Math.PI * hz * n * i) / sampleRate) / n;
    }
    samples[i] = amplitude * value * 0.5;
  }
  return samples;
}

/** One formant: a two-pole resonator at `hz` with bandwidth `bandwidthHz`,
    the standard Klatt-style filter. Cascading these over a harmonic source
    is how a vowel with known formants gets built. */
function resonate(input: Float32Array, hz: number, bandwidthHz: number, sampleRate: number): Float32Array {
  const r = Math.exp((-Math.PI * bandwidthHz) / sampleRate);
  const theta = (2 * Math.PI * hz) / sampleRate;
  const a1 = 2 * r * Math.cos(theta);
  const a2 = -(r * r);
  const gain = 1 - a1 - a2;
  const out = new Float32Array(input.length);
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < input.length; i++) {
    const y = gain * input[i] + a1 * y1 + a2 * y2;
    out[i] = y;
    y2 = y1;
    y1 = y;
  }
  return out;
}

export interface VowelSpec {
  f0Hz: number;
  formants: { hz: number; bandwidthHz?: number }[];
  seconds: number;
  sampleRate?: number;
  amplitude?: number;
}

/** A sustained vowel: a sawtooth source through one resonator per formant,
    normalized back to the asked-for peak. */
export function vowel(spec: VowelSpec): Signal {
  const sampleRate = spec.sampleRate ?? 16000;
  let signal = sawtooth(spec.f0Hz, spec.seconds, sampleRate, 1);
  for (const formant of spec.formants) {
    signal = resonate(signal, formant.hz, formant.bandwidthHz ?? 80, sampleRate);
  }
  return { samples: normalize(signal, spec.amplitude ?? 0.5), sampleRate };
}

/** A sustained tone whose pitch drifts by `depthSemitones` over the take -
    the unsteady case the gate exists to catch, wobbling slowly enough that
    every individual frame still reads as voiced. */
export function wobblingSine(
  hz: number,
  depthSemitones: number,
  seconds: number,
  sampleRate = 16000,
  amplitude = 0.5
): Signal {
  const samples = new Float32Array(Math.round(seconds * sampleRate));
  let phase = 0;
  for (let i = 0; i < samples.length; i++) {
    const drift = depthSemitones * Math.sin((2 * Math.PI * 0.7 * i) / sampleRate);
    phase += (2 * Math.PI * hz * Math.pow(2, drift / 12)) / sampleRate;
    samples[i] = amplitude * Math.sin(phase);
  }
  return { samples, sampleRate };
}

/** Deterministic white noise. A seeded generator rather than Math.random, so
    a gate test that fails fails every time and not one run in ten. */
export function noise(seconds: number, sampleRate = 16000, amplitude = 0.05, seed = 1): Signal {
  const samples = new Float32Array(Math.round(seconds * sampleRate));
  let state = seed >>> 0;
  for (let i = 0; i < samples.length; i++) {
    state = (state * 1664525 + 1013904223) >>> 0;
    samples[i] = amplitude * (state / 0x80000000 - 1);
  }
  return { samples, sampleRate };
}

export function silence(seconds: number, sampleRate = 16000): Signal {
  return { samples: new Float32Array(Math.round(seconds * sampleRate)), sampleRate };
}

/** Sums signals of the same rate, shortest wins. Voice plus room tone. */
export function mix(...signals: Signal[]): Signal {
  const length = Math.min(...signals.map((s) => s.samples.length));
  const samples = new Float32Array(length);
  for (const signal of signals) {
    for (let i = 0; i < length; i++) samples[i] += signal.samples[i];
  }
  return { samples, sampleRate: signals[0].sampleRate };
}

/** Lays signals end to end. Speech after a stretch of room tone is what the
    SNR check is measured against. */
export function concat(...signals: Signal[]): Signal {
  const length = signals.reduce((total, s) => total + s.samples.length, 0);
  const samples = new Float32Array(length);
  let at = 0;
  for (const signal of signals) {
    samples.set(signal.samples, at);
    at += signal.samples.length;
  }
  return { samples, sampleRate: signals[0].sampleRate };
}

/** Drives the signal into the rails: amplified past full scale and hard
    clipped, the shape a take recorded too close to the microphone has. */
export function clipped(signal: Signal, drive = 3): Signal {
  const samples = new Float32Array(signal.samples.length);
  for (let i = 0; i < samples.length; i++) {
    samples[i] = Math.max(-1, Math.min(1, signal.samples[i] * drive));
  }
  return { samples, sampleRate: signal.sampleRate };
}

export function normalize(samples: Float32Array, peak: number): Float32Array {
  let max = 0;
  for (const sample of samples) max = Math.max(max, Math.abs(sample));
  if (max === 0) return samples;
  const scale = peak / max;
  const out = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) out[i] = samples[i] * scale;
  return out;
}
