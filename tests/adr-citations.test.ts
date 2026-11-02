/* The ADR citation guard (functional audit ticket 52). Dev tier: the ADRs
   live in the private docs repo, so where `docs/adr` is not linked (CI) the
   repo-wide check skips with a notice and the fixture tests still run. */
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { adrShapeProblems, citationsIn, readAdrIndex, unresolved, unresolvedInRepo } from '../scripts/adr-citations.mjs';

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
const draftCite = (slug: string) => 'ADR ' + 'draft-' + slug;

describe('the citation guard', () => {
  it('flags a citation with no file and no tombstone', () => {
    expect(unresolved(citationsIn(`see ${madeUp} and ADR-0001, a draft-probe`), index)).toEqual([madeUp]);
  });
  it('accepts a tombstone line, plain or bold', () => {
    expect(unresolved(['ADR-0080', 'ADR-0081'], index)).toEqual([]);
  });
  it('accepts a draft citation that has its draft file, flags one that has not', () => {
    expect(unresolved(citationsIn(`${draftCite('next-thing')}, ${draftCite('nothing-here')}`), index)).toEqual(['draft-nothing-here']);
  });
  it('does not take a tombstone mentioned mid-sentence for an index line', () => {
    writeFileSync(join(dir, 'README.md'), '# ADRs\n\nsee ADR-0042 for the story\n');
    expect(unresolved(['ADR-0042'], readAdrIndex(dir))).toEqual(['ADR-0042']);
  });
});

describe('the record shape (functional audit ticket 55)', () => {
  const header = 'Status: Accepted\nDecided: 2026-08-11\nLast reviewed: 2026-11-02\nSupersedes: none\n';
  const shapeDir = mkdtempSync(join(tmpdir(), 'adr-shape-'));
  afterAll(() => rmSync(shapeDir, { recursive: true, force: true }));
  const write = (name: string, text: string) => writeFileSync(join(shapeDir, name), text);

  it('passes a headed record, and a gap covered by a tombstone', () => {
    write('0001-one.md', `# One\n\n${header}\nBody.\n`);
    write('0003-three.md', `# Three\n\n${header.replace('Supersedes: none', 'Amends: ' + 'ADR-' + '0001')}\nBody.\n`);
    write('README.md', '## Tombstones\n\n- ADR-0002: merged into the first\n');
    expect(adrShapeProblems(shapeDir)).toEqual([]);
  });
  it('names a missing header line, an overlong record, a gap and a number that is both', () => {
    write('0001-one.md', `# One\n\nStatus: Accepted\n\n${'word '.repeat(1001)}\n`);
    rmSync(join(shapeDir, '0003-three.md'), { force: true });
    write('0004-four.md', `# Four\n\n${header}\nBody.\n`);
    write('README.md', '## Tombstones\n\n- ADR-0002: gone\n- ADR-0004: gone too\n');
    expect(adrShapeProblems(shapeDir)).toEqual([
      '0001-one.md: header lacks Decided, Last reviewed, Supersedes or Amends',
      '0001-one.md: 1005 words, over 1000',
      'ADR-0004: both a file and a tombstone',
      'ADR-0003: neither a file nor a tombstone'
    ]);
  });
});

describe.skipIf(!existsSync(adrDir))('every citation in src, tests and android', () => {
  it('resolves to an ADR file or a tombstone line', () => {
    expect(unresolvedInRepo(root, adrDir)).toEqual([]);
  });
  it('every record has its header and size, and every number up to the highest is a file or a tombstone', () => {
    expect(adrShapeProblems(adrDir)).toEqual([]);
  });
});

if (!existsSync(adrDir)) console.warn('adr-citations: docs/adr is not linked (run npm run docs:link); skipping the repo-wide check.');
