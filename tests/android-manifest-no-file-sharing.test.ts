import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/* Phase 5 security ticket 07 (G-07). The manifest declared a FileProvider
   with grantUriPermissions and a paths file mapping all of external storage,
   for a share mechanism the app never used - exports leave through the share
   sheet as a Blob-backed File. And left unset, capacitor.config.ts's
   cordova.accessOrigins defaults to a wildcard <access origin="*" /> every
   time `cap sync` regenerates the gitignored res/xml/config.xml, a
   Cordova-compat file no plugin here reads. Both are dead surface a reader
   stops on and a future feature could reach for by accident - this is what
   catches either coming back. */

const root = new URL('../', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), 'utf8');

const manifest = read('android/app/src/main/AndroidManifest.xml');
const capacitorConfig = read('capacitor.config.ts');

describe('android dead cordova/file-sharing surface', () => {
  it('declares no FileProvider', () => {
    expect(manifest).not.toContain('FileProvider');
  });

  it('keeps cordova.accessOrigins empty, so cap sync writes no wildcard access tag', () => {
    /* config.xml itself is gitignored and only exists after `cap sync` has
       run locally, so this asserts the one source-controlled thing that
       decides its content: an empty array here is what makes
       autoGenerateConfig (node_modules/@capacitor/cli/dist/cordova.js) skip
       the <access origin="*" /> it writes by default. */
    expect(capacitorConfig).toMatch(/cordova:\s*{\s*accessOrigins:\s*\[\]\s*}/);
  });
});
