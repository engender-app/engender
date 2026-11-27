/* Ask for the secret keystore file, Android key status and
   plaintext journal status concurrently. Native reads take
   single-digit milliseconds, but the first WebView frame can hold
   the UI thread for about 300ms and strand sequential bridge
   answers. Measured serial survey time was 386–462ms. Inject the
   three rune-free reads for android-survey.test.ts. */

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
