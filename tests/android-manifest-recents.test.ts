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
