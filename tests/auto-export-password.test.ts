import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/* Phase 5 security ticket 02, F-04: the saved backup password is decrypted
   with a Keystore key that needs no authentication, because the scheduler
   has to pack a backup with nobody watching. That freedom is the
   scheduler's alone, and the thing keeping it there is that no screen ever
   asks for the password - a screen only ever sets one, clears one, or asks
   status() whether one exists.

   Asserted as absence, which is the one thing a grep over source can prove
   without going false-green: a call that is not written cannot be inert. */

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
    const callers = [...sourceFiles('src/lib/'), ...sourceFiles('src/routes/')]
      .filter((path) => !path.includes('/paraglide/'))
      .filter((path) => read(path).includes(`androidAutoExport.${PASSWORD_CALL}`));

    expect(callers).toEqual(['src/lib/data/archive/auto-export-scheduler.ts']);
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
