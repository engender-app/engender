import { test } from 'vitest';
import assert from 'node:assert/strict';
import { tryoutReading } from './tryoutReading';
import type { FeltSenseEntry, Tryout } from './types';

const TODAY = 20000;

const tryout = (over: Partial<Tryout> = {}): Tryout => ({
  id: 't1',
  kind: 'pronouns',
  label: 'she/her',
  description: null,
  startEpochDay: TODAY - 20,
  endEpochDay: null,
  ...over
});

const felt = (epochDay: number, mood: number, id = `f${epochDay}`): FeltSenseEntry => ({
  id,
  epochDay,
  mood,
  note: null
});

test('a tryout with no end day is running, and its span reaches today', () => {
  const reading = tryoutReading(tryout(), [], TODAY);
  assert.equal(reading.running, true);
  assert.equal(reading.fromEpochDay, TODAY - 20);
  assert.equal(reading.toEpochDay, TODAY);
  assert.equal(reading.dayCount, 21, 'the start day is day one');
});

test('an ended tryout stops at its end day, and its length is what it ran for', () => {
  const reading = tryoutReading(tryout({ endEpochDay: TODAY - 6 }), [], TODAY);
  assert.equal(reading.running, false);
  assert.equal(reading.toEpochDay, TODAY - 6);
  assert.equal(reading.dayCount, 15, 'inclusive of both ends');
});

test('a single day, started and ended today, is one day and not zero', () => {
  const sameDay = tryoutReading(tryout({ startEpochDay: TODAY, endEpochDay: TODAY }), [], TODAY);
  assert.equal(sameDay.dayCount, 1);
  const startedToday = tryoutReading(tryout({ startEpochDay: TODAY }), [], TODAY);
  assert.equal(startedToday.dayCount, 1);
});

test('a tryout dated to start in the future has not run for a negative number of days', () => {
  const reading = tryoutReading(tryout({ startEpochDay: TODAY + 5 }), [], TODAY);
  assert.equal(reading.dayCount, 1);
  assert.equal(reading.toEpochDay, TODAY + 5, 'the span collapses onto the start rather than running backwards');
});

test('readings are drawn oldest first, wherever they arrived in', () => {
  const reading = tryoutReading(
    tryout(),
    [felt(TODAY - 2, 4), felt(TODAY - 18, 2), felt(TODAY - 9, 5)],
    TODAY
  );
  assert.deepEqual(
    reading.marks.map((mark) => mark.epochDay),
    [TODAY - 18, TODAY - 9, TODAY - 2]
  );
  assert.ok(
    reading.marks[0].position < reading.marks[1].position &&
      reading.marks[1].position < reading.marks[2].position,
    'and drawn left to right in that order'
  );
});

test('a reading sits where its own day falls along the span', () => {
  const reading = tryoutReading(tryout(), [felt(TODAY - 20, 3), felt(TODAY - 10, 3), felt(TODAY, 3)], TODAY);
  assert.equal(reading.marks[0].position, 0, 'the start day is the left end');
  assert.equal(reading.marks[2].position, 1, 'today is the right end');
  assert.equal(reading.marks[1].position, 0.5, 'and the middle of the span is the middle of the line');
});

test('the five moods are five heights, with neither end favoured', () => {
  const reading = tryoutReading(tryout(), [1, 2, 3, 4, 5].map((mood) => felt(TODAY - 20 + mood, mood)), TODAY);
  assert.deepEqual(
    reading.marks.map((mark) => mark.level),
    [0, 0.25, 0.5, 0.75, 1]
  );
  assert.equal(reading.neutralLevel, 0.5, 'the guide sits on the middle step, which is what neutral is');
});

test('a reading dated outside the span is drawn at the end it was pulled to, and says so', () => {
  const reading = tryoutReading(
    tryout({ endEpochDay: TODAY - 5 }),
    [felt(TODAY - 40, 2), felt(TODAY - 1, 4)],
    TODAY
  );
  assert.deepEqual(
    reading.marks.map((mark) => [mark.position, mark.beyondSpan]),
    [
      [0, true],
      [1, true]
    ]
  );
});

test('a span one day wide puts its readings on the line rather than dividing by zero', () => {
  const reading = tryoutReading(tryout({ startEpochDay: TODAY }), [felt(TODAY, 4)], TODAY);
  assert.equal(reading.marks.length, 1);
  assert.equal(Number.isFinite(reading.marks[0].position), true);
  assert.equal(reading.marks[0].position, 1, 'which is today, the only day there is');
});

test('a span one day wide still draws an earlier reading at the end it was pulled to', () => {
  const reading = tryoutReading(
    tryout({ startEpochDay: TODAY, endEpochDay: TODAY }),
    [felt(TODAY - 4, 2), felt(TODAY, 4)],
    TODAY
  );
  assert.deepEqual(
    reading.marks.map((mark) => [mark.position, mark.beyondSpan]),
    [
      [0, true],
      [1, false]
    ],
    'a reading written before the tryout began is not drawn as though it came after it'
  );
});

test('nothing is averaged, scored or concluded', () => {
  const reading = tryoutReading(tryout(), [felt(TODAY - 8, 1), felt(TODAY - 3, 5)], TODAY);
  const keys = Object.keys(reading).sort();
  assert.deepEqual(keys, [
    'dayCount',
    'fromEpochDay',
    'latest',
    'marks',
    'neutralLevel',
    'running',
    'toEpochDay'
  ]);
});

test('the latest reading is named so the card can write it down beside the drawing', () => {
  const some = tryoutReading(tryout(), [felt(TODAY - 8, 1), felt(TODAY - 3, 5)], TODAY);
  assert.equal(some.latest?.epochDay, TODAY - 3);
  /* The step as well as the day: the card says which one was chosen, and
     reading it off a second field would let the two drift apart. */
  assert.equal(some.latest?.mood, 5);
  assert.equal(tryoutReading(tryout(), [], TODAY).latest, null);
});

test('one reading draws one mark, and none draws none', () => {
  assert.equal(tryoutReading(tryout(), [felt(TODAY - 4, 3)], TODAY).marks.length, 1);
  assert.deepEqual(tryoutReading(tryout(), [], TODAY).marks, []);
});
