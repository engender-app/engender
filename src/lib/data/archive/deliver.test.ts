import assert from 'node:assert/strict';
import { test } from 'vitest';
import { archiveFileName } from './deliver.ts';

/* deliverArchive itself is a Blob, a share sheet and an anchor click: the
   browser tier drives it through a real download (archive-probe.ts). What
   can be tested here is the name that file arrives under, which is the part
   a person reads. */

test('the file name carries the journal name and the day', () => {
  assert.equal(archiveFileName('Alicja', 20676), 'alicja-journal-2026-08-11.ttbackup');
});

test('a name with Polish letterforms or spaces folds to something a filesystem will take', () => {
  assert.equal(archiveFileName('Zażółć Gęślą', 20676), 'zazolc-gesla-journal-2026-08-11.ttbackup');
});

test('a journal with no name still gets a name', () => {
  assert.equal(archiveFileName('', 20676), 'journal-2026-08-11.ttbackup');
});

test('a name that is nothing but punctuation is treated as no name', () => {
  assert.equal(archiveFileName('!!! ???', 20676), 'journal-2026-08-11.ttbackup');
});
