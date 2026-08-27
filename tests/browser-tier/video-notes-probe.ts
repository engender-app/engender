/* Browser-tier check for ticket 22's video notes.

   Only provable here. Capture is getUserMedia and MediaRecorder, the
   re-encode needs a canvas and a decoding <video>, and none of the four
   exist in Node - so a Node-tier test could only assert against stubs and
   would prove nothing about whether a real file comes back smaller with both
   its tracks. limits.ts holds the arithmetic and stays under Node tests;
   this is the half that has to meet a real Chromium.

   run.mjs launches this tier with a fake camera and microphone and a
   pre-granted permission, which is what lets the probe drive the app's own
   startVideoRecording() rather than a stand-in. The fake device produces a
   moving pattern with a tone on the audio track, so both halves of a video
   note are present and the re-encode has something real to carry.

   The audio assertion is the one that earned its keep: reencode.ts has to
   mute the <video> it plays to satisfy the autoplay policy, and a mute that
   also silenced the captured track would store every oversized note without
   its sound. */

import { reencodeVideo } from '../../src/lib/data/videoNotes/reencode.ts';
import {
  reencodeTarget,
  videoCaptureConstraints,
  VIDEO_MAX_SHORT_EDGE,
  VIDEO_SIZE_CEILING
} from '../../src/lib/data/videoNotes/limits.ts';
import { videoFileName } from '../../src/lib/data/videoNotes/names.ts';
import { startVideoRecording } from '../../src/lib/stores/videoRecording.ts';
import { publish } from '../probe-handshake.mjs';

const NAME = 'video-note-probe';
const MIME = 'video/webm';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** A real capture through the app's own store, against Chromium's fake camera
    and microphone (run.mjs supplies the flags). This is the whole point of
    doing it here: the fake device gives a moving pattern plus a tone on the
    audio track, so the bytes that come back have both halves a video note is
    supposed to have, and the re-encode has something real to carry over. */
async function captureThroughTheApp(ms: number): Promise<Uint8Array | null> {
  const active = await startVideoRecording();
  if (!active) return null;
  await delay(ms);
  return active.stop();
}

/** The centre of the marker quadrant in the video's first presented frame.

    Played rather than seeked, for journey-probe.ts's reason: WebM out of
    MediaRecorder carries no duration, so there is no timestamp to seek to,
    and `loadeddata` is too early to draw from - requestVideoFrameCallback is
    the event that means a frame exists. */
async function firstFrame(blob: Blob): Promise<{ width: number; height: number; marker: number[] }> {
  const url = URL.createObjectURL(blob);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.src = url;
  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve();
      video.onerror = () => reject(new Error('the re-encoded video did not decode'));
    });
    await video.play();
    await new Promise<void>((resolve) => {
      const withCallback = video as HTMLVideoElement & {
        requestVideoFrameCallback?: (cb: () => void) => number;
      };
      if (withCallback.requestVideoFrameCallback) withCallback.requestVideoFrameCallback(() => resolve());
      else setTimeout(resolve, 300);
    });

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d')!;
    context.drawImage(video, 0, 0);
    const at = context.getImageData(video.videoWidth / 4, video.videoHeight / 4, 1, 1).data;
    return {
      width: video.videoWidth,
      height: video.videoHeight,
      marker: [at[0], at[1], at[2]]
    };
  } finally {
    video.pause();
    video.src = '';
    URL.revokeObjectURL(url);
  }
}

/** How many audio tracks the file actually carries, read by handing it to a
    fresh element and asking - `audioTracks` is not in Chromium, so this uses
    the mozHasAudio/webkitAudioDecodedByteCount pair the platform does expose. */
async function hasAudio(blob: Blob): Promise<boolean> {
  const url = URL.createObjectURL(blob);
  const video = document.createElement('video');
  video.muted = true;
  video.src = url;
  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve();
      video.onerror = () => reject(new Error('did not decode while checking for audio'));
    });
    await video.play();
    // Decoded byte counters only move once something has actually been
    // decoded, so give playback a moment before reading them.
    await delay(400);
    const probe = video as HTMLVideoElement & { webkitAudioDecodedByteCount?: number };
    return (probe.webkitAudioDecodedByteCount ?? 0) > 0;
  } finally {
    video.pause();
    video.src = '';
    URL.revokeObjectURL(url);
  }
}

async function run() {
  const result: Record<string, unknown> = {};
  const step = (name: string) => console.log('STEP', name);

  result.fileName = videoFileName('11111111-2222-3333-4444-555555555555');
  result.constraints = videoCaptureConstraints();

  /* The real capture path: getUserMedia, MediaRecorder, the store's own caps
     and its own bitrate hints. Two seconds, so the run stays short - the
     30-second cap is a setTimeout in the same function and waiting it out
     would add half a minute to every browser-tier run for one assertion. */
  step('capture');
  const captured = await captureThroughTheApp(2000);
  result.captured = captured !== null;
  if (!captured) {
    publish(NAME, { ...result, error: 'startVideoRecording() refused, so there is nothing to re-encode' });
    return;
  }

  const source = new Blob([captured as BlobPart], { type: MIME });
  result.sourceSize = source.size;
  step('sourceFrame');
  result.sourceFrame = await firstFrame(source);
  step('sourceAudio');
  result.sourceHasAudio = await hasAudio(source);

  /* Under the ceiling, so the store returned the capture untouched - which is
     the ordinary path and worth stating, because it is what keeps the
     real-time re-encode off the common case. */
  result.capturedIsUnderCeiling = source.size <= VIDEO_SIZE_CEILING;
  result.targetForCapture = reencodeTarget(source.size, 2000);

  /* The target the store would use for a file that had overshot, taken from
     limits.ts rather than invented here. */
  result.targetForOversized = reencodeTarget(VIDEO_SIZE_CEILING + 1, 2000);

  /* A deliberately punishing target over the real capture, to prove the
     re-encode both shrinks the file and keeps both of its tracks. */
  step('reencode');
  const reencoded = await reencodeVideo(source, { videoBitsPerSecond: 200_000, audioBitsPerSecond: 32_000 }, MIME);
  result.reencodedSize = reencoded?.size ?? null;
  result.reencodedType = reencoded?.type ?? null;
  try {
    step('reencodedFrame');
    result.reencodedFrame = reencoded ? await firstFrame(reencoded) : null;
  } catch (error) {
    result.reencodedFrame = null;
    result.reencodedFrameError = String((error as Error)?.message ?? error);
  }
  try {
    step('reencodedAudio');
    result.reencodedHasAudio = reencoded ? await hasAudio(reencoded) : null;
  } catch (error) {
    result.reencodedHasAudio = null;
    result.reencodedAudioError = String((error as Error)?.message ?? error);
  }

  result.maxShortEdge = VIDEO_MAX_SHORT_EDGE;

  // Nothing to decode: the caller keeps its capture rather than losing it.
  const rubbish = new Blob([new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])], { type: MIME });
  step('undecodable');
  result.undecodableGivesNull =
    (await reencodeVideo(rubbish, { videoBitsPerSecond: 400_000, audioBitsPerSecond: 64_000 }, MIME)) === null;

  publish(NAME, result);
}

run().catch((err) => publish(NAME, { error: String(err?.stack ?? err) }));
