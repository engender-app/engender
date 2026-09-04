import { test } from 'vitest';
import assert from 'node:assert/strict';
import { inUseWindowEndEpochDay, isPastInUseWindow } from './inUseWindow';

test('an explicit end date is used as typed', () => {
  const window = { openedEpochDay: 100, inUseWindowDays: null, inUseEndEpochDay: 128 };
  assert.equal(inUseWindowEndEpochDay(window), 128);
});

test('a window in days is added to the opened date', () => {
  const window = { openedEpochDay: 100, inUseWindowDays: 28, inUseEndEpochDay: null };
  assert.equal(inUseWindowEndEpochDay(window), 128);
});

test('an explicit end date wins if somehow both are set, rather than being recombined', () => {
  const window = { openedEpochDay: 100, inUseWindowDays: 28, inUseEndEpochDay: 200 };
  assert.equal(inUseWindowEndEpochDay(window), 200);
});

test('neither typed projects no end at all', () => {
  const window = { openedEpochDay: 100, inUseWindowDays: null, inUseEndEpochDay: null };
  assert.equal(inUseWindowEndEpochDay(window), null);
});

test('the end day itself is still within the window', () => {
  const window = { openedEpochDay: 100, inUseWindowDays: 28, inUseEndEpochDay: null };
  assert.equal(isPastInUseWindow(window, 128), false);
});

test('the day after the end day is past the window', () => {
  const window = { openedEpochDay: 100, inUseWindowDays: 28, inUseEndEpochDay: null };
  assert.equal(isPastInUseWindow(window, 129), true);
});

test('a container with no typed window is never past it', () => {
  const window = { openedEpochDay: 100, inUseWindowDays: null, inUseEndEpochDay: null };
  assert.equal(isPastInUseWindow(window, 99999), false);
});
