/* The in-app camera behind a progress photo.

   Every other still photo goes through the OS camera (ADR-0033), which can
   show nothing of this app over its viewfinder. A progress photo needs one
   thing on top of the live picture: the last shot in the same pose, faint,
   so the body can be lined up the same way. So this opens the camera the
   way a video note already does (videoRecording.ts: getUserMedia in the
   WebView, CAMERA granted through Capacitor's WebChromeClient), without the
   microphone, and takes the shot by drawing one video frame to a canvas.

   The frame kept is the part the 3:4 preview shows (coverCrop.ts), so the
   stored photo is the one that was lined up. The bytes then go through
   normalizePhoto like any picked photo: resized, re-encoded, thumbnail
   made, nothing of the camera's metadata kept. */

import { coverCrop } from '$lib/data/photos/coverCrop';
import { normalizePhoto } from '$lib/data/photos/normalize';
import type { NormalizedPhoto } from '$lib/data/journal/photos';

/** Width over height of the preview and of every shot it takes. */
const PROGRESS_FRAME_ASPECT = 3 / 4;

export type CameraFacing = 'user' | 'environment';

/** The camera facing `facing`, or null where there is none to open -
    no getUserMedia, permission refused, no camera. Null is an ordinary
    outcome: the sheet falls back to the OS camera without a ghost. */
export async function openCameraStream(facing: CameraFacing): Promise<MediaStream | null> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) return null;
  try {
    return await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1920 } },
      audio: false
    });
  } catch (error) {
    console.error('the progress photo camera could not be opened', error);
    return null;
  }
}

export function stopCameraStream(stream: MediaStream | null): void {
  for (const track of stream?.getTracks() ?? []) track.stop();
}

/** The frame the video is showing now, cropped to the preview's 3:4 and
    normalized for storage. Not mirrored, like the preview itself, so the
    ghost of this shot lines up with the next one whichever camera takes
    it. */
export async function captureFrame(video: HTMLVideoElement): Promise<NormalizedPhoto> {
  const crop = coverCrop(video.videoWidth, video.videoHeight, PROGRESS_FRAME_ASPECT);
  const canvas = document.createElement('canvas');
  canvas.width = crop.width;
  canvas.height = crop.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('no 2d canvas for the progress photo');
  context.drawImage(video, crop.x, crop.y, crop.width, crop.height, 0, 0, crop.width, crop.height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
  if (!blob) throw new Error('the progress photo frame could not be encoded');
  return normalizePhoto(new Uint8Array(await blob.arrayBuffer()));
}
