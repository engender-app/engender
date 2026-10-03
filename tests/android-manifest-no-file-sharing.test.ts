import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/* The unused provider for all of external storage was removed in phase 5.
   Camera capture now needs a provider, limited to its disposable cache path.
   Cordova's accessOrigins still stays empty, so cap sync cannot restore the
   wildcard access tag no plugin uses. */

const root = new URL('../', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), 'utf8');

const manifest = read('android/app/src/main/AndroidManifest.xml');
const capacitorConfig = read('capacitor.config.ts');

describe('android dead cordova/file-sharing surface', () => {
  it('shares only the disposable camera cache through a non-exported provider', () => {
    const providers = [...manifest.matchAll(/<provider\b[\s\S]*?<\/provider>/g)];
    expect(providers).toHaveLength(1);
    expect(providers[0][0]).toContain('androidx.core.content.FileProvider');
    expect(providers[0][0]).toContain('android:authorities="${applicationId}.camera-files"');
    expect(providers[0][0]).toContain('android:exported="false"');
    expect(providers[0][0]).toContain('android:resource="@xml/camera_file_paths"');
    const paths = read('android/app/src/main/res/xml/camera_file_paths.xml');
    expect([...paths.matchAll(/<(?:cache|external|root|files)[-a-z]*path\b/g)]).toHaveLength(1);
    expect(paths).toContain('<cache-path name="capture" path="camera-capture/" />');
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
