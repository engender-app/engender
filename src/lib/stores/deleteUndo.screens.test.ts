/* Every deletion a screen offers runs through `undoable` and offers Undo
   (functional audit ticket 46, deleteUndo.ts), apart from the few named
   below with the reason each is not.

   A text scan of the screens and components for a journal delete called
   directly - `journal.<area>.delete…(`, `remove…(` or `purge…(` - rather
   than on the journal `undoable` hands its callback. Blind spots: a delete
   reached through another name for the journal, or one a helper module
   outside src/routes and src/lib/components calls, is not seen. */

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { test } from 'vitest';

const root = process.cwd();

const NOT_UNDOABLE: Record<string, string> = {
  'entries.deleteEntry': 'moves the entry to Trash, which is its own way back (phase 5 ticket 19)',
  'entries.purgeEntry': 'Delete forever, from Trash, is final on purpose (functional audit ticket 46)'
};

function sources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sources(path);
    return /\.(svelte|ts)$/.test(entry.name) && !/\.test\.ts$/.test(entry.name) ? [path] : [];
  });
}

test('every deletion a screen offers can be undone, or is named here with the reason it cannot', () => {
  const direct = new Set<string>();
  for (const path of [...sources(join(root, 'src/routes')), ...sources(join(root, 'src/lib/components'))]) {
    for (const [, call] of readFileSync(path, 'utf8').matchAll(/\bjournal\.(\w+\.(?:delete|remove|purge)\w*)\(/g)) {
      if (!(call in NOT_UNDOABLE)) direct.add(`${call} in ${relative(root, path)}`);
    }
  }
  assert.deepEqual([...direct].sort(), []);
});
