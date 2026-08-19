/* Compressing a video note that came out over the ceiling (ticket 22).

   Browser-only, so it lives beside limits.ts rather than inside it: the
   arithmetic that decides whether to re-encode and at what rate is pure and
   Node-tested, this is the half that needs a canvas. The same division
   normalize.ts and photos/bytes.ts already draw.

   There is no encoder in this app to call, so the re-encode is the only
   thing a browser offers: play the captured file, draw each frame to a
   canvas, and record the canvas back through MediaRecorder at a lower
   bitrate - recordTimelapse's mechanism (photos/journey-render.ts), pointed
   at a video source instead of a list of photos. Consequences worth knowing:

     - It runs in real time. A 30-second note costs 30 seconds, which is why
       limits.ts sizes the capture bitrate to keep this the exceptional path
       rather than the routine one.
     - The audio is carried over as a track rather than re-decoded, so speech
       survives whatever the picture gives up.
     - Frames come from the decoder, so a source the browser cannot play
       yields null and the caller keeps the capture. Storing a too-big file
       is a better outcome than losing the recording. */

import { VIDEO_MAX_EDGE, type VideoBitrates } from './limits';

/** Scales the frame to fit inside 1080p without upscaling, keeping the aspect
    ratio - fitContain's rule (photos/journey.ts) for the one case here, where
    the source and the frame are the same shape. A capture already inside the
    cap keeps its own size: re-encoding is about bitrate, and drawing a 720p
    source into a 1080p canvas would only cost bits. */
function frameSize(width: number, height: number): { width: number; height: number } {
  const scale = Math.min(1, VIDEO_MAX_EDGE / height);
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/** A `<video>` wound up to the point where its dimensions are known and it is
    ready to play. Detached from the document: nothing should see it. */
async function loadSource(blob: Blob): Promise<{ video: HTMLVideoElement; url: string } | null> {
  const url = URL.createObjectURL(blob);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = url;
  const ready = new Promise<boolean>((resolve) => {
    video.onloadeddata = () => resolve(true);
    video.onerror = () => resolve(false);
  });
  if (!(await ready) || !video.videoWidth || !video.videoHeight) {
    URL.revokeObjectURL(url);
    return null;
  }
  return { video, url };
}

/** The captured file re-encoded at `target`, or null when this browser could
    not decode or re-record it - in which case the caller keeps what it had.

    `mimeType` is the one the capture already used, so the re-encode lands in
    the same container and the stored `.webm` means what its name says. */
export async function reencodeVideo(
  captured: Blob,
  target: VideoBitrates,
  mimeType: string
): Promise<Blob | null> {
  const loaded = await loadSource(captured);
  if (!loaded) return null;
  const { video, url } = loaded;

  const size = frameSize(video.videoWidth, video.videoHeight);
  // A detached element rather than an OffscreenCanvas, because captureStream()
  // is only on the DOM one (journey-render.ts's header says the same).
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext('2d');
  if (!context) {
    URL.revokeObjectURL(url);
    return null;
  }

  const stream = canvas.captureStream();
  /* The audio comes off the source's own stream rather than being drawn and
     re-encoded: it is already at the rate limits.ts budgeted for, and there
     is nothing a canvas can do to a sound. captureStream on a media element
     is Chromium-only, which is the same floor the rest of this file assumes;
     a build without it re-encodes the picture and drops the sound rather
     than failing, because a silent video note still shows what happened. */
  const sourceStream = (video as HTMLVideoElement & { captureStream?: () => MediaStream }).captureStream?.();
  for (const track of sourceStream?.getAudioTracks() ?? []) stream.addTrack(track);

  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: target.videoBitsPerSecond,
    audioBitsPerSecond: target.audioBitsPerSecond
  });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };
  const finished = new Promise<void>((resolve) => {
    recorder.onstop = () => resolve();
  });

  try {
    /* Draw on every frame the decoder produces rather than on a timer:
       requestVideoFrameCallback fires once per decoded frame, so the canvas
       never shows a frame twice and never misses one. Playback is the clock,
       the way it is in recordTimelapse. */
    const ended = new Promise<void>((resolve) => {
      video.onended = () => resolve();
    });
    recorder.start();
    await video.play();

    const draw = () => {
      context.drawImage(video, 0, 0, size.width, size.height);
      if (!video.ended) requestFrame(video, draw);
    };
    requestFrame(video, draw);
    await ended;

    recorder.stop();
    await finished;
  } finally {
    if (recorder.state !== 'inactive') recorder.stop();
    for (const track of stream.getTracks()) track.stop();
    video.pause();
    video.src = '';
    URL.revokeObjectURL(url);
  }

  return chunks.length > 0 ? new Blob(chunks, { type: mimeType }) : null;
}

/** requestVideoFrameCallback where it exists, a repaint otherwise. The
    fallback can duplicate or drop a frame; it cannot fail, which is what
    matters when the alternative is no re-encode at all. */
function requestFrame(video: HTMLVideoElement, draw: () => void): void {
  const withCallback = video as HTMLVideoElement & {
    requestVideoFrameCallback?: (callback: () => void) => number;
  };
  if (withCallback.requestVideoFrameCallback) withCallback.requestVideoFrameCallback(draw);
  else requestAnimationFrame(draw);
}
