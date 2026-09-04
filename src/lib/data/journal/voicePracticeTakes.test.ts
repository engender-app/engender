/* The voice practice take area (phase 8 features ticket 10). */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { journalWithBuiltIns, UUID_PATTERN } from './test-support.ts';

test('a take round-trips its figures and reads back newest first', async () => {
  const { journal } = await journalWithBuiltIns();
  const earlier = await journal.voicePracticeTakes.addTake({
    epochDay: 100,
    minHz: 150,
    maxHz: 220,
    medianHz: 180,
    feltSense: 4
  });
  const later = await journal.voicePracticeTakes.addTake({
    epochDay: 102,
    minHz: 160,
    maxHz: 210,
    medianHz: 185,
    feltSense: null
  });

  assert.match(later, UUID_PATTERN);
  const takes = await journal.voicePracticeTakes.getTakes();
  assert.equal(takes.length, 2);
  assert.equal(takes[0].id, later);
  assert.equal(takes[1].id, earlier);
  assert.equal(takes[0].minHz, 160);
  assert.equal(takes[0].maxHz, 210);
  assert.equal(takes[0].medianHz, 185);
  assert.equal(takes[0].feltSense, null);
  assert.equal(takes[1].feltSense, 4);
});

test('a take is sealed until the day after it was taken, always', async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.voicePracticeTakes.addTake({ epochDay: 100, minHz: 150, maxHz: 200, medianHz: 175, feltSense: null });

  const [take] = await journal.voicePracticeTakes.getTakes();
  assert.equal(take.sealedUntilEpochDay, 101);
});

test('a felt sense outside the five-level scale is refused before it is written', async () => {
  const { journal } = await journalWithBuiltIns();
  await assert.rejects(
    journal.voicePracticeTakes.addTake({ epochDay: 100, minHz: 150, maxHz: 200, medianHz: 175, feltSense: 6 })
  );
});

test('one day of takes', async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.voicePracticeTakes.addTake({ epochDay: 100, minHz: 150, maxHz: 200, medianHz: 175, feltSense: null });
  await journal.voicePracticeTakes.addTake({ epochDay: 101, minHz: 150, maxHz: 200, medianHz: 175, feltSense: null });

  const onDay = await journal.voicePracticeTakes.getTakesOnDay(100);
  assert.equal(onDay.length, 1);
  assert.equal(onDay[0].epochDay, 100);
});

test('the last write, at or before today', async () => {
  const { journal } = await journalWithBuiltIns();
  assert.equal(await journal.voicePracticeTakes.lastWriteEpochDay(200), null);

  await journal.voicePracticeTakes.addTake({ epochDay: 100, minHz: 150, maxHz: 200, medianHz: 175, feltSense: null });
  await journal.voicePracticeTakes.addTake({ epochDay: 150, minHz: 150, maxHz: 200, medianHz: 175, feltSense: null });

  assert.equal(await journal.voicePracticeTakes.lastWriteEpochDay(200), 150);
  assert.equal(await journal.voicePracticeTakes.lastWriteEpochDay(120), 100);
  assert.equal(await journal.voicePracticeTakes.lastWriteEpochDay(50), null);
});

test('deleting a take is idempotent', async () => {
  const { journal } = await journalWithBuiltIns();
  const id = await journal.voicePracticeTakes.addTake({
    epochDay: 100,
    minHz: 150,
    maxHz: 200,
    medianHz: 175,
    feltSense: null
  });

  await journal.voicePracticeTakes.deleteTake(id);
  await journal.voicePracticeTakes.deleteTake(id); // idempotent

  assert.deepEqual(await journal.voicePracticeTakes.getTakes(), []);
});
