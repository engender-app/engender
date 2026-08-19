/* Recording a video note in the editor (ticket 22).

   One seam, both platforms, for voiceRecording.ts's reason: video capture is
   plain `getUserMedia`/`MediaRecorder`, which the Chromium WebView Capacitor
   wraps on Android handles exactly like the browser does. Capacitor's own
   WebChromeClient requests CAMERA and RECORD_AUDIO at the OS level and grants
   the WebView resource on approval - see AndroidManifest.xml's permission
   block - so there is no native bridge here the way photos.ts needs one for
   the still-camera intent.

   Unlike a voice recording, a video note is not stored as MediaRecorder
   produced it. Ticket 22 caps it at 30 seconds and 1080p and asks for a
   re-encode when the file is still too big afterwards, so this store owns
   three things a recording does not: the constraints that pin the
   resolution, the timer that enforces the duration, and the wall clock the
   re-encode's target is worked out from (limits.ts explains why the clock
   has to be ours - WebM out of MediaRecorder carries no duration).

   The codec fallback chain is journey-render.ts's rather than
   voiceRecording.ts's single fixed type: video codec support genuinely
   varies where audio/opus does not, and a WebView at this app's floor
   (capacitor.config.ts's minWebViewVersion) may have VP8 without VP9. */

import { m } from '$lib/paraglide/messages';
import { reencodeVideo } from '$lib/data/videoNotes/reencode';
import {
  VIDEO_CAPTURE_BITS,
  VIDEO_MAX_DURATION_MS,
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
  MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type)) ?? null;

/** Opens the camera and microphone and starts capturing. Null if the browser
    refused - permission denied, no camera, or no WebM encoder - which is
    reported with a toast and treated as an ordinary outcome rather than an
    error, the treatment startRecording gives the same refusals. */
export async function startVideoRecording(): Promise<ActiveVideoRecording | null> {
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
    toast(m.video_camera_failed());
    return null;
  }

  const chunks: Blob[] = [];
  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: VIDEO_CAPTURE_BITS.video,
    audioBitsPerSecond: VIDEO_CAPTURE_BITS.audio
  });
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };
  const stopped = new Promise<void>((resolve) => {
    recorder.onstop = () => resolve();
  });

  const startedAt = performance.now();
  recorder.start();

  /* The duration cap, enforced here rather than trusted to the caller: the
     ceiling only holds if 30 seconds is the most that can ever be captured,
     and a screen that forgot its timer would quietly break it. Stopping the
     recorder is enough - `stop()` below awaits the same promise whether the
     timer or the user got there first. */
  const cap = setTimeout(() => {
    if (recorder.state !== 'inactive') recorder.stop();
  }, VIDEO_MAX_DURATION_MS);

  return {
    stream,
    capped: stopped,
    async stop() {
      clearTimeout(cap);
      if (recorder.state !== 'inactive') recorder.stop();
      await stopped;
      const durationMs = performance.now() - startedAt;
      // Closes the camera and mic indicators the OS shows while a stream is
      // live - stopping the recorder alone leaves the tracks open.
      for (const track of stream.getTracks()) track.stop();
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
    }
  };
}
