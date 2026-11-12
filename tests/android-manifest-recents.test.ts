import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const root = new URL('../', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), 'utf8');

const manifest = read('android/app/src/main/AndroidManifest.xml');

function mainActivityTag(xml: string): string {
  const match = xml.match(/<activity\b[\s\S]*?android:name="\.MainActivity"[\s\S]*?>/);
  if (!match) throw new Error('MainActivity tag not found in AndroidManifest.xml');
  return match[0];
}

describe('android main activity recents policy', () => {
  it('does not opt out of Recents for MainActivity', () => {
    expect(mainActivityTag(manifest)).not.toContain('android:excludeFromRecents="true"');
  });
});

/* Alicja, 2026-10-06: screenshots and the Recents preview are visible and
   only optionally hidden, and the capture switch decides screenshots. A set
   lock does not hide screenshots, but on 2026-11-12 she reversed the Recents
   half: while a lock is set no preview is kept (tester report 02, ticket 07),
   because the task snapshot is taken before a cover can be drawn. Android 13+
   has no getter for the Recents choice, so the instrumentation tests cannot
   read it back and this line holds it. */
describe('android recents preview follows the capture choice, disguise and a set lock', () => {
  const plugin = read('android/app/src/main/java/dev/engender/app/screencapture/ScreenCapturePlugin.java');
  const activity = read('android/app/src/main/java/dev/engender/app/MainActivity.java');

  it('passes the capture choice, disguise and a set lock to setRecentsScreenshotEnabled', () => {
    expect(plugin).toMatch(
      /setRecentsScreenshotEnabled\(LeaveCover\.recentsPreviewAllowed\(recentsPreviewShown\(allowed, disguised\)\)\);/,
    );
  });

  it('never decides the window flags from the lock', () => {
    expect(plugin).not.toMatch(/LockTimingPlugin\.\w+\(/);
    expect(activity).not.toMatch(/applyWindowFlags\(this,\s*false\)/);
  });
});

/* Last-audit UI 04. Recents names a task after the component that started
   it, and so does the window title TalkBack reads on arrival. A widget or a
   notification that started MainActivity by class showed "engender" and the
   default flag even with disguise on. Route intents now name an action that
   only the launcher aliases answer, so Android resolves each tap to the one
   alias enabled at that moment - the same component the launcher starts. */
describe('route launches resolve through the live launcher alias', () => {
  const appLaunch = read('android/app/src/main/java/dev/engender/app/launch/AppLaunch.java');
  const aliases = [...manifest.matchAll(/<activity-alias\b[\s\S]*?<\/activity-alias>/g)].map((m) => m[0]);
  const routeFilter =
    /<intent-filter>\s*<action android:name="dev\.engender\.app\.action\.OPEN_ROUTE"\s*\/>\s*<category android:name="android\.intent\.category\.DEFAULT"\s*\/>\s*<data android:scheme="engender" android:host="open"\s*\/>\s*<\/intent-filter>/;

  it('gives every launcher alias the route filter', () => {
    expect(aliases.length).toBeGreaterThan(1);
    for (const alias of aliases) {
      expect(alias, alias.match(/android:name="([^"]+)"/)?.[1]).toMatch(routeFilter);
    }
  });

  it('keeps the route action off MainActivity, which no alias would then name', () => {
    const main = manifest.match(/<activity\b[^>]*android:name="\.MainActivity"[\s\S]*?<\/activity>/)?.[0] ?? '';
    expect(main).not.toContain('OPEN_ROUTE');
  });

  it('builds route intents by that action within this package, not by MainActivity class', () => {
    expect(appLaunch).not.toMatch(/new Intent\(context, MainActivity\.class\)/);
    expect(appLaunch).toMatch(/new Intent\(OPEN_ROUTE\)/);
    expect(appLaunch).toMatch(/\.setPackage\(context\.getPackageName\(\)\)/);
  });
});
