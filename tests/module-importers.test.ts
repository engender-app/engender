/* Every module under src/lib has a caller.

   The export-name scan the architecture audit used reads names as text, so it
   cannot see a whole file nothing imports: LineChart.svelte, MilestoneCard.svelte,
   weekStripDayCount.ts and stores/videoFiles.ts all sat in the tree after their
   last importer was gone. This walks the real import specifiers instead. A
   module counts as used when some other file under src, or a test or script,
   imports it by relative path or by `$lib/`. A module's own test does not
   count: one that only `foo.test.ts` reaches is dead, and the test goes with
   it. Another module's test does, which keeps test-support files in.

   Left out on purpose: routes and workers (entry points the framework or the
   bundler reaches by path), tests and their support, declaration files, the
   generated paraglide output, and `*.typecheck.ts` files (compile-time probes
   that nothing imports). A new module with no caller fails here; delete it or
   wire it in. */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '..');
const EXTS = ['.ts', '.svelte', '.js', '.svelte.ts', '.svelte.js'];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'paraglide' || name.startsWith('.')) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const isSource = (p: string) => /\.(ts|js|mjs|svelte)$/.test(p);

function resolveSpecifier(from: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith('$lib/')) base = join(ROOT, 'src/lib', spec.slice(5));
  else if (spec.startsWith('.')) base = resolve(dirname(from), spec);
  else return null;
  base = base.replace(/\?.*$/, '');
  const candidates = [base, ...EXTS.map((e) => base + e), ...EXTS.map((e) => join(base, 'index' + e))];
  return candidates.find((c) => /\.\w+$/.test(c) && safeIsFile(c)) ?? null;
}

function safeIsFile(p: string): boolean {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}

/** Entry points the bundler reaches by path, not by import. */
const ENTRY_POINTS = new Set(['src/lib/data/demo/prewarm.ts']); // vite.config.ts demo build input

const SPEC = /(?:from\s*|import\s*\(\s*|import\s+|new URL\(\s*)['"]([^'"]+)['"]/g;

describe('module importers', () => {
  const all = [
    ...walk(join(ROOT, 'src')),
    ...walk(join(ROOT, 'tests')),
    ...walk(join(ROOT, 'scripts')),
    ...walk(join(ROOT, 'static')).filter(isSource)
  ].filter(isSource);

  const imported = new Set<string>();
  for (const file of all) {
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(SPEC)) {
      const hit = resolveSpecifier(file, m[1]);
      if (!hit || hit === file) continue;
      const own = hit.replace(/\.(svelte\.)?(ts|js|svelte)$/, '');
      if (file.startsWith(own + '.test.')) continue;
      imported.add(hit);
    }
  }

  const modules = walk(join(ROOT, 'src/lib')).filter(
    (p) =>
      isSource(p) &&
      !p.endsWith('.d.ts') &&
      !/\.(test|typecheck)\.(ts|js)$/.test(p) &&
      !p.includes('/test-support/') &&
      !/[-.]worker\.(ts|js)$/.test(p)
  );

  it('finds modules to check', () => {
    expect(modules.length).toBeGreaterThan(200);
  });

  it('gives every module under src/lib an importer', () => {
    const orphans = modules
      .map((m) => relative(ROOT, m))
      .filter((m) => !ENTRY_POINTS.has(m) && !imported.has(join(ROOT, m)));
    expect(orphans).toEqual([]);
  });
});
