/* Recording a voice note in the editor (ticket 24).

   One seam, both platforms, unlike photoPicking.ts's camera capture: an
   Android photo needs the system camera app (photos/picker.ts), but audio
   capture is plain `getUserMedia`/`MediaRecorder`, which the same Chromium
   WebView Capacitor already wraps on Android handles exactly like the
   browser does. Capacitor's own WebChromeClient requests RECORD_AUDIO at
   the OS level and grants the WebView resource on approval - see
   AndroidManifest.xml's permission block - so there is no native bridge
   for this the way photos.ts needs one for the camera intent.

   No normalize() step: ticket 24 excludes client-side audio effects, so
   the bytes MediaRecorder produced are exactly what gets stored. */

import { m } from '$lib/paraglide/messages';
import { toast } from './toasts.svelte';

/** A recording in an editor: one its entry already has, or one just made
    and not yet stored - the same "stored vs picked" split EditorPhoto
    draws, for the same reason (photoPicking.ts). */
export type EditorRecording =
  | { kind: 'stored'; recording: { id: string; fileName: string } }
  | { kind: 'recorded'; bytes: Uint8Array };

/** The container every recording is stored in (voiceRecordings/names.ts's
    fixed `.webm` extension). Both this app's platforms - the web build and
    Android's bundled WebView - are Chromium-based, so one fixed mime type
    is the same "no fallback chain" choice normalize() makes for JPEG. */
const RECORDING_MIME_TYPE = 'audio/webm;codecs=opus';

export interface ActiveRecording {
  /** Stops capture and returns the recorded bytes, or null if nothing was
      captured - an empty recording is not useful content to attach. */
  stop(): Promise<Uint8Array | null>;
}

/** Opens the microphone and starts capturing. Null if the browser refused -
    permission denied, no microphone, or an unsupported codec - which is
    reported with a toast and treated as an ordinary outcome rather than an
    error, the same treatment pickPhotos/capturePhoto give a cancelled
    picker (photoPicking.ts). */
export async function startRecording(): Promise<ActiveRecording | null> {
  if (!MediaRecorder.isTypeSupported(RECORDING_MIME_TYPE)) {
    toast(m.recording_unsupported());
    return null;
  }

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (error) {
    console.error('the microphone could not be opened', error);
    toast(m.recording_mic_failed());
    return null;
  }

  const chunks: Blob[] = [];
  const recorder = new MediaRecorder(stream, { mimeType: RECORDING_MIME_TYPE });
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };
  const stopped = new Promise<void>((resolve) => {
    recorder.onstop = () => resolve();
  });
  recorder.start();

  return {
    async stop() {
      recorder.stop();
      await stopped;
      // Closes the mic indicator the OS/browser shows while a stream is
      // live - stopping the recorder alone leaves the track open.
      for (const track of stream.getTracks()) track.stop();
      if (chunks.length === 0) return null;
      return new Uint8Array(await new Blob(chunks, { type: RECORDING_MIME_TYPE }).arrayBuffer());
    }
  };
}
