import { test } from 'vitest';
import assert from 'node:assert/strict';
import { wrappedShareContent, wrappedShareFileName, WRAPPED_SHARE_NOTHING_SELECTED } from './wrappedShare';

const counts = { label: 'Entries', value: '12' };
const streak = { label: 'Best streak', value: '5 days' };

test('nothing selected produces an empty card', () => {
  assert.deepEqual(wrappedShareContent(WRAPPED_SHARE_NOTHING_SELECTED, counts, streak), {
    stats: [],
    paletteArt: false
  });
});

test('only the picked stats appear, counts before streak', () => {
  assert.deepEqual(wrappedShareContent({ counts: true, streak: false, paletteArt: false }, counts, streak), {
    stats: [counts],
    paletteArt: false
  });
  assert.deepEqual(wrappedShareContent({ counts: false, streak: true, paletteArt: false }, counts, streak), {
    stats: [streak],
    paletteArt: false
  });
  assert.deepEqual(wrappedShareContent({ counts: true, streak: true, paletteArt: false }, counts, streak), {
    stats: [counts, streak],
    paletteArt: false
  });
});

test('palette art is independent of the stat picks', () => {
  assert.deepEqual(wrappedShareContent({ counts: false, streak: false, paletteArt: true }, counts, streak), {
    stats: [],
    paletteArt: true
  });
});

test('the file is named for the wrapped, not the journal', () => {
  assert.equal(wrappedShareFileName('Alicja', 20313), 'alicja-wrapped-2025-08-13.png');
  assert.equal(wrappedShareFileName('', 20313), 'wrapped-2025-08-13.png');
});
