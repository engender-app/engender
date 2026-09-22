import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const dir = fileURLToPath(new URL('.', import.meta.url));

/* PlaneReading colours each presentation by its own roleIndex rather than a
   single reading-wide role, so it declares no *_ROLE constant and is not
   walked here. */
const EXEMPT = new Set(['BodyMapTile.svelte', 'CompareTile.svelte', 'PlaneReading.svelte']);

const readingFiles = readdirSync(dir)
  .filter((name) => name.endsWith('.svelte'))
  .filter((name) => !EXEMPT.has(name));

describe('every reading resolves its chart role to index 0', () => {
  for (const name of readingFiles) {
    it(name, () => {
      const source = readFileSync(dir + name, 'utf8');
      const match = source.match(/const \w*ROLE\w* = (\d+);/);
      expect(match, `${name} declares a *_ROLE constant used with roleAt`).not.toBeNull();
      expect(Number(match![1])).toBe(0);
    });
  }
});
