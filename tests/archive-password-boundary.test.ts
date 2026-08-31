import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { deriveKey } from '../src/lib/crypto/argon2id.ts';

/* Phase 5 security ticket 06, F-04: The archive password never reaches JavaScript.
   The Argon2id derivation runs behind the Android bridge and hands back a single-use
   derived key for one archive instead of the cleartext password. */

const root = new URL('../', import.meta.url);

function sourceFiles(dir: string): string[] {
  const base = fileURLToPath(new URL(dir, root));
  return readdirSync(base, { recursive: true, encoding: 'utf8' })
    .filter((name) => /\.(ts|svelte)$/.test(name))
    .map((name) => `${dir}${name}`);
}

const read = (path: string) => readFileSync(fileURLToPath(new URL(path, root)), 'utf8');

describe('archive password boundary', () => {
  it('never exposes or reads the saved backup password in JavaScript', () => {
    const forbidden = ['passwordForScheduledBackup', 'revealPassword'];
    const readers = [...sourceFiles('src/lib/'), ...sourceFiles('src/routes/')]
      .filter((path) => !path.includes('/paraglide/'))
      .filter((path) => !path.endsWith('.test.ts'))
      .filter((path) => forbidden.some((f) => read(path).includes(f)));

    expect(readers).toEqual([]);
  });

  it('leaves the export screen able to say whether one is saved without secrets', () => {
    const screen = read('src/routes/settings/export/+page.svelte');

    expect(screen).toContain('status.hasPassword');
    expect(screen).not.toContain('passwordForScheduledBackup');
    expect(screen).not.toContain('revealPassword');
  });

  it('exposes only deriveKey in the plugin and bridge', () => {
    const plugin = read('android/app/src/main/java/dev/barankiewicz/genderdiary/backup/AutoExportPlugin.java');
    const bridge = read('src/lib/data/archive/android-auto-export-bridge.ts');

    expect(plugin).toContain('public void deriveKey(PluginCall call)');
    expect(plugin).not.toContain('passwordForScheduledBackup');
    expect(plugin).not.toContain('revealPassword');

    expect(bridge).toContain('deriveKey(');
    expect(bridge).not.toContain('passwordForScheduledBackup');
    expect(bridge).not.toContain('revealPassword');
  });

  it('derives identical key bytes between JavaScript and native golden vectors', async () => {
    const salt1 = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
    const kdf1 = { memorySize: 65536, iterations: 3, parallelism: 1, hashLength: 32 };
    const key1 = await deriveKey('correct horse', salt1, kdf1);
    const hex1 = Array.from(key1, (b) => b.toString(16).padStart(2, '0')).join('');
    expect(hex1).toBe('c157c50f9f198840868c180e3cc89815b7d0aab8785fd4cf280e82ac440fba39');

    const salt2 = new Uint8Array([16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
    const kdf2 = { memorySize: 8192, iterations: 1, parallelism: 1, hashLength: 32 };
    const key2 = await deriveKey('another password 123!', salt2, kdf2);
    const hex2 = Array.from(key2, (b) => b.toString(16).padStart(2, '0')).join('');
    expect(hex2).toBe('fa081e0706300855bf325249b26a5dd959bdeec8644a96a1ecd90f9e76df6398');
  });
});
