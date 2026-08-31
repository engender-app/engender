import assert from 'node:assert/strict';
import { test } from 'vitest';
import { builtInPassageKey, customPassageKey, wordCountOf } from './passages.ts';

/* A benchmark's series key (ticket 15, CONTEXT: "Benchmark passage"). */

test('the word count comes from the text, however it is spaced', () => {
  assert.equal(wordCountOf('the morning bus takes the long way round'), 8);
  assert.equal(wordCountOf('  two   words\n'), 2);
  assert.equal(wordCountOf('   '), 0);
});

test('each language has its own built-in series', () => {
  assert.notEqual(builtInPassageKey('en'), builtInPassageKey('pl'));
  assert.equal(builtInPassageKey('pl'), builtInPassageKey('pl'));
});

test('the same custom passage is one series, whitespace and case aside', () => {
  const key = customPassageKey('Rain comes and goes.');
  assert.equal(customPassageKey('rain   comes\nand goes.'), key);
});

test('an edited custom passage starts a new series rather than continuing one', () => {
  assert.notEqual(customPassageKey('Rain comes and goes.'), customPassageKey('Rain comes and stays.'));
});

test('a custom passage is never mistaken for the built-in one', () => {
  assert.ok(customPassageKey('anything').startsWith('custom-'));
  assert.ok(builtInPassageKey('en').startsWith('builtin-'));
});
