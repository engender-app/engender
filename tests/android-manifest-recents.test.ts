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
   only optionally hidden. The capture switch is the one input; a journal lock
   does not hide either. Android 13+ has no getter for the Recents choice, so
   the instrumentation tests cannot read it back and this line holds it. */
describe('android recents preview follows the capture choice alone', () => {
  const plugin = read('android/app/src/main/java/dev/engender/app/screencapture/ScreenCapturePlugin.java');
  const activity = read('android/app/src/main/java/dev/engender/app/MainActivity.java');

  it('passes the capture choice straight to setRecentsScreenshotEnabled', () => {
    expect(plugin).toMatch(/setRecentsScreenshotEnabled\(allowed\);/);
  });

  it('never decides the window flags from the lock', () => {
    expect(plugin).not.toMatch(/LockTimingPlugin\.\w+\(/);
    expect(activity).not.toMatch(/applyWindowFlags\(this,\s*false\)/);
  });
});
