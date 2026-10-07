/* The static import graph of `src/`, read off the source text, for the rules
   about what a module is allowed to reach (chart-library-graph.test.ts,
   shell-graph.test.ts). Static imports only: a dynamic `import()` is its own
   chunk by design, fetched when something asks for it. */

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootPath = fileURLToPath(new URL('../', import.meta.url));

/** Repo-relative path to source text, for every module under `src/`. */
export type Sources = Map<string, string>;

export function sources(): Sources {
  const found: Sources = new Map();
  const visit = (dir: string) => {
    for (const entry of readdirSync(join(rootPath, dir), { withFileTypes: true })) {
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory()) visit(path);
      else if (/\.(ts|svelte)$/.test(entry.name) && !entry.name.endsWith('.test.ts')) {
        found.set(path, readFileSync(join(rootPath, path), 'utf8'));
      }
    }
  };
  visit('src');
  return found;
}

/** Comments name libraries and modules on purpose; imports are code. */
function code(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/** Everything a module pulls in before it runs, re-exports included.

    `import type` is not one of them: the compiler erases it, so it puts
    nothing in a chunk and a rule that counted it would demand a move the
    build has no use for. An inline `{ type Point }` inside a value import
    is left alone - the statement it rides in is a real edge anyway. */
export function specifiers(text: string): string[] {
  const statement = /(?<![\w$.])(?:import|export)\s+(?!type\s)(?:[^'"()]*?\bfrom\s*)?['"]([^'"]+)['"]/g;
  return [...code(text).matchAll(statement)].map((match) => match[1]);
}

/** A specifier as a path in `sources`, or null where it names a package or
    something generated (the paraglide catalogue). */
function resolve(from: string, specifier: string, files: Sources): string | null {
  let base: string;
  if (specifier.startsWith('$lib/')) base = `src/lib/${specifier.slice(5)}`;
  else if (specifier.startsWith('.')) base = relative(rootPath, join(rootPath, dirname(from), specifier));
  else return null;
  for (const candidate of [base, `${base}.ts`, `${base}.svelte`, `${base}/index.ts`]) {
    if (files.has(candidate)) return candidate;
  }
  return null;
}

/** Every module whose static imports reach a module `loads` picks out (given
    its path and its specifiers), mapped to the chain that gets there - so a
    failure names the hop that picked it up, not only the module answering
    for it. */
export function reach(files: Sources, loads: (path: string, specs: string[]) => boolean): Map<string, string[]> {
  const graph = new Map<string, string[]>();
  const chains = new Map<string, string[]>();
  for (const [path, text] of files) {
    const specs = specifiers(text);
    if (loads(path, specs)) chains.set(path, [path]);
    graph.set(
      path,
      specs.map((spec) => resolve(path, spec, files)).filter((dep): dep is string => dep !== null)
    );
  }
  let spreading = true;
  while (spreading) {
    spreading = false;
    for (const [path, deps] of graph) {
      if (chains.has(path)) continue;
      const through = deps.map((dep) => chains.get(dep)).find((chain) => chain !== undefined);
      if (through === undefined) continue;
      chains.set(path, [path, ...through]);
      spreading = true;
    }
  }
  return chains;
}
