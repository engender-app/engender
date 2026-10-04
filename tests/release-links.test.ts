import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import capacitorConfig, { JOURNAL_ORIGIN } from '../capacitor.config';

const root = new URL('../', import.meta.url);
function filesIn(directory: string): string[] {
  return readdirSync(new URL(directory, root), { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory()
      ? filesIn(path)
      : entry.isFile() ? [path] : [];
  });
}

describe('release links', () => {
  it.each(['source and docs', 'built output'])('keeps retired URLs out of %s', (surface) => {
    const paths = surface === 'built output' ? filesIn('build') : [
      ...['src', 'docs', 'deploy'].flatMap(filesIn),
      'capacitor.config.ts', 'README.md', 'SECURITY.md'
    ];
    const retired = /engender\.dev|github\.com\/barankiewicz\/gender-diary/;
    const violations = paths.filter((path) => retired.test(readFileSync(new URL(path, root), 'utf8')));
    expect(violations).toEqual([]);
  });

  it('changes only hosted metadata while Android keeps its existing local origin', () => {
    expect(JOURNAL_ORIGIN).toBe('app.engender.barankiewicz.dev');
    expect(capacitorConfig.server?.hostname).toBe('localhost');
    expect(capacitorConfig.server?.androidScheme).toBe('https');
    expect(capacitorConfig.server?.url).toBeUndefined();
  });
});
