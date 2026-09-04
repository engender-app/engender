import { test } from 'vitest';
import assert from 'node:assert/strict';
import { wrappedShareContent, wrappedShareFileName, WRAPPED_SHARE_NOTHING_SELECTED } from './wrappedShare';

const counts = { label: 'Entries', value: '12' };

test('nothing selected produces an empty card', () => {
  assert.deepEqual(wrappedShareContent(WRAPPED_SHARE_NOTHING_SELECTED, counts), {
    stats: [],
    paletteArt: false
  });
});

test('a stat reaches the card only when it was picked', () => {
  assert.deepEqual(wrappedShareContent({ counts: false, paletteArt: false }, counts), {
    stats: [],
    paletteArt: false
  });
  assert.deepEqual(wrappedShareContent({ counts: true, paletteArt: false }, counts), {
    stats: [counts],
    paletteArt: false
  });
});

test('palette art is independent of the stat picks', () => {
  assert.deepEqual(wrappedShareContent({ counts: false, paletteArt: true }, counts), {
    stats: [],
    paletteArt: true
  });
});

test('the file is named for the wrapped, not the journal', () => {
  assert.equal(wrappedShareFileName('Alicja', 20313), 'alicja-wrapped-2025-08-13.png');
  assert.equal(wrappedShareFileName('', 20313), 'wrapped-2025-08-13.png');
});
