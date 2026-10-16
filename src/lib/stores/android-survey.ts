/* What an Android cold boot asks before it knows how to open the journal
   (ticket 11's survey; ux-carpet 207 made it concurrent).

   Three questions: whether a passphrase or PIN keystore file exists, whether
   the Android Keystore holds a device key (and whether it wants the user
   present), and whether the journal exists and is a plaintext one from before
   encryption. None depends on another, and all three are asked at once.

   They used to be asked one after another. Each native answer takes a few
   milliseconds, but a bridge result reaches JS through the Android UI
   thread, and on a cold launch that thread spends ~300ms drawing the
   WebView's first frame just as the survey runs. Measured on the Pixel
   (2026-09-24, native Log timings and a main-looper trace): Keystore.status
   finished in 3-8ms and isPlaintextDatabase in 3-4ms, yet the survey took
   386-462ms, because whichever answer was still to come waited behind that
   one frame. Asked together, all three are in flight before it.

   Rune-free and handed its three questions, so the Node tier can test the
   concurrency itself (android-survey.test.ts). */

import type { KeystoreBootSource } from '../data/keystore-file';

export interface AndroidSurveyPorts {
  readKeystoreSource(): Promise<KeystoreBootSource>;
  keystoreStatus(): Promise<{ hasKey: boolean; authRequired?: boolean }>;
  inspectJournal(): Promise<{ exists: boolean; plaintext: boolean }>;
}

export interface AndroidSurvey {
  keystoreSecretSource: KeystoreBootSource;
  nativeDeviceKeyExists: boolean;
  nativeDeviceKeyAuthRequired: boolean;
  plaintextJournalPresent: boolean;
  journalPresent: boolean;
}

export async function surveyAndroid(ports: AndroidSurveyPorts): Promise<AndroidSurvey> {
  const [keystoreSecretSource, status, journal] = await Promise.all([
    ports.readKeystoreSource(),
    ports.keystoreStatus(),
    ports.inspectJournal()
  ]);
  return {
    keystoreSecretSource,
    nativeDeviceKeyExists: status.hasKey,
    /* Unknown reads as required: a key that might want the user present is
       never opened without asking. */
    nativeDeviceKeyAuthRequired: status.authRequired ?? true,
    plaintextJournalPresent: journal.plaintext,
    journalPresent: journal.exists
  };
}
