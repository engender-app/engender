/* Folded text (CONTEXT: "Folded text", ADR-0005): lowercased and stripped
   of Polish letterforms, including ł - which is the case Unicode
   decomposition alone cannot handle, and the reason folding lives in app
   code rather than in FTS5's tokenizer. */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { foldText } from './fold.ts';

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
