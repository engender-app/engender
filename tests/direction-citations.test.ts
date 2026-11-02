/* The DIRECTION.md citation guard (functional audit ticket 55). Dev tier:
   DIRECTION.md lives in the private docs repo, so where it is not linked (CI)
   the repo-wide check skips with a notice and the parsing tests still run. */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { directionCitationsIn, directionKeys, unresolvedDirectionInRepo } from '../scripts/direction-citations.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const direction = join(root, 'DIRECTION.md');
// Built at runtime so this file never cites a rule itself.
const D = 'DIRECTION' + '.md';

describe('reading citations', () => {
  it('reads rules, decisions and tiers in every form the comments use', () => {
    expect(directionCitationsIn(`${D} rule 7; DIRECTION rule 10; ${D}'s tier 4; ${D} decision 2b`)).toEqual([
      'rule 7', 'rule 10', 'tier 4', 'decision 2b'
    ]);
  });
  it('takes a bare number for a rule and a number with a letter for a decision', () => {
    expect(directionCitationsIn(`(${D} 6) and (${D} 3b)`)).toEqual(['rule 6', 'decision 3b']);
  });
  it('expands "rules 12 to 14" and splits "rules 10 and 12"', () => {
    expect(directionCitationsIn(`${D} rules 12 to 14, ${D} rules 10 and 12, ${D} decisions 2 and 3`)).toEqual([
      'rule 12', 'rule 13', 'rule 14', 'rule 10', 'rule 12', 'decision 2', 'decision 3'
    ]);
  });
  it('reads a comma before a named family, but not before a bare number', () => {
    expect(directionCitationsIn(`(${D}, tier 2) and (DIRECTION, tier 4) but ${D}, 3 columns`)).toEqual(['tier 2', 'tier 4']);
  });
  it('ignores a mention with no number', () => {
    expect(directionCitationsIn(`${D} names the field; DIRECTIONS`)).toEqual([]);
  });
});

describe('reading DIRECTION.md', () => {
  it('takes a key from each Rule, Decision and Tier heading', () => {
    const md = '# Direction\n\n## Decision 2: two surfaces\n\n### Decision 2b: no cards\n\n### Rule 16: say what is true\n\n#### Tier 0: the flag\n\nRule 3 in prose is not a heading.\n';
    expect([...directionKeys(md)].sort()).toEqual(['decision 2', 'decision 2b', 'rule 16', 'tier 0']);
  });
});

describe.skipIf(!existsSync(direction))('every DIRECTION citation in src, tests and android', () => {
  it('resolves to a heading in DIRECTION.md', () => {
    expect(unresolvedDirectionInRepo(root, direction)).toEqual([]);
  });
});

if (!existsSync(direction)) console.warn('direction-citations: DIRECTION.md is not linked (run npm run docs:link); skipping the repo-wide check.');
