/* Check citations against the tracked ADR index in CI. Public Markdown
   links must resolve without the private docs checkout. */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { adrShapeProblems, citationsIn, internalDocLinks, privateReferencesInRepo, readAdrIndex, unresolved, unresolvedInRepo } from '../../../scripts/adr-citations.mjs';

const root = fileURLToPath(new URL('../../..', import.meta.url));
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
  it('wants the header as the block right under the title, not further down', () => {
    write('0001-one.md', `# One\n\nA paragraph first.\n\n${header}\nBody.\n`);
    write('0003-three.md', `# Three\n\n${header}\nBody.\n`);
    write('README.md', '## Tombstones\n\n- ADR-0002: merged into the first\n');
    expect(adrShapeProblems(shapeDir)).toEqual(['0001-one.md: header lacks Status, Decided, Last reviewed, Supersedes or Amends']);
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

describe('private references', () => {
  let repo: string;
  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), 'adr-links-'));
    execFileSync('git', ['init', '-q', repo]);
  });
  afterEach(() => rmSync(repo, { recursive: true, force: true }));
  const put = (path: string, text: string) => {
    mkdirSync(join(repo, path, '..'), { recursive: true });
    writeFileSync(join(repo, path), text);
  };
  it('reports the file and line of each markdown link that lands in docs/internal', () => {
    put('README.md', 'fine [ok](docs/adr/0001-one.md) and [site](https://example.com/docs/internal/x)\n\nbad [a](docs/internal/docs/ui-copy.md)\n');
    put('docs/adr/0002-two.md', '# Two\n\nsee [b](../internal/CONTEXT.md#term) and [c](./0001-one.md)\n');
    put('docs/adr/0001-one.md', 'prose may name docs/internal without linking to it\n');
    execFileSync('git', ['-C', repo, 'add', '-A']);
    expect(internalDocLinks(repo)).toEqual([
      'README.md:3: docs/internal/docs/ui-copy.md',
      'docs/adr/0002-two.md:3: docs/internal/CONTEXT.md'
    ]);
  });

  it('reports private document names and retired ADRs on their source lines', () => {
    put('docs/adr/README.md', '# ADRs\n\n- ADR-0078: moved to private documentation\n- ADR-0042: moved to CONTRIBUTING\n');
    put('src/example.ts', '// See ADR-0042.\n// See ADR-0078 and SCREENS.md.\n// See docs/internal/notes.md.\n// See DIRECTION.md, PRODUCT.md and CONTEXT.md.\n');
    put('scripts/link-docs.mjs', '// Links SCREENS.md.\n');
    execFileSync('git', ['-C', repo, 'add', '-A']);
    expect(privateReferencesInRepo(repo, join(repo, 'docs/adr'))).toEqual([
      'src/example.ts:2: SCREENS.md',
      'src/example.ts:2: ADR-0078 points to private documentation',
      'src/example.ts:3: docs/internal',
      'src/example.ts:4: DIRECTION.md',
      'src/example.ts:4: PRODUCT.md',
      'src/example.ts:4: CONTEXT.md'
    ]);
  });
});

describe('every citation in src, tests and android', () => {
  it('resolves to an ADR file or a tombstone line', () => {
    expect(unresolvedInRepo(root, adrDir)).toEqual([]);
  });
  it('every record has its header and size, and every number up to the highest is a file or a tombstone', () => {
    expect(adrShapeProblems(adrDir)).toEqual([]);
  });
  it('no tracked file links to a docs/internal path', () => {
    expect(internalDocLinks(root)).toEqual([]);
  });
  it('all public references can be followed without private documentation', () => {
    expect(privateReferencesInRepo(root, adrDir)).toEqual([]);
  });
});
