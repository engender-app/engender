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

/** Ticket 07: the validated key has the same one-door problem the reference
    mirror above does. `metricKey(prefs)` is the raw preference, unvalidated
    against which dimensions are actually ticked - `vocabulary.metric.key`
    (via `reference.activeMetric`) is the door every screen has to use
    instead so a stored metric naming an unticked scale cannot leak past its
    own picker. */
function findMetricKeyImports(paths: string[]): string[] {
  const importMetricKey =
    /(?:^|\n)\s*import\s*(?:type\s+)?\{[^}]*\bmetricKey\b[^}]*\}\s*from\s+['"][^'"\n]*prefs\/catalogue['"]/;
  return paths
    .filter((p) => /\.(?:svelte|ts|js)$/.test(p))
    .filter((p) => importMetricKey.test(readFileSync(p, 'utf8')))
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

  it('keeps metricKey out of routes and components', () => {
    const routeFiles = listFiles(join(rootPath, 'src/routes'));
    const componentFiles = listFiles(join(rootPath, 'src/lib/components'));
    const offenders = findMetricKeyImports([...routeFiles, ...componentFiles]);
    expect(offenders).toEqual([]);
  });
});
