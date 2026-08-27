/* What the app asks Android for, and what it deliberately does not (phase 5
   security ticket 03).

   The permission list is the one privacy claim a reader can check without
   trusting the code: CONTEXT.md says journal data stays on the device unless
   the person deliberately creates or delivers an archive, and an app that
   declares INTERNET is asking to be taken at its word instead. Nothing here
   opens a socket - Capacitor serves the bundle out of the APK through its
   asset loader, and tests/browser-tier/verify-build.mjs asserts zero
   off-origin requests online and offline - so the declaration bought nothing
   and is gone.

   This file reads the manifest this repository writes. What ships is the merged
   manifest, and the merge is not a no-op: androidx.biometric brings USE_BIOMETRIC
   and USE_FINGERPRINT for the app lock, and Capacitor generates a
   DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION of its own, so a reader of the
   installed app sees nine where this file declares six. Checked on 2026-08-27
   against android/app/build/intermediates/merged_manifest/debug/: INTERNET is
   absent from the merged list too, which is the claim that matters here. The
   merged file is a build artifact, so it is not what this test can read.

   A permission that reappears without a comment naming what needs it fails
   here rather than shipping. The reasoning for each one that is declared lives
   beside it in the manifest. */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const manifest = readFileSync(new URL('../android/app/src/main/AndroidManifest.xml', import.meta.url), 'utf8');

const declared = (): string[] =>
  [...manifest.matchAll(/<uses-permission\s+android:name="android\.permission\.([A-Z_]+)"/g)].map(
    (match) => match[1]
  );

/** Everything this manifest asks for, and why, one line each. */
const EXPECTED = [
  'POST_NOTIFICATIONS', // reminders and check-ins
  'SCHEDULE_EXACT_ALARM', // a reminder at a time the person chose
  'RECEIVE_BOOT_COMPLETED', // rescheduling those alarms after a restart
  'RECORD_AUDIO', // voice notes, through getUserMedia
  'MODIFY_AUDIO_SETTINGS', // the same
  'CAMERA' // video notes, through getUserMedia
];

describe('android permissions', () => {
  it('does not ask for INTERNET, which is the claim a reader can check', () => {
    expect(declared()).not.toContain('INTERNET');
  });

  it('declares exactly these six, so a seventh has to be argued for', () => {
    expect(declared().sort()).toEqual([...EXPECTED].sort());
  });
});
