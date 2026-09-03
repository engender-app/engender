/* The one delete contract (ADR-0053), held at the level the source can be
   held to: an update on an unknown id throws, a delete on one does not.

   The behaviour is asserted area by area, in each area's own tests - this
   file exists because the contract was copied by hand across 48 id-addressed
   writes and split in two, and a test naming six modules would only catch
   the six that already deviated. `assertChanged` is the whole mechanism, so
   the rule reads as a negative over every method that could call it: no
   delete may.

   A grep because it is a negative, the same shape gates-surfaces.test.ts
   uses. The second check is what stops it passing vacuously: it runs the
   same reader over the updates, which do guard, so a reader that stopped
   finding method bodies fails there rather than going quiet here. */

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const dataRoot = fileURLToPath(new URL('..', import.meta.url));

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') ? [path] : [];
  });
}

interface Method {
  where: string;
  name: string;
  body: string;
}

/** Every method in the data tier whose name `matches`, with the body it
    opened. A method's body runs to the first line that closes it at its own
    indentation, which is how the data tier is written throughout: the
    signature on one line ending in `{`, and its closing brace under the
    first character of the name. A signature wrapped across lines is not
    read, which is what the count assertion below is for. */
function methods(matches: RegExp): Method[] {
  const found: Method[] = [];

  for (const file of sourceFiles(dataRoot)) {
    const lines = readFileSync(file, 'utf8').split('\n');
    for (const [index, line] of lines.entries()) {
      const declared = /^(\s*)(?:export\s+)?(?:async\s+)?(?:function\s+)?([A-Za-z_$][\w$]*)\s*\(.*\{\s*$/.exec(line);
      if (!declared || !matches.test(declared[2])) continue;

      const closer = new RegExp(`^\\s{${declared[1].length}}[}\\)]`);
      const body: string[] = [];
      for (const rest of lines.slice(index + 1)) {
        if (closer.test(rest)) break;
        body.push(rest);
      }
      found.push({ where: `${file.slice(dataRoot.length)}:${index + 1}`, name: declared[2], body: body.join('\n') });
    }
  }
  return found;
}

const guarded = (method: Method) => /\bassertChanged\(/.test(method.body);

describe('the delete contract', () => {
  it('no delete guards its write with assertChanged', () => {
    const deletes = methods(/^(delete|remove)/);

    /* The floor is the other half of the assertion: a delete whose signature
       the reader cannot see is a delete this rule does not reach. */
    expect(deletes.length).toBeGreaterThan(35);
    expect(deletes.filter(guarded).map((method) => `${method.where} ${method.name}`)).toEqual([]);
  });

  it('reads the updates that do guard, so the reader itself can fail', () => {
    const updates = methods(/^(upsert|set|rename|end|add)/);

    expect(updates.length).toBeGreaterThan(40);
    expect(updates.filter(guarded).length).toBeGreaterThan(20);
  });
});
