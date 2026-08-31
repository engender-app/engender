import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/* Phase 5 security ticket 07 (G-06). MainActivity carried a bare MAIN
   filter and exported="true", which is what let any app on the phone start
   the journal and set the gd_route extra. The two disguise aliases are the
   actual entry points - LAUNCHER lives there, not on MainActivity - and an
   activity-alias may stay exported with its target closed, so both launcher
   identities keep working with this locked down. */

const root = new URL('../', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), 'utf8');

const manifest = read('android/app/src/main/AndroidManifest.xml');

function tag(xml: string, matcher: RegExp, label: string): string {
  const match = xml.match(matcher);
  if (!match) throw new Error(`${label} not found in AndroidManifest.xml`);
  return match[0];
}

const mainActivity = () =>
  tag(manifest, /<activity\b[\s\S]*?android:name="\.MainActivity"[\s\S]*?>/, 'MainActivity tag');

const alias = (name: string) =>
  tag(manifest, new RegExp(`<activity-alias\\b[\\s\\S]*?android:name="${name}"[\\s\\S]*?</activity-alias>`), `${name} alias`);

describe('android manifest exported surface', () => {
  it('does not let another app start MainActivity', () => {
    expect(mainActivity()).toContain('android:exported="false"');
  });

  for (const name of ['\\.disguise\\.LauncherDefault', '\\.disguise\\.LauncherDisguised']) {
    it(`keeps ${name.replace(/\\/g, '')} exported with the launcher category`, () => {
      const xml = alias(name);
      expect(xml).toContain('android:exported="true"');
      expect(xml).toContain('android.intent.category.LAUNCHER');
    });
  }
});
