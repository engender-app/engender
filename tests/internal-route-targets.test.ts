import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { expect, it } from 'vitest';

const root = join(import.meta.dirname, '..', 'src');
const routes = join(root, 'routes');

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? files(path) : [path];
  });
}

const screens = files(routes)
  .filter((file) => file.endsWith('/+page.svelte'))
  .map((file) => '/' + relative(routes, file).replace(/\/\+page\.svelte$/, ''))
  .map((path) => path === '/' ? path : path.replace(/\/$/, ''));
const routeHeads = new Set(screens.map((screen) => screen.split('/')[1]));

function matchesScreen(path: string): boolean {
  return screens.some((screen) => {
    const pattern = screen.replace(/\[([^/]+)\]/g, '[^/]+');
    return new RegExp(`^${pattern}$`).test(path);
  });
}

it('keeps internal href and goto targets on rendered routes', () => {
  const misses: string[] = [];
  for (const file of files(root).filter((path) => /\.(?:ts|svelte)$/.test(path) && !path.endsWith('.test.ts'))) {
    const source = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\/|<!--[\s\S]*?-->/g, '');
    for (const line of source.split('\n')) {
      if (/^\s*(?:\/\/|\/\*|\*|<!--)/.test(line)) continue;
      for (const [, , value] of line.matchAll(/(['"`])(\/[a-z][^'"`\s]*)\1/g)) {
        if (!routeHeads.has(value.split('/')[1]) && !/href|goto|ROUTE|_HREF/.test(line)) continue;
        const path = value.replace(/(?<=\/)\$\{[^}]+\}/g, 'value').replace(/\$\{[^}]+\}/g, '').split(/[?#]/, 1)[0];
        if (!/href|goto|ROUTE|_HREF/.test(line) && (path.endsWith('/') || path.endsWith('/*') || screens.some((screen) => screen.startsWith(path + '/')))) continue;
        if (!matchesScreen(path)) misses.push(`${relative(root, file)}: ${value}`);
      }
    }
  }
  expect(misses).toEqual([]);
});
