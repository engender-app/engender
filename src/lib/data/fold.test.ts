/* Folded text (CONTEXT: "Folded text", ADR-0005): lowercased and stripped
   of Polish letterforms, including ł - which is the case Unicode
   decomposition alone cannot handle, and the reason folding lives in app
   code rather than in FTS5's tokenizer. */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { foldedSql, foldText } from './fold.ts';

test('lowercases', () => {
  assert.equal(foldText('Kawa Z Martą'), 'kawa z marta');
});

test('folds every Polish letterform, including ł', () => {
  assert.equal(foldText('zażółć gęślą jaźń'), 'zazolc gesla jazn');
  assert.equal(foldText('ŁÓŻKO'), 'lozko');
});

test('leaves plain ASCII untouched', () => {
  assert.equal(foldText('coffee with marta 123'), 'coffee with marta 123');
});

test('a folded query matches folded text the way search needs', () => {
  assert.ok(foldText('Łóżko było wygodne').includes(foldText('lozko')));
});

/* The two forms of one fold (phase 5 deepening ticket 24). Every area other
   than the entry note is matched by a scan inside SQL rather than through the
   FTS index, so the fold has to hold on that side too - and a fold that
   differed there would be a search that finds a word in a note and misses the
   same word in a letter. Driven over the same strings against real SQLite
   rather than compared as source text, because what is being checked is what
   SQLite does with the expression, not what the generator wrote. */
const FOLDED_IN_SQL = (raw: string): string => {
  const db = new DatabaseSync(':memory:');
  try {
    const row = db.prepare(`SELECT ${foldedSql('?')} AS folded`).get(raw) as { folded: string };
    return row.folded;
  } finally {
    db.close();
  }
};

test('the SQL fold and the JS fold agree, letterform by letterform and case by case', () => {
  for (const raw of [
    'zażółć gęślą jaźń',
    'ZAŻÓŁĆ GĘŚLĄ JAŹŃ',
    'ŁÓŻKO',
    'Łóżko było wygodne',
    'Kawa Z Martą',
    'coffee with marta 123',
    'ąćęłńóśżź',
    'ĄĆĘŁŃÓŚŻŹ',
    'à ç ê ñ ö š ž',
    'À Ç Ê Ñ Ö Š Ž',
    '',
    'punctuation: "quoted", 50% - done_'
  ]) {
    assert.equal(FOLDED_IN_SQL(raw), foldText(raw), `SQL and JS folds disagree on ${JSON.stringify(raw)}`);
  }
});

test('the SQL fold leaves nothing for a LIKE to be case-sensitive about', () => {
  /* LIKE is case-insensitive over ASCII only, which is the whole reason the
     fold runs on the column before the comparison rather than trusting LIKE
     with it. Both spellings of a Polish word have to arrive as the same
     ASCII letters. */
  assert.equal(FOLDED_IN_SQL('ŁÓŻKO'), FOLDED_IN_SQL('łóżko'));
});
