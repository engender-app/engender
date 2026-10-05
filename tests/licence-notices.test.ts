/* The licence notices the app carries (phase 15 release-blockers ticket
   10). What ships is read off the build; these hold the two steps that turn
   module ids into notices: which package a module came from, and what makes
   a shipped package's notice incomplete enough to fail the build. */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  buildNotices,
  packagePathOf,
  uncoveredAndroidLibraries,
  VENDORED_PACKAGES
} from '../scripts/licence-notices.mjs';

describe('packagePathOf', () => {
  it('names the lockfile entry a bundled module came from', () => {
    expect(packagePathOf('/home/a/repo/node_modules/d3-scale/src/linear.js')).toBe('node_modules/d3-scale');
    expect(packagePathOf('/home/a/repo/node_modules/@sveltejs/kit/src/runtime/client/client.js')).toBe(
      'node_modules/@sveltejs/kit'
    );
  });

  it('credits a nested copy to itself rather than to its parent', () => {
    expect(packagePathOf('/r/node_modules/a/node_modules/@s/b/index.js?worker')).toBe('node_modules/a/node_modules/@s/b');
  });

  it("credits Vite's helpers and the generated Paraglide runtime to their packages", () => {
    expect(packagePathOf('\0vite/preload-helper.js')).toBe('node_modules/vite');
    expect(packagePathOf('\0commonjsHelpers.js')).toBe('node_modules/vite');
    expect(packagePathOf('/r/src/lib/paraglide/runtime.js')).toBe('node_modules/@inlang/paraglide-js');
  });

  it("leaves the app's own modules out", () => {
    expect(packagePathOf('/r/src/routes/+page.svelte')).toBeNull();
    expect(packagePathOf('\0virtual:licence-notices')).toBeNull();
  });
});

const MIT_A = 'MIT License\n\nCopyright (c) 2020 A';
const MIT_B = 'MIT License\n\nCopyright (c) 2021 B';

function input(overrides: Partial<Parameters<typeof buildNotices>[0]> = {}) {
  const tree: Record<string, Record<string, string>> = {
    'node_modules/a': { LICENSE: MIT_A, 'index.js': '' },
    'node_modules/b': { 'LICENSE.md': MIT_B, NOTICE: 'B notice' },
    'node_modules/c': { 'index.js': '' },
    'node_modules/zero': { 'index.js': '' }
  };
  return {
    app: ['node_modules/a', 'node_modules/b'],
    lock: [
      { name: 'a', path: 'node_modules/a', version: '1.0.0', licence: 'MIT' },
      { name: 'b', path: 'node_modules/b', version: '2.0.0', licence: 'Apache-2.0' },
      { name: 'c', path: 'node_modules/c', version: '3.0.0', licence: 'MIT' },
      { name: 'zero', path: 'node_modules/zero', version: '0.1.0', licence: '0BSD' }
    ],
    files: (dir: string) => Object.keys(tree[dir] ?? {}),
    read: (path: string) => {
      const at = path.lastIndexOf('/');
      return tree[path.slice(0, at)]?.[path.slice(at + 1)] ?? `text of ${path}`;
    },
    ...overrides
  };
}

describe('buildNotices', () => {
  it("carries each shipped package's name, version, licence and its own licence and notice files", () => {
    const { notices, problems } = buildNotices(input());
    expect(problems).toEqual([]);
    const app = notices.sections.find((section) => section.id === 'app')!;
    expect(app.entries.map(({ name, version, licence }) => `${name}@${version} ${licence}`)).toEqual([
      'a@1.0.0 MIT',
      'b@2.0.0 Apache-2.0'
    ]);
    const b = app.entries[1];
    expect(b.texts.map((index) => notices.texts[index])).toEqual([MIT_B, 'B notice']);
  });

  it('fails a shipped package with no licence file where its licence asks for the text', () => {
    const { problems } = buildNotices(input({ app: ['node_modules/c'] }));
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('node_modules/c');
  });

  it('passes a package whose licence asks for no text', () => {
    expect(buildNotices(input({ app: ['node_modules/zero'] })).problems).toEqual([]);
  });

  it('fails a shipped module whose package the lockfile does not know', () => {
    const { problems } = buildNotices(input({ app: ['node_modules/ghost'] }));
    expect(problems).toEqual([expect.stringContaining('node_modules/ghost')]);
  });

  it('keeps one copy of a text many packages share', () => {
    const same = 'ISC License\n\nCopyright the same';
    const { notices } = buildNotices(
      input({
        app: ['node_modules/a', 'node_modules/c'],
        files: () => ['LICENSE'],
        read: () => same
      })
    );
    expect(notices.texts).toEqual([same]);
  });
});

describe('the Android graph is covered', () => {
  const graph = [
    'releaseRuntimeClasspath - Runtime classpath of /release.',
    '+--- androidx.appcompat:appcompat:1.7.1',
    '|    \\--- androidx.core:core:1.17.0 (*)',
    '+--- project :capacitor-android',
    '+--- net.zetetic:sqlcipher-android:4.9.0',
    '\\--- com.example.tracker:sdk:1.0 -> 1.1'
  ].join('\n');

  it('names the coordinates no notice covers, and nothing else', () => {
    expect(uncoveredAndroidLibraries(graph)).toEqual(['com.example.tracker:sdk']);
  });
});

describe('vendored packages', () => {
  it('lists every package prepare-vendor-assets copies past the bundler', () => {
    const script = readFileSync(new URL('../scripts/prepare-vendor-assets.mjs', import.meta.url), 'utf8');
    const copied = new Set(
      [...script.matchAll(/'(node_modules\/(?:@[^/']+\/)?[^/']+)\//g)].map((match) => match[1])
    );
    expect(copied.size).toBeGreaterThan(0);
    for (const path of copied) expect(VENDORED_PACKAGES).toContain(path);
  });
});
