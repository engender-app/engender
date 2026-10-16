import { readFileSync } from 'node:fs';

export function latestSchemaVersion() {
  const source = readFileSync('src/lib/data/sqlite/migrations.ts', 'utf8');
  const versions = [...source.matchAll(/\bversion:\s*(\d+)\b/g)].map((match) => Number.parseInt(match[1], 10));
  if (versions.length === 0) {
    throw new Error('Could not find migration versions in src/lib/data/sqlite/migrations.ts');
  }
  return Math.max(...versions);
}
