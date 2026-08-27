/* The vocabulary seam (ADR-0024): which modules are allowed to import
   reference.svelte directly rather than going through the validated
   accessor above it.

   A grep, and it could not be anything else (ticket 08). An import ban is
   a negative over every file in the tree - there is nothing to call that
   can answer "and nowhere else", which is the same reason
   disguise/identity.test.ts keeps one. */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = new URL('../', import.meta.url);
const rootPath = fileURLToPath(root);

function listFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listFiles(path));
      continue;
    }
    out.push(path);
  }
  return out;
}

function findReferenceImports(paths: string[]): string[] {
  const importFromReference = /(?:^|\n)\s*import\s+(?:type\s+)?(?:[^'"\n]+\s+from\s+)?['"][^'"\n]*reference\.svelte['"]/;
  return paths
    .filter((p) => /\.(?:svelte|ts|js)$/.test(p))
    .filter((p) => importFromReference.test(readFileSync(p, 'utf8')))
    .map((p) => p.replace(rootPath, '').replace(/^\//, '').replaceAll('\\', '/'));
}

describe('vocabulary is the only screen-facing seam for reference rows', () => {
  it('keeps direct reference imports out of routes and components', () => {
    const routeFiles = listFiles(join(rootPath, 'src/routes'));
    const componentFiles = listFiles(join(rootPath, 'src/lib/components'));
    const offenders = findReferenceImports([...routeFiles, ...componentFiles]);
    expect(offenders).toEqual([]);
  });

  it('keeps vocabulary wired to the reference mirror', () => {
    const vocabularyPath = join(rootPath, 'src/lib/data/vocabulary/vocabulary.ts');
    const source = readFileSync(vocabularyPath, 'utf8');
    expect(source).toMatch(/from\s+['"][^'"]*reference\.svelte['"]/);
  });
});
