/* Guard Android source permission removal directives and EN/PL copy.
   Capacitor serves APK assets locally, so the app removes INTERNET.
   AndroidX contributes permissions at merge time. The packaged
   permission gate uses aapt2 in check-release-artifacts.mjs, and
   BackupManifestContractTest checks installed permissions and components.
   Explain each source grant beside its manifest declaration. */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { expectedAndroidPermissions } from '../../../scripts/check-release-artifacts.mjs';

const manifest = readFileSync(new URL('../../../android/app/src/main/AndroidManifest.xml', import.meta.url), 'utf8');
const privacyPolicyEn = readFileSync(new URL('../../../PRIVACY.md', import.meta.url), 'utf8');
const privacyPolicyPl = readFileSync(new URL('../../../PRIVACY.pl.md', import.meta.url), 'utf8');

const declared = (): string[] =>
  [...manifest.matchAll(/<uses-permission\b[^>]*>/g)]
    .filter(([tag]) => !tag.includes('tools:node="remove"'))
    .map(([tag]) => /android:name="android\.permission\.([A-Z_]+)"/.exec(tag)![1]);

/** Everything this manifest asks for, and why, one line each. */
const EXPECTED = [
  'POST_NOTIFICATIONS', // reminders and check-ins
  'SCHEDULE_EXACT_ALARM', // a reminder at a time the person chose
  'RECEIVE_BOOT_COMPLETED', // rescheduling those alarms after a restart
  'RECORD_AUDIO', // voice notes, through getUserMedia
  'MODIFY_AUDIO_SETTINGS', // the same
  'CAMERA', // video notes, through getUserMedia
  'WAKE_LOCK' // keep scheduled encrypted delivery running while the screen sleeps
];

describe('android permissions', () => {
  it('remains installable without camera, autofocus or microphone hardware', () => {
    for (const feature of ['camera', 'camera.autofocus', 'microphone']) {
      const declaration = [...manifest.matchAll(/<uses-feature\b[^>]*>/g)]
        .find(([tag]) => tag.includes(`android:name="android.hardware.${feature}"`));
      expect(declaration, feature).toBeDefined();
      expect(declaration![0]).toContain('android:required="false"');
    }
  });

  it('does not ask for INTERNET, which is the claim a reader can check', () => {
    expect(declared()).not.toContain('INTERNET');
  });

  it('opts out of WebView diagnostic uploads at the application level', () => {
    const application = /<application\b[^>]*>([\s\S]*?)<\/application>/.exec(manifest)?.[1] ?? '';
    const metrics = [...application.matchAll(/<meta-data\b[^>]*>/g)]
      .filter(([tag]) => tag.includes('android:name="android.webkit.WebView.MetricsOptOut"'));
    expect(metrics).toHaveLength(1);
    expect(metrics[0][0]).toContain('android:value="true"');
  });

  it('keeps Safe Browsing at its enabled platform default', () => {
    expect(manifest).not.toContain('android.webkit.WebView.EnableSafeBrowsing');
  });

  it('declares exactly these seven, so an addition has to be argued for', () => {
    expect(declared().sort()).toEqual([...EXPECTED].sort());
  });

  it('removes unused network and foreground WorkManager permissions and components', () => {
    for (const name of ['android.permission.ACCESS_NETWORK_STATE', 'android.permission.FOREGROUND_SERVICE',
      'androidx.work.impl.foreground.SystemForegroundService',
      'androidx.work.impl.background.systemalarm.ConstraintProxy$NetworkStateProxy']) {
      const tag = [...manifest.matchAll(/<(?:uses-permission|service|receiver)\b[^>]*>/g)]
        .find(([tag]) => tag.includes(`android:name="${name}"`));
      expect(tag, name).toBeDefined();
      expect(tag![0]).toContain('tools:node="remove"');
    }
  });
});

const INSTALLED = expectedAndroidPermissions().map(name => name.replace(/^android\.permission\./, ''));

describe('privacy policy names every installed permission', () => {
  it.each(INSTALLED)('%s appears in the English policy', (permission) => {
    expect(privacyPolicyEn).toContain(permission);
  });

  it.each(INSTALLED)('%s appears in the Polish policy', (permission) => {
    expect(privacyPolicyPl).toContain(permission);
  });

  it('both policies carry the two sections Play looks for: a contact and how to delete', () => {
    expect(privacyPolicyEn).toMatch(/^## Contact$/m);
    expect(privacyPolicyEn).toMatch(/^## Deleting your data$/m);
    expect(privacyPolicyPl).toMatch(/^## Kontakt$/m);
    expect(privacyPolicyPl).toMatch(/^## Usuwanie danych$/m);
  });

  it('both policies still say the app requests no INTERNET permission', () => {
    expect(privacyPolicyEn).toContain('does not request the `INTERNET` permission');
    expect(privacyPolicyPl).toContain('nie prosi o uprawnienie `INTERNET`');
  });

  it('both policies explain diagnostic opt-out and retained Safe Browsing', () => {
    expect(privacyPolicyEn).toContain('opts out of WebView diagnostic uploads to Google');
    expect(privacyPolicyEn).toMatch(/Google Safe Browsing[\s\S]*?enabled default/);
    expect(privacyPolicyPl).toContain('rezygnuje z wysyłania danych diagnostycznych WebView do Google');
    expect(privacyPolicyPl).toMatch(/Google Safe Browsing[\s\S]*?domyślnie włączon/);
  });

  it('both policies distinguish keyboard and browser network requests', () => {
    expect(privacyPolicyEn).toMatch(/keyboard and browser can make their own network requests\s+independently of engender/);
    expect(privacyPolicyPl).toMatch(/Klawiatura i przeglądarka mogą wysyłać własne żądania sieciowe\s+niezależnie od engender/);
  });
});
