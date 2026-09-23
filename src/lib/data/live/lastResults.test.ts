/* The in-memory last answers a warm revisit paints from (ux-carpet 201). */

import assert from 'node:assert/strict';
import { beforeEach, test } from 'vitest';
import { callKey, forgetLastResults, lastResultCount, recall, remember, sameAnswer } from './lastResults.ts';

const versions: Record<string, number> = {};
const current = (table: string) => versions[table] ?? 0;
const alive = new Set<number>();
const isAlive = (instance: number) => alive.has(instance);

beforeEach(() => {
  forgetLastResults();
  for (const table of Object.keys(versions)) delete versions[table];
  alive.clear();
});

test('an answer comes back while nothing it read has been written', () => {
  remember('home|entries.recentDays(5)', [1, 2], [['entry', 0]], 1, isAlive);
  assert.deepEqual(recall('home|entries.recentDays(5)', current), [1, 2]);
});

test('a write to any table it read takes the answer away for good', () => {
  remember('k', 'old', [['entry', 0], ['tag', 0]], 1, isAlive);
  versions.tag = 1;
  assert.equal(recall('k', current), undefined);
  versions.tag = 0;
  assert.equal(recall('k', current), undefined, 'dropped, not merely hidden');
});

test('after a lock the first visit reads fresh: nothing is held', () => {
  remember('a', 1, [], 1, isAlive);
  remember('b', 2, [], 1, isAlive);
  forgetLastResults();
  assert.equal(lastResultCount(), 0);
  assert.equal(recall('a', current), undefined);
  assert.equal(recall('b', current), undefined);
});

test('two live instances writing one key make it ambiguous; a later instance after the first is gone does not', () => {
  alive.add(1);
  alive.add(2);
  remember('tile|stats.dayAverages("mood",1,9)', 'for metric A', [], 1, isAlive);
  remember('tile|stats.dayAverages("mood",1,9)', 'for metric B', [], 2, isAlive);
  assert.equal(recall('tile|stats.dayAverages("mood",1,9)', current), undefined);
  remember('tile|stats.dayAverages("mood",1,9)', 'again', [], 1, isAlive);
  assert.equal(recall('tile|stats.dayAverages("mood",1,9)', current), undefined, 'stays ambiguous');

  alive.clear();
  alive.add(3);
  remember('rail|eras.getEras()', 'first visit', [], 3, isAlive);
  alive.delete(3);
  alive.add(4);
  remember('rail|eras.getEras()', 'second visit', [], 4, isAlive);
  assert.equal(recall('rail|eras.getEras()', current), 'second visit');
});

test('the least recently used answer goes first past the cap', () => {
  for (let i = 0; i < 400; i++) remember(`k${i}`, i, [], 1, isAlive);
  recall('k0', current);
  remember('k400', 400, [], 1, isAlive);
  assert.equal(recall('k0', current), 0);
  assert.equal(recall('k1', current), undefined);
  assert.equal(lastResultCount(), 400);
});

test('a call key writes sets and maps out and refuses what it cannot write faithfully', () => {
  assert.notEqual(callKey('a', 'b', [new Set([1])]), callKey('a', 'b', [new Set([2])]));
  assert.notEqual(callKey('a', 'b', [undefined]), callKey('a', 'b', [null]));
  assert.equal(callKey('a', 'b', [() => 1]), null);
  assert.equal(callKey('a', 'b', [new (class Thing {})()]), null);
  assert.equal(callKey('a', 'b', [{ from: 1, to: 2 }]), 'a.b([{"from":1,"to":2}])');
});

test('sameAnswer compares what reads answer with', () => {
  assert.ok(sameAnswer([{ a: 1, b: [new Uint8Array([1, 2])] }], [{ a: 1, b: [new Uint8Array([1, 2])] }]));
  assert.ok(!sameAnswer([{ a: 1 }], [{ a: 2 }]));
  assert.ok(!sameAnswer({ a: 1 }, { a: 1, b: undefined }));
  assert.ok(!sameAnswer(new Uint8Array([1]), new Uint8Array([2])));
  assert.ok(sameAnswer(new Map([[1, 'x']]), new Map([[1, 'x']])));
});
