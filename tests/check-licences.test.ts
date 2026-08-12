/* The licence check CI runs (phase 2 ticket 06). Gender Diary is GPL-3.0-only
   and one channel - F-Droid, ticket 18 - rebuilds from source and rejects a
   dependency graph it cannot build freely. A dependency arriving under a
   licence nobody looked at is the way that turns into a rejected build long
   after the dependency became load-bearing.

   The allowed list is what the tree actually uses rather than every licence
   that would be acceptable, so a new one surfaces as a decision instead of
   passing on a technicality. */
import { describe, expect, it } from 'vitest';
import { licenceProblems } from '../scripts/check-licences.mjs';

describe('licenceProblems', () => {
  it('passes the permissive licences the tree already carries', () => {
    const problems = licenceProblems([
      { name: 'svelte', path: 'node_modules/svelte', licence: 'MIT' },
      { name: 'semver', path: 'node_modules/semver', licence: 'ISC' },
      { name: 'playwright-core', path: 'node_modules/playwright-core', licence: 'Apache-2.0' }
    ]);
    expect(problems).toEqual([]);
  });

  it('reports a licence nobody has decided about', () => {
    const problems = licenceProblems([{ name: 'thing', path: 'node_modules/thing', licence: 'BUSL-1.1' }]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('thing');
    expect(problems[0]).toContain('BUSL-1.1');
  });

  it('reports a package whose metadata claims no licence at all', () => {
    const problems = licenceProblems([{ name: 'thing', path: 'node_modules/thing', licence: null }]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/no licence|LICENSE/i);
  });

  it('accepts a package whose licence file was read by hand', () => {
    /* Two packages ship a plain MIT LICENSE file and no `license` field.
       Their names are written down rather than guessed from the file. */
    expect(licenceProblems([{ name: 'runed', path: 'node_modules/runed', licence: null }])).toEqual([]);
  });

  it('reports every problem package rather than stopping at the first', () => {
    const problems = licenceProblems([
      { name: 'a', path: 'node_modules/a', licence: 'BUSL-1.1' },
      { name: 'b', path: 'node_modules/b', licence: 'MIT' },
      { name: 'c', path: 'node_modules/c', licence: 'SEE LICENSE IN LICENSE.md' }
    ]);
    expect(problems).toHaveLength(2);
  });
});
