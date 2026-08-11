/* Turning what someone typed into something searchable (ADR-0005). Two
   halves that deliberately do not share semantics: notes go through FTS5,
   which matches whole tokens by prefix, while tag labels are matched as a
   folded substring over tens of mirrored rows - which is what the demo
   store already did, so the shipped behaviour does not move. */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { ftsMatchExpression, tagIdsMatching } from './searchQuery.ts';

test('quotes each token and matches it by prefix', () => {
  assert.equal(ftsMatchExpression('coffee'), '"coffee"*');
  assert.equal(ftsMatchExpression('coffee marta'), '"coffee"* AND "marta"*');
});

test('folds before building, so query and index meet on the same letters', () => {
  assert.equal(ftsMatchExpression('ŁÓŻKO'), '"lozko"*');
  assert.equal(ftsMatchExpression('łóżko'), ftsMatchExpression('lozko'));
  assert.equal(ftsMatchExpression('Zażółć Gęślą'), '"zazolc"* AND "gesla"*');
});

test('nothing to search for is null, not an empty expression', () => {
  // A bare '' reaches FTS5 as a syntax error, and '""*' matches nothing
  // while still costing a round trip to the worker.
  for (const q of ['', '   ', '...', '*', '((', '"']) {
    assert.equal(ftsMatchExpression(q), null, `expected null for ${JSON.stringify(q)}`);
  }
});

test('FTS5 operators arrive as literal words, never as syntax', () => {
  // Someone searching for "not" means the word. Quoting is what keeps a
  // typed OR, NEAR or stray parenthesis from either changing the query's
  // meaning or throwing from the driver.
  assert.equal(ftsMatchExpression('NOT coffee'), '"not"* AND "coffee"*');
  assert.equal(ftsMatchExpression('a OR b'), '"a"* AND "or"* AND "b"*');
  assert.equal(ftsMatchExpression('NEAR(x y)'), '"near"* AND "x"* AND "y"*');
  assert.equal(ftsMatchExpression('marta*'), '"marta"*');
  assert.equal(ftsMatchExpression('he said "hi"'), '"he"* AND "said"* AND "hi"*');
});

const tags = [
  { id: 'e-happy', label: 'happy' },
  { id: 'e-hopeful', label: 'hopeful' },
  { id: 'a-therapy', label: 'therapy' },
  { id: 'u1', label: 'Ćwiczenia rano' }
];

test('matches tag labels through the same folding', () => {
  assert.deepEqual(tagIdsMatching('hopeful', tags), ['e-hopeful']);
  assert.deepEqual(tagIdsMatching('cwiczenia', tags), ['u1']);
  assert.deepEqual(tagIdsMatching('ĆWICZ', tags), ['u1']);
});

test('a tag label matches on any substring, not only its start', () => {
  // The demo store's behaviour, kept: labels are short and there are tens
  // of them, so mid-word is affordable here in a way it is not in FTS5.
  assert.deepEqual(tagIdsMatching('rano', tags), ['u1']);
  assert.deepEqual(tagIdsMatching('happ', tags), ['e-happy']);
});

test('no query means no tag matches', () => {
  assert.deepEqual(tagIdsMatching('', tags), []);
  assert.deepEqual(tagIdsMatching('   ', tags), []);
});

test('a query matching nothing yields no ids', () => {
  assert.deepEqual(tagIdsMatching('pierogi', tags), []);
});
