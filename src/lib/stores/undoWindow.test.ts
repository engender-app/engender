/* The window an undoable deletion stays undoable in (functional audit
   ticket 46): undo inside it puts the rows back, and once it closes, by
   time or by the toast going away early (a lock), the deletion is final and
   its files go. */

import { afterEach, beforeEach, test, vi } from 'vitest';
import assert from 'node:assert/strict';
import { openUndoWindow, UNDO_WINDOW_MS } from './undoWindow.ts';
import type { UndoableDelete } from '../data/journal/undoableDelete.ts';

function deletion() {
  const calls: string[] = [];
  const handle: UndoableDelete = {
    tables: ['letter'],
    undo: async () => {
      calls.push('undo');
    },
    finish: async () => {
      calls.push('finish');
    }
  };
  return { handle, calls };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

test('an undo inside the window puts the deletion back and never lets its files go', async () => {
  const { handle, calls } = deletion();
  const window = openUndoWindow(handle);
  await vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS - 1);
  assert.equal(await window.undo(), true);
  await vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS);
  assert.deepEqual(calls, ['undo']);
});

test('the deletion is final once the window has passed', async () => {
  const { handle, calls } = deletion();
  const window = openUndoWindow(handle);
  await vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS);
  assert.deepEqual(calls, ['finish']);
  assert.equal(await window.undo(), false, 'too late is said, not done');
  assert.deepEqual(calls, ['finish']);
});

test('closing the window early, as a lock does, makes it final at once', async () => {
  const { handle, calls } = deletion();
  const window = openUndoWindow(handle);
  await window.close();
  await vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS);
  assert.deepEqual(calls, ['finish']);
  assert.equal(await window.undo(), false);
});

test('the window does not run out while its Undo cannot be reached, and starts over once it can', async () => {
  // A deletion made inside an open sheet (a photo in a session's editor, a
  // waiting-list update): the toast stands over the scrim, but its button is
  // inert behind the sheet until the sheet closes.
  const { handle, calls } = deletion();
  let sheetOpen = true;
  const window = openUndoWindow(handle, { held: () => sheetOpen });
  await vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS * 3);
  assert.deepEqual(calls, [], 'still undoable after three windows behind the sheet');
  sheetOpen = false;
  await vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS - 1000);
  assert.deepEqual(calls, [], 'the whole window again once the sheet has closed');
  assert.equal(await window.undo(), true);
  assert.deepEqual(calls, ['undo']);
});

test('a window that runs out says so, so its toast goes with it', async () => {
  const { handle, calls } = deletion();
  let closed = 0;
  openUndoWindow(handle, { onClose: () => closed++ });
  await vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS - 1);
  assert.equal(closed, 0);
  await vi.advanceTimersByTimeAsync(1);
  assert.equal(closed, 1);
  assert.deepEqual(calls, ['finish']);
});

test('an undo that fails leaves the deletion final and says so', async () => {
  const calls: string[] = [];
  const window = openUndoWindow({
    tables: [],
    undo: async () => {
      throw new Error('a uuid was taken');
    },
    finish: async () => {
      calls.push('finish');
    }
  });
  await assert.rejects(window.undo());
  assert.deepEqual(calls, ['finish']);
  assert.equal(await window.undo(), false);
});

test('the confirmations that promise an undo name the window it really has', async () => {
  const { readFileSync } = await import('node:fs');
  const seconds = String(UNDO_WINDOW_MS / 1000);
  const said = (file: string, pattern: RegExp) =>
    [...readFileSync(new URL(`../../../messages/${file}`, import.meta.url), 'utf8').matchAll(pattern)].map((match) => match[1]);
  const english = said('en.json', /undo it for (\d+) seconds/g);
  const polish = said('pl.json', /Przez (\d+) sekund możesz to cofnąć/g);
  // 13 since tester report 02, ticket 08, merged seventeen identical hints
  // into delete_undo_hint; the floor guards the two patterns, not a count.
  assert.ok(english.length >= 13 && polish.length >= english.length, `${english.length} English, ${polish.length} Polish`);
  assert.deepEqual([...new Set([...english, ...polish])], [seconds]);
});
