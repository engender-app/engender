import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/* Phase 5 security ticket 01 (F-02). Both attributes shipped wrong once -
   allowBackup defaulted to true with no rules to narrow it, and the whole
   private directory went to Google's cloud backup and to device-to-device
   transfer. What left was the WebView's localStorage draft, the reminder
   titles and the backup destination's label, in plaintext. Neither
   attribute has anything on a device to fail against, so this is where a
   regression gets caught. */

const root = new URL('../', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), 'utf8');

const manifest = read('android/app/src/main/AndroidManifest.xml');
const rules = read('android/app/src/main/res/xml/data_extraction_rules.xml');

function applicationTag(xml: string): string {
  const match = xml.match(/<application\b[\s\S]*?>/);
  if (!match) throw new Error('application tag not found in AndroidManifest.xml');
  return match[0];
}

/** The domains excluded inside one section of the rules file. */
function excluded(section: 'cloud-backup' | 'device-transfer'): string[] {
  const body = rules.match(new RegExp(`<${section}>([\\s\\S]*?)</${section}>`))?.[1];
  if (!body) throw new Error(`no <${section}> section in data_extraction_rules.xml`);
  return [...body.matchAll(/<exclude\s+domain="([^"]+)"/g)].map((match) => match[1]);
}

describe('android backup policy', () => {
  it('does not let the platform back the app up', () => {
    expect(applicationTag(manifest)).toContain('android:allowBackup="false"');
  });

  it('carries extraction rules as well, which is what reaches device transfer', () => {
    /* From Android 12 the flag above stops cloud backup and nothing else,
       and the app targets 36. The flag still covers Android 11 and older,
       down to the app's floor of API 26, so both are needed. */
    expect(applicationTag(manifest)).toContain(
      'android:dataExtractionRules="@xml/data_extraction_rules"'
    );
  });

  it('excludes every domain from both a cloud backup and a device transfer', () => {
    /* sharedpref holds the reminder titles and the backup destination;
       root reaches the WebView directory, where the entry draft is. The
       encrypted database would survive a backup harmlessly - its key never
       leaves the platform keystore - but it goes too, because what a
       restore of it produces is an unopenable file on a phone that never
       had the key. */
    for (const section of ['cloud-backup', 'device-transfer'] as const) {
      expect(excluded(section)).toEqual(
        expect.arrayContaining(['root', 'file', 'database', 'sharedpref', 'external'])
      );
    }
  });
});
