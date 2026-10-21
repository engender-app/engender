/* The ADR citation guard (functional audit ticket 52). Dev tier: the ADRs
   live in the private docs repo, so where `docs/adr` is not linked (CI) the
   repo-wide check skips with a notice and the fixture tests still run. */
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { citationsIn, readAdrIndex, unresolved, unresolvedInRepo } from '../scripts/adr-citations.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const adrDir = join(root, 'docs', 'adr');
const dir = mkdtempSync(join(tmpdir(), 'adr-fixture-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
writeFileSync(join(dir, '0001-one.md'), '# one\n');
writeFileSync(join(dir, 'draft-next-thing.md'), '# draft\n');
writeFileSync(join(dir, 'README.md'), '# ADRs\n\n## Tombstones\n\n- ADR-0080: moved to DIRECTION.md\n- **ADR-0081**: also gone\n');
const index = readAdrIndex(dir);
// Built at runtime so this file never cites a number itself.
const madeUp = 'ADR-' + '9999';

describe('the citation guard', () => {
  it('flags a citation with no file and no tombstone', () => {
    expect(unresolved(citationsIn(`see ${madeUp} and ADR-0001, a draft-probe`), index)).toEqual([madeUp]);
  });
  it('accepts a tombstone line, plain or bold', () => {
    expect(unresolved(['ADR-0080', 'ADR-0081'], index)).toEqual([]);
  });
  it('accepts a draft citation that has its draft file, flags one that has not', () => {
    expect(unresolved(citationsIn('ADR draft-next-thing, docs/adr/draft-nothing-here'), index)).toEqual(['draft-nothing-here']);
  });
  it('does not take a tombstone mentioned mid-sentence for an index line', () => {
    writeFileSync(join(dir, 'README.md'), '# ADRs\n\nsee ADR-0042 for the story\n');
    expect(unresolved(['ADR-0042'], readAdrIndex(dir))).toEqual(['ADR-0042']);
  });
});

describe.skipIf(!existsSync(adrDir))('every citation in src, tests and android', () => {
  it('resolves to an ADR file or a tombstone line', () => {
    expect(unresolvedInRepo(root, adrDir)).toEqual([]);
  });
});

if (!existsSync(adrDir)) console.warn('adr-citations: docs/adr is not linked (run npm run docs:link); skipping the repo-wide check.');
