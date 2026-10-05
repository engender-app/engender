import assert from 'node:assert/strict';
import { globSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test } from 'vitest';

const root = fileURLToPath(new URL('..', import.meta.url));
const quantityWrite = /(?:UPDATE\s+(?:OR\s+\w+\s+)?medication_stock\b[^'"`]*\bSET\b[^'"`]*\bquantity\s*=|(?:INSERT|REPLACE)\s+(?:OR\s+\w+\s+)?INTO\s+medication_stock\b[^'"`]*\bquantity\b)/i;

test('only the stock editor writes a recorded medication quantity', () => {
  const sources = globSync('src/lib/data/journal/**/*.ts', { cwd: root })
    .filter((file) => !file.endsWith('.test.ts'));
  const writers = sources.filter((file) => quantityWrite.test(readFileSync(root + file, 'utf8')));

  // Archive restore copies reported counts through its registered table mapping.
  // Direct SQL writers belong to the stock editor, never to dose logging.
  assert.deepEqual(writers, ['src/lib/data/journal/stock.ts']);
});
