/* Browser-tier check for ticket 22's video note re-encode.

   Only provable here. reencode.ts needs a canvas, a <video> that decodes,
   and MediaRecorder - none of which exist in Node, so a Node-tier test could
   only assert against a stub encoder and would prove nothing about whether
   the file actually comes out smaller. limits.ts holds the arithmetic and is
   tested there; this is the half that has to meet a real Chromium.

   The source video is made here rather than captured: getUserMedia would
   need a camera permission and a fake device flag, while a canvas capture
   stream produces a real WebM through the same encoder the app records
   with. Deliberately recorded at a high bitrate over noisy frames, because
   an easily-compressed source (a flat colour) encodes to almost nothing at
   any bitrate and the comparison would prove nothing.

   The frames are noise with one solid marker square, so the re-encoded file
   can be checked for still being the same video rather than only for being
   smaller - a re-encode that produced a black file would pass a size check
   on its own. */

import { reencodeVideo } from '../../src/lib/data/videoNotes/reencode.ts';
import { reencodeTarget, VIDEO_MAX_EDGE, VIDEO_SIZE_CEILING } from '../../src/lib/data/videoNotes/limits.ts';
import { videoFileName } from '../../src/lib/data/videoNotes/names.ts';

const MIME = 'video/webm';
const MARKER = '#28c850';
const SOURCE_WIDTH = 640;
const SOURCE_HEIGHT = 480;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** A real WebM recorded off a canvas, the way the timelapse is
    (journey-render.ts). `bitsPerSecond` is deliberately generous so the
    source is genuinely fat and a lower target has something to take away. */
async function recordSource(bitsPerSecond: number, ms: number): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = SOURCE_WIDTH;
  canvas.height = SOURCE_HEIGHT;
  const context = canvas.getContext('2d')!;

  const paint = (frame: number) => {
    /* Noise, so the encoder cannot cheat: a flat colour or a slow gradient
       compresses to near nothing whatever bitrate it is given, which would
       make a smaller-after-re-encode assertion meaningless. */
    const image = context.createImageData(SOURCE_WIDTH, SOURCE_HEIGHT);
    for (let i = 0; i < image.data.length; i += 4) {
      const v = (Math.sin(i * 0.37 + frame) * 127 + 128) & 0xff;
      image.data[i] = v;
      image.data[i + 1] = (v * 3) & 0xff;
      image.data[i + 2] = (v * 7) & 0xff;
      image.data[i + 3] = 255;
    }
    context.putImageData(image, 0, 0);
    // The marker: a solid block the re-encoded file must still show.
    context.fillStyle = MARKER;
    context.fillRect(0, 0, SOURCE_WIDTH / 2, SOURCE_HEIGHT / 2);
  };

  paint(0);
  const stream = canvas.captureStream(20);
  const recorder = new MediaRecorder(stream, { mimeType: MIME, videoBitsPerSecond: bitsPerSecond });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };
  const stopped = new Promise<void>((resolve) => {
    recorder.onstop = () => resolve();
  });

  recorder.start();
  const until = performance.now() + ms;
  let frame = 0;
  while (performance.now() < until) {
    paint(frame++);
    await delay(25);
  }
  recorder.stop();
  await stopped;
  for (const track of stream.getTracks()) track.stop();
  return new Blob(chunks, { type: MIME });
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

async function run() {
  const result: Record<string, unknown> = {};

  result.fileName = videoFileName('11111111-2222-3333-4444-555555555555');

  // Two seconds at 12 Mbps of noise: a genuinely fat file, standing in for a
  // capture that overshot MediaRecorder's bitrate hint.
  const source = await recordSource(12_000_000, 2000);
  result.sourceSize = source.size;
  result.sourceType = source.type;
  result.sourceFrame = await firstFrame(source);

  /* The target the app would actually use for a file this size, taken from
     limits.ts rather than invented here - the probe should exercise the real
     decision, not a convenient one. The source is short, so its own
     duration is passed the way videoRecording.ts passes its wall clock. */
  const asIfOversized = reencodeTarget(VIDEO_SIZE_CEILING + 1, 2000);
  result.targetForOversized = asIfOversized;

  /* And a deliberately punishing target, to prove the picture is what
     absorbs the cut: 400 kbps over the same noise has to come out smaller
     than 12 Mbps did, or the re-encode is not doing anything. */
  const reencoded = await reencodeVideo(source, { videoBitsPerSecond: 400_000, audioBitsPerSecond: 64_000 }, MIME);
  result.reencodedSize = reencoded?.size ?? null;
  result.reencodedType = reencoded?.type ?? null;
  result.reencodedFrame = reencoded ? await firstFrame(reencoded) : null;

  // A source at 480p must not be stretched up to 1080: re-encoding is about
  // bitrate, and drawing a small frame into a big canvas only costs bits.
  result.maxEdge = VIDEO_MAX_EDGE;

  // Nothing to decode: the caller keeps its capture rather than losing it.
  const rubbish = new Blob([new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])], { type: MIME });
  result.undecodableGivesNull =
    (await reencodeVideo(rubbish, { videoBitsPerSecond: 400_000, audioBitsPerSecond: 64_000 }, MIME)) === null;

  (window as unknown as { __videoNoteProbeResult: unknown }).__videoNoteProbeResult = result;
  document.body.dataset.videoNoteProbeReady = 'true';
}

run().catch((err) => {
  (window as unknown as { __videoNoteProbeResult: unknown }).__videoNoteProbeResult = {
    error: String(err?.stack ?? err)
  };
  document.body.dataset.videoNoteProbeReady = 'true';
});
