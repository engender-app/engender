/* Record video through getUserMedia and MediaRecorder on web and
   Android. Capacitor's WebChromeClient handles native CAMERA and
   RECORD_AUDIO permission requests.

   Cap notes at 30 seconds and 1080p. Re-encode oversized output using
   wall-clock duration because MediaRecorder's WebM has no duration
   metadata. Use the renderer's codec fallback chain because a
   supported WebView may have VP8 without VP9. */

import { chooseFiles } from '$lib/data/fileDialog';
import { m } from '$lib/paraglide/messages';
import { reencodeVideo } from '$lib/data/videoNotes/reencode';
import {
  VIDEO_CAPTURE_BITS,
  VIDEO_MAX_DURATION_MS,
  VIDEO_SIZE_CEILING,
  reencodeTarget,
  videoCaptureConstraints
} from '$lib/data/videoNotes/limits';
import { toast } from './toasts.svelte';

/** A video note in an editor: one its entry already has, or one just made
    and not yet stored - EditorRecording's split, for the same reason. */
export type EditorVideo =
  | { kind: 'stored'; video: { id: string; fileName: string } }
  | { kind: 'recorded'; bytes: Uint8Array };

/** The container a video note is stored in (videoNotes/names.ts's fixed
    `.webm`), preferred codecs first. VP9 is smaller at the same quality, so
    a build that has it gets a better picture inside the same ceiling; VP8 is
    the floor every Chromium has; the bare container lets the browser pick. */
const MIME_TYPES = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];

export interface ActiveVideoRecording {
  /** The live stream, for the editor's preview - recording video without
      seeing the frame is not something to ask of anyone. Muted playback
      only: routing the microphone back to the speaker would howl. */
  readonly stream: MediaStream;
  /** Resolves on its own when the 30-second cap is reached, so the caller
      does not have to run a timer of its own to notice. */
  readonly capped: Promise<void>;
  /** Stops capture and returns the stored bytes - re-encoded first if the
      capture came out over the size ceiling - or null if nothing was
      captured. An empty recording is not useful content to attach. */
  stop(): Promise<Uint8Array | null>;
}

const supportedMimeType = (): string | null =>
  typeof MediaRecorder === 'undefined' ? null :
    MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type)) ?? null;

/** Opens the camera and microphone and starts capturing. Null if the browser
    refused - permission denied, no camera, or no WebM encoder - which is
    reported with a toast and treated as an ordinary outcome rather than an
    error, the treatment startRecording gives the same refusals. A cancelled
    owner closes a late stream before any recorder or feedback is created. */
export async function startVideoRecording(signal?: AbortSignal): Promise<ActiveVideoRecording | null> {
  if (signal?.aborted) return null;
  const mimeType = supportedMimeType();
  if (typeof MediaRecorder === 'undefined' || !mimeType) {
    toast(m.video_unsupported());
    return null;
  }

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia(videoCaptureConstraints());
  } catch (error) {
    console.error('the camera could not be opened', error);
    if (!signal?.aborted) toast(m.video_camera_failed());
    return null;
  }
  const stopTracks = () => {
    for (const track of stream.getTracks()) track.stop();
  };
  if (signal?.aborted) {
    stopTracks();
    return null;
  }

  const chunks: Blob[] = [];
  let recorder: MediaRecorder;
  try {
    recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: VIDEO_CAPTURE_BITS.video,
      audioBitsPerSecond: VIDEO_CAPTURE_BITS.audio
    });
  } catch (error) {
    stopTracks();
    throw error;
  }
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };
  let cap: ReturnType<typeof setTimeout> | undefined;
  let failure: unknown;
  let failed = false;
  let settle!: () => void;
  const stopped = new Promise<void>((resolve) => { settle = resolve; });
  const release = () => {
    clearTimeout(cap);
    stopTracks();
    settle();
  };
  recorder.onstop = release;
  recorder.onerror = (event) => {
    failed = true;
    failure = (event as Event & { error: DOMException }).error;
    release();
  };
  const stopRecorder = () => {
    try {
      if (recorder.state !== 'inactive') recorder.stop();
    } catch (error) {
      failed = true;
      failure = error;
      release();
    } finally {
      clearTimeout(cap);
      stopTracks();
    }
  };

  const startedAt = performance.now();
  try {
    recorder.start();
  } catch (error) {
    release();
    throw error;
  }

  /* The duration cap, enforced here rather than trusted to the caller: the
     ceiling only holds if 30 seconds is the most that can ever be captured,
     and a screen that forgot its timer would quietly break it. Stopping the
     recorder is enough - `stop()` below awaits the same promise whether the
     timer or the user got there first. */
  cap = setTimeout(stopRecorder, VIDEO_MAX_DURATION_MS);

  const finish = async (): Promise<Uint8Array | null> => {
    if (!failed) stopRecorder();
    await stopped;
    if (failed) throw failure;
    const durationMs = performance.now() - startedAt;
    if (chunks.length === 0) return null;

    const captured = new Blob(chunks, { type: mimeType });
    const target = reencodeTarget(captured.size, durationMs);
    if (!target) return new Uint8Array(await captured.arrayBuffer());

    /* Over the ceiling despite the bitrate hint, so it gets compressed
       further rather than accepted as-is (ADR-0008's photo rule applied to
       video). Whichever came out smaller is what gets stored: a re-encode
       that somehow grew the file would be a worse outcome than keeping the
       capture, and one comparison is cheaper than reasoning about when
       that can happen. */
    const smaller = await reencodeVideo(captured, target, mimeType);
    const stored = smaller && smaller.size < captured.size ? smaller : captured;
    return new Uint8Array(await stored.arrayBuffer());
  };

  let result: Promise<Uint8Array | null> | undefined;
  return {
    stream,
    capped: stopped,
    stop() {
      return result ??= finish();
    }
  };
}

/** How long a picked file runs, in milliseconds, or null where the browser
    will not say.

    Asked of the file rather than assumed, unlike a capture: limits.ts notes
    that WebM out of MediaRecorder carries no duration, so this store times
    its own recordings by the wall clock. A file from a camera roll is not
    that - an mp4 carries its duration in the container - and the duration is
    what decides whether this is a video note at all. */
async function durationOf(file: File): Promise<number | null> {
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<number | null>((resolve) => {
      const probe = document.createElement('video');
      probe.preload = 'metadata';
      probe.muted = true;
      probe.onloadedmetadata = () =>
        resolve(Number.isFinite(probe.duration) ? probe.duration * 1000 : null);
      probe.onerror = () => resolve(null);
      probe.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** A video the person already has, chosen from wherever the device keeps
    them, rather than recorded here (asked for 2026-08-25).

    It answers to the same two caps a recording does, and for the reason
    limits.ts gives: the caps exist to keep the archive exportable, so where
    they came from makes no difference. Over 30 seconds is refused rather
    than trimmed - trimming is an editor, and a video note is not one - and
    over the size ceiling goes through the same re-encode a capture does. A
    re-encode this browser cannot do is a refusal too, because the
    alternative is putting a file into a backup that the ceiling exists to
    keep out of it.

    The half-second of slack is for a file recorded elsewhere at exactly
    thirty seconds: a container that rounds up should not be told it is too
    long. */
export async function pickVideo(): Promise<Uint8Array | null> {
  const [file] = await chooseFiles('video/*');
  if (!file) return null;
  if (!file.type.startsWith('video/')) {
    toast(m.video_not_a_video());
    return null;
  }

  const durationMs = await durationOf(file);
  if (durationMs != null && durationMs > VIDEO_MAX_DURATION_MS + 500) {
    toast(m.video_too_long());
    return null;
  }
  if (file.size <= VIDEO_SIZE_CEILING) return new Uint8Array(await file.arrayBuffer());

  const mimeType = supportedMimeType();
  const target = reencodeTarget(file.size, durationMs ?? VIDEO_MAX_DURATION_MS);
  const smaller = mimeType && target ? await reencodeVideo(file, target, mimeType) : null;
  if (!smaller) {
    toast(m.video_too_large());
    return null;
  }
  return new Uint8Array(await smaller.arrayBuffer());
}
