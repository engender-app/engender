/* The rune-free half of the tableVersions seam (ticket 27): the
   write-announcement notify. The reactive version state lives in
   tableVersions.svelte.ts and is out of the Node tier's reach - `$state` is
   not defined there (ADR-0017) - so this covers only the subscribe/announce
   rule that the reference mirror depends on. */

import assert from 'node:assert/strict';
import { test } from 'vitest';
import { announceTablesWritten, createWriteAnnouncer, onTablesWritten } from './tableVersions.notify.ts';
import type { TableName } from './writes.ts';

test('announce hands every subscriber exactly the tables a write touched', () => {
  const announcer = createWriteAnnouncer();
  const seen: TableName[][] = [];
  announcer.onTablesWritten((tables) => seen.push(tables));

  announcer.announce(['entry', 'photo']);

  assert.deepEqual(seen, [['entry', 'photo']]);
});

test('every subscriber is notified, not just the first', () => {
  const announcer = createWriteAnnouncer();
  const first: TableName[][] = [];
  const second: TableName[][] = [];
  announcer.onTablesWritten((tables) => first.push(tables));
  announcer.onTablesWritten((tables) => second.push(tables));

  announcer.announce(['tag']);

  assert.deepEqual(first, [['tag']]);
  assert.deepEqual(second, [['tag']]);
});

test('a subscriber registered after an earlier write still receives later ones', () => {
  const announcer = createWriteAnnouncer();
  announcer.announce(['entry']); // nothing is listening yet
  const seen: TableName[][] = [];
  announcer.onTablesWritten((tables) => seen.push(tables));

  announcer.announce(['lab']);

  assert.deepEqual(seen, [['lab']]);
});

test('the shared announcer wires announceTablesWritten through to onTablesWritten', () => {
  const seen: TableName[][] = [];
  onTablesWritten((tables) => seen.push(tables));

  announceTablesWritten(['reminder']);

  assert.deepEqual(seen, [['reminder']]);
});
