import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = join(process.env.FA42_SOURCE_ROOT ?? process.cwd(), 'src');
const outsideOwners = new Set([
  'src/app.html',
  'src/lib/android/platform-sync.ts',
  'src/lib/components/AndroidKeyGate.svelte',
  'src/lib/components/BootFailureNotice.svelte',
  'src/lib/components/DeviceBoundRecovery.svelte',
  'src/lib/components/DisguisePreview.svelte',
  'src/lib/components/DisguiseSetting.svelte',
  'src/lib/components/GateScreen.svelte',
  'src/lib/components/LauncherIconPreview.svelte',
  'src/lib/components/JournalGate.svelte',
  'src/lib/components/PrintLetterhead.svelte',
  'src/lib/components/SessionUnlock.svelte',
  'src/lib/data/archive/android-auto-export.ts',
  'src/lib/data/archive/backup.ts',
  'src/lib/data/prefs/documentChrome.ts',
  'src/lib/disguise/identity.ts',
  'src/routes/onboarding/+page.svelte'
]);
const nonPreferenceDisguiseReads = new Map([
  ['src/lib/android/plugin-registry.ts', 'androidPluginOwners.disguise'],
  ['src/lib/disguise/android-bridge.ts', 'androidPluginOwners.disguise'],
  ['src/lib/onboarding/complete.ts', 'completion.disguise']
]);

function files(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? files(path) : [path];
  });
}

describe('disguise boundary', () => {
  it('reads disguise only in outside-surface owners', () => {
    const readers = files(source)
      .filter((path) => /\.(svelte|ts|html)$/.test(path) && !/\.test\.ts$/.test(path))
      .filter((path) => {
        const name = `src/${relative(source, path)}`;
        const otherProperty = nonPreferenceDisguiseReads.get(name);
        const sourceCode = readFileSync(path, 'utf8').replace(/\/\*[\s\S]*?\*\/|<!--[\s\S]*?-->|\/\/[^\n]*/g, '');
        const code = otherProperty ? sourceCode.replace(otherProperty, '') : sourceCode;
        return /(?:\?\.|\.)\s*disguise\b|(?:[\w$]|\]|\))\s*(?:\?\.)?\s*\[\s*['"`]disguise['"`]\s*\]|\{[^}]*\bdisguise\b[^}]*\}\s*=/.test(code);
      })
      .map((path) => `src/${relative(source, path)}`);
    expect(readers.filter((path) => !outsideOwners.has(path))).toEqual([]);
  });

  it('uses the outside-only adapter only for tab, launcher and file names', () => {
    const uses = files(source).flatMap((path) => {
      if (!/\.(svelte|ts)$/.test(path) || /\.test\.ts$/.test(path)) return [];
      const code = readFileSync(path, 'utf8').replace(/\/\*[\s\S]*?\*\/|<!--[\s\S]*?-->|\/\/[^\n]*/g, '');
      return [...code.matchAll(/outsideDisguise\(prefs\)/g)].map(() => `src/${relative(source, path)}`);
    });
    expect(uses.sort()).toEqual([
      'src/routes/+layout.svelte',
      'src/routes/+layout.svelte',
      'src/routes/+layout.svelte',
      'src/routes/media/photos/export/+page.svelte',
      'src/routes/wrapped/[cadence]/share/+page.svelte'
    ].sort());
  });

  it('keeps the outside adapter on outside operations in mixed routes', () => {
    const read = (path: string) => readFileSync(join(source, path), 'utf8');
    const layout = read('routes/+layout.svelte');
    expect(layout).toContain('disguised: outsideDisguise(prefs),');
    expect(layout).toContain("apple-touch-icon${outsideDisguise(prefs) ? '-notes' : ''}.png");
    expect(layout).toContain('const disguise = outsideDisguise(prefs);');
    expect(layout).not.toMatch(/class:disguised|refreshActiveFlag\(document,|if \(disguise\) untrack/);
    expect(read('routes/media/photos/export/+page.svelte')).toContain('journeyFileName(prefs.name, output, undefined, outsideDisguise(prefs))');
    expect(read('routes/wrapped/[cadence]/share/+page.svelte')).toContain('wrappedShareFileName(prefs.name, undefined, outsideDisguise(prefs))');
  });

  it('does not neutralize unlocked surfaces through CSS or flag publication', () => {
    const css = files(join(source, 'lib')).filter((path) => path.endsWith('.css'))
      .map((path) => readFileSync(path, 'utf8').replace(/\/\*[\s\S]*?\*\//g, ''))
      .join('\n');
    expect(css).not.toMatch(/\[data-disguised\]|\.disguised\b/);
    expect(readFileSync(join(source, 'lib/theme/activeFlag.svelte.ts'), 'utf8'))
      .toContain('refreshActiveFlag(doc: Document = document): void');
  });
});
