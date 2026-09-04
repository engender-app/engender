/* Browser-tier check for phase 8 audit ticket 03: the microphone leak a
   screen that goes mid-open used to leave behind.

   `startTake` awaits twice before it has anything to clean up itself -
   opening the microphone, then reading its capture chain - and a component
   destroyed in that window used to find `session` still null, so its
   `onDestroy`'s `void session?.discard()` discarded nothing. The stream, the
   armed poll interval and the AudioContext were never touched again.

   Reproduced against the real capture path: Chromium's own fake device
   (browser-tier's `--use-fake-device-for-media-stream`), delayed rather than
   replaced, so `getUserMedia` genuinely straddles the destroy instead of
   resolving before this script gets a chance to unmount anything. */

import { mount, unmount } from 'svelte';
import VoicePractice from '../../src/lib/components/VoicePractice.svelte';
import { recordStream } from '../../src/lib/stores/voiceRecording.ts';
import { publish } from '../probe-handshake.mjs';

const NAME = 'mic-teardown-probe';
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Answers `getUserMedia` only after `openDelayMs`, off the real fake
    device - so a component destroyed inside that delay is destroyed
    genuinely mid-open, and every track handed back is a real
    `MediaStreamTrack` whose `readyState` answers honestly. */
function installDelayedMicrophone(openDelayMs: number) {
  const streams: MediaStream[] = [];
  const real = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getUserMedia = async (constraints) => {
    await delay(openDelayMs);
    const stream = await real(constraints);
    streams.push(stream);
    return stream;
  };
  return streams;
}

/** Mounts the practice screen, taps its record button, then destroys the
    screen while `startTake` is still awaiting the (deliberately slow)
    microphone open - the race ticket AU-03 is about - and reports what was
    left running once the open finally resolves. */
async function teardownDuringOpen() {
  const streams = installDelayedMicrophone(300);
  let intervalsArmed = 0;
  const realSetInterval = window.setInterval.bind(window);
  window.setInterval = ((...args: Parameters<typeof setInterval>) => {
    intervalsArmed += 1;
    return realSetInterval(...args);
  }) as typeof setInterval;

  const target = document.createElement('div');
  document.body.append(target);
  const instance = mount(VoicePractice, { target });

  target.querySelector<HTMLButtonElement>('[data-vp-start]')?.click();
  // Comfortably inside the 300ms open delay: the component goes while
  // startTake is still awaiting getUserMedia.
  await delay(50);
  unmount(instance);

  // Longer than the open delay, so getUserMedia resolves and startTake runs
  // to wherever this ticket leaves it before anything is asserted.
  await delay(500);
  window.setInterval = realSetInterval;

  const [stream] = streams;
  return {
    streamOpened: Boolean(stream),
    trackStates: stream ? stream.getTracks().map((t) => t.readyState) : [],
    intervalsArmed
  };
}

/** The second path to the same place: `discard()`/`finish()` call the
    recorder's own `stop()` first, which throws when the recorder is already
    inactive (the capture device disappearing mid-take). Proven against a
    fake `MediaRecorder` over a real fake-device stream, so the tracks
    `recordStream` stops are real `MediaStreamTrack`s. */
async function tracksStopDespiteThrowingRecorder() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const RealMediaRecorder = window.MediaRecorder;

  class ThrowingRecorder {
    ondataavailable: ((event: BlobEvent) => void) | null = null;
    onstop: (() => void) | null = null;
    constructor(
      public stream: MediaStream,
      _options?: MediaRecorderOptions
    ) {}
    start() {}
    stop() {
      throw new DOMException('the recorder was already inactive', 'InvalidStateError');
    }
  }
  window.MediaRecorder = ThrowingRecorder as unknown as typeof MediaRecorder;

  let threw = false;
  try {
    const recording = recordStream(stream);
    try {
      await recording.stop();
    } catch {
      threw = true;
    }
  } finally {
    window.MediaRecorder = RealMediaRecorder;
  }

  return { threw, trackStates: stream.getTracks().map((t) => t.readyState) };
}

async function run() {
  const teardown = await teardownDuringOpen();
  const throwingRecorder = await tracksStopDespiteThrowingRecorder();
  return { teardown, throwingRecorder };
}

run().then(
  (result) => publish(NAME, result),
  (error) => publish(NAME, { error: String(error?.message ?? error) })
);
