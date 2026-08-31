/* A microphone that is not a microphone (phase 5 deepening ticket 15).

   The browser-tier probe and the screenshot gallery both need a take whose
   answer is known: Chromium's own fake audio device plays a beep whose
   frequency is not part of anybody's contract, and a real microphone in a
   headless browser is silence. So both hand the app a stream built from an
   oscillator instead - synthesized input, the same choice the node tier's
   tests make, arriving through the same getUserMedia the app calls.

   Plain JS and dependency-free, for the reason tests/palettes.mjs gives:
   the probe is bundled by Vite and can import it, and the gallery has no
   bundler at all and reads it as text to inject into the page. One
   definition of what a "steady take" is, rather than one per tier.

   The kinds:
     steady  in range, steady, below the rails - clears the gate
     loud    the same note at full scale - fails on clipping
     wobble  sliding by three semitones - fails on steadiness */

/** @typedef {'steady' | 'loud' | 'wobble'} FakeTake */

/** A stream carrying a synthesized voice-like tone: a sawtooth at 185 Hz,
    which is inside the tracker's range and away from either end of it.

    @param {FakeTake} [kind]
    @returns {{ stream: MediaStream, stop: () => void }} */
export function fakeMicrophone(kind = 'steady') {
  const context = new AudioContext();
  const destination = context.createMediaStreamDestination();

  const gain = context.createGain();
  gain.gain.value = kind === 'loud' ? 4 : 0.35;
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
    capture path runs unchanged against a known signal.

    One stream per call, not one per page: the app stops the tracks when a
    take ends (that is what closes the microphone indicator), so a second
    take handed the same stream would record silence. The flow's whole point
    is that the second take can be redone on its own, so this has to survive
    being asked twice.

    @param {FakeTake} [kind]
    @returns {{ stop: () => void }} */
export function installFakeMicrophone(kind = 'steady') {
  /** @type {{ stop: () => void }[]} */
  const open = [];
  navigator.mediaDevices.getUserMedia = async () => {
    const microphone = fakeMicrophone(kind);
    open.push(microphone);
    return microphone.stream;
  };
  return {
    stop() {
      for (const microphone of open.splice(0)) microphone.stop();
    }
  };
}
