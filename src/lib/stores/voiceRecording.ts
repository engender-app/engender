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

import { chooseFiles } from '$lib/data/fileDialog';
import { VIDEO_SIZE_CEILING } from '$lib/data/videoNotes/limits';
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

/** Why the microphone did not open, for a caller that has to say something
    other than "it did not" - the benchmark flow holds a denied-permission
    state on screen (stores/voiceBenchmark.ts), where an entry's memo button
    only needs a toast. `denied` is a decision a person made and can undo in
    the OS; `unavailable` is a device with no microphone this app can reach. */
export type MicRefusal = 'unsupported' | 'denied' | 'unavailable';

/** Opens the microphone, or says why it stayed shut. Refusal is an ordinary
    outcome here rather than an error, the same treatment pickPhotos gives a
    cancelled picker (photoPicking.ts) - and nothing is said to the person
    from in here, because what to say depends on the screen that asked. */
export async function openMicrophone(): Promise<MediaStream | MicRefusal> {
  if (!MediaRecorder.isTypeSupported(RECORDING_MIME_TYPE)) return 'unsupported';
  try {
    return await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (error) {
    console.error('the microphone could not be opened', error);
    // Capacitor's WebChromeClient turns an Android permission refusal into
    // the same NotAllowedError the browser raises, so one check covers both
    // platforms (see this module's header).
    return error instanceof DOMException && error.name === 'NotAllowedError' ? 'denied' : 'unavailable';
  }
}

/** Captures from a stream the caller already opened, and owns stopping it.
    Split from startRecording() so a second caller can hold the same stream
    open for live analysis (stores/voiceBenchmark.ts) instead of opening a
    second one - two getUserMedia calls means two microphone indicators and,
    on Android, two permission moments for one recording. */
export function recordStream(stream: MediaStream): ActiveRecording {
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

/** Opens the microphone and starts capturing. Null if the browser refused -
    permission denied, no microphone, or an unsupported codec - reported with
    a toast and treated as an ordinary outcome rather than an error. */
export async function startRecording(): Promise<ActiveRecording | null> {
  const stream = await openMicrophone();
  if (stream === 'unsupported') {
    toast(m.recording_unsupported());
    return null;
  }
  if (stream === 'denied' || stream === 'unavailable') {
    toast(m.recording_mic_failed());
    return null;
  }
  return recordStream(stream);
}

/** A recording the person already has, chosen from wherever the device keeps
    them, rather than made here (asked for 2026-08-25: photos offered a
    gallery and these two did not).

    A file input rather than a bridge of its own, which is the same call
    photos/picker.ts makes for the web half: the chooser Android's WebView
    opens for `<input type="file">` is the document picker, and it needs no
    media permission to read the one file somebody hands over.

    `accept` is a hint the dialog is free to ignore, so what the file is gets
    decided by reading it - the comment fileDialog.ts already carries. Null
    for every ordinary outcome, refusal included: backing out of a picker is
    not an error, and neither is picking the wrong thing. */
export async function pickRecording(): Promise<Uint8Array | null> {
  const [file] = await chooseFiles('audio/*');
  if (!file) return null;
  if (!file.type.startsWith('audio/')) {
    toast(m.recording_not_audio());
    return null;
  }
  /* The same 10 MiB ceiling the app already applies to a stored video note,
     because the thing being protected is the same one ADR-0008 is about -
     the archive somebody has to be able to export - and a second number for
     audio is a product call nobody has made. It is about forty minutes of
     the app's own opus, so nothing recorded here can reach it; what it stops
     is an hour of uncompressed WAV going into a backup. */
  if (file.size > VIDEO_SIZE_CEILING) {
    toast(m.recording_too_large());
    return null;
  }
  return new Uint8Array(await file.arrayBuffer());
}
