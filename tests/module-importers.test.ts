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
import ts from 'typescript';
import { parse } from 'svelte/compiler';

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

/** Read executable imports, including Svelte template expressions. */
function importSpecifiers(text: string, file: string): string[] {
  const specifiers: string[] = [];
  if (file.endsWith('.svelte')) {
    const literal = (value: unknown): string | null => {
      if (!value || typeof value !== 'object') return null;
      const node = value as Record<string, unknown>;
      return typeof node.value === 'string' ? node.value : null;
    };
    const visit = (value: unknown) => {
      if (Array.isArray(value)) {
        value.forEach(visit);
        return;
      }
      if (!value || typeof value !== 'object') return;
      const node = value as Record<string, unknown>;
      let source: unknown;
      if (['ImportDeclaration', 'ExportNamedDeclaration', 'ExportAllDeclaration', 'ImportExpression'].includes(String(node.type))) {
        source = node.source;
      } else if (node.type === 'NewExpression') {
        const callee = node.callee as { type?: string; name?: string };
        if (callee.type === 'Identifier' && callee.name === 'URL') source = (node.arguments as unknown[])[0];
      }
      const specifier = literal(source);
      if (specifier !== null) specifiers.push(specifier);
      Object.values(node).forEach(visit);
    };
    visit(parse(text, { modern: true }));
  } else {
    const visit = (node: ts.Node) => {
      let source: ts.Node | undefined;
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
        source = node.moduleSpecifier;
      } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        source = node.arguments[0];
      } else if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'URL') {
        source = node.arguments?.[0];
      }
      if (source && ts.isStringLiteralLike(source)) specifiers.push(source.text);
      ts.forEachChild(node, visit);
    };
    visit(ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true));
  }
  return specifiers;
}

describe('module importers', () => {
  const all = [
    ...walk(join(ROOT, 'src')),
    ...walk(join(ROOT, 'tests')),
    ...walk(join(ROOT, 'scripts')),
    ...walk(join(ROOT, 'static')).filter(isSource)
  ].filter(isSource);

  const imported = new Set<string>();
  for (const file of all) {
    for (const specifier of importSpecifiers(readFileSync(file, 'utf8'), file)) {
      const hit = resolveSpecifier(file, specifier);
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

  it('does not count an import written inside a comment', () => {
    const text = "<script>/* import a from './a' */ // import b from './b'\nimport d from './d';</script><!-- import c from './c' -->";
    expect(importSpecifiers(text, 'fixture.svelte')).toEqual(['./d']);
  });

  it('does not count import-shaped ordinary strings', () => {
    const text = [
      `const example = "import '$lib/review-orphan'";`,
      `const other = "new URL('./fake', import.meta.url)";`,
      "const template = `export { thing } from './also-fake'`;",
      "import real from './real';"
    ].join('\n');
    expect(importSpecifiers(text, 'fixture.ts')).toEqual(['./real']);
    expect(importSpecifiers(`<script>${text}</script><p>import './fake'</p>`, 'fixture.svelte')).toEqual(['./real']);
  });

  it('keeps static, dynamic and URL imports in scripts and Svelte templates', () => {
    const text = "import './side-effect'; export { value } from './export'; const lazy = import('./lazy'); const worker = new URL('./worker', import.meta.url);";
    expect(importSpecifiers(text, 'fixture.ts')).toEqual(['./side-effect', './export', './lazy', './worker']);
    expect(importSpecifiers(`<script>${text}</script><button onclick={() => import('./event')}>Open</button>{#await import('./awaited')}Loading{/await}`, 'fixture.svelte'))
      .toEqual(['./event', './awaited', './side-effect', './export', './lazy', './worker']);
  });

  it('gives every module under src/lib an importer', () => {
    const orphans = modules
      .map((m) => relative(ROOT, m))
      .filter((m) => !ENTRY_POINTS.has(m) && !imported.has(join(ROOT, m)));
    expect(orphans).toEqual([]);
  });
});
