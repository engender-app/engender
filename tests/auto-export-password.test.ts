import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/* Phase 5 security ticket 02, F-04. Why the one call that reads the saved
   backup password is not behind a prompt is written out on
   AutoExportPlugin.passwordForScheduledBackup; what this file asserts is
   the fact that decision rests on, which is that the scheduler is the only
   thing reading it.

   Asserted as absence, and by the bare name rather than by the call: a
   destructured alias reads the password with no `androidAutoExport.`
   anywhere near it, and that is exactly the shape a grep for the call
   would wave through. */

const root = new URL('../', import.meta.url);
const PASSWORD_CALL = 'passwordForScheduledBackup';

function sourceFiles(dir: string): string[] {
  const base = fileURLToPath(new URL(dir, root));
  return readdirSync(base, { recursive: true, encoding: 'utf8' })
    .filter((name) => /\.(ts|svelte)$/.test(name))
    .map((name) => `${dir}${name}`);
}

const read = (path: string) => readFileSync(fileURLToPath(new URL(path, root)), 'utf8');

describe('the saved backup password', () => {
  it('is read by the scheduler and by nothing else', () => {
    /* The bridge declares the method and this file names it, so both are
       expected. Everything else that so much as spells it is a reader. */
    const declared = ['src/lib/data/archive/android-auto-export-bridge.ts'];

    const readers = [...sourceFiles('src/lib/'), ...sourceFiles('src/routes/')]
      .filter((path) => !path.includes('/paraglide/'))
      // A mock of the bridge names the method without reading a password.
      .filter((path) => !path.endsWith('.test.ts'))
      .filter((path) => !declared.includes(path))
      .filter((path) => read(path).includes(PASSWORD_CALL));

    expect(readers).toEqual(['src/lib/data/archive/auto-export-scheduler.ts']);
  });

  it('leaves the export screen able to say whether one is saved, without one', () => {
    const screen = read('src/routes/settings/export/+page.svelte');

    expect(screen).toContain('status.hasPassword');
    expect(screen).not.toContain(PASSWORD_CALL);
  });

  it('is named for the scheduler in the plugin the bridge reaches', () => {
    const plugin = read('android/app/src/main/java/dev/barankiewicz/genderdiary/backup/AutoExportPlugin.java');

    expect(plugin).toContain(`public void ${PASSWORD_CALL}(PluginCall call)`);
    expect(plugin).not.toContain('revealPassword');
  });
});
