/* The agenda projection (phase 10 redesign ticket 04, ADR-0073): the
   window, the ordering, the fold, the absence rule, the passed slot and the
   disguise rule. Every one of them is decided in `agenda.ts` and asserted
   here, because ticket 13 draws what this returns and can only be as
   truthful as the projection under it. */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'vitest';
import {
  AGENDA_CAP,
  AGENDA_DAYS,
  agenda,
  agendaWindow,
  passedSlotSentence,
  type AgendaInput
} from './agenda.ts';
import type { DayAheadMark, DayAheadMarkKind } from './journal/dayAhead.ts';
import type { DoseScheduleComparison } from './journal/doses.ts';

const TODAY = 20000;

const mark = (kind: DayAheadMarkKind, epochDay: number): DayAheadMark => ({ kind, epochDay });

/** The comparison arm that carries slots, with one unlogged slot per day
    listed. Only the fields the projection reads are filled in - the rest of
    `getComparison`'s answer belongs to the screens that draw amounts. */
function comparison(unloggedDays: readonly number[], loggedDays: readonly number[] = []): DoseScheduleComparison {
  const row = (epochDay: number, logged: boolean) => ({
    slot: { epochDay, indexInDay: 0, amount: null },
    dose: logged ? ({ id: `dose-${epochDay}` } as never) : null
  });
  return {
    reason: null,
    activeEpisode: { id: 'episode-1' } as never,
    schedule: {} as never,
    pauses: [],
    comparison: {
      rows: [
        ...unloggedDays.map((day) => row(day, false)),
        ...loggedDays.map((day) => row(day, true))
      ],
      unmatched: []
    }
  } as DoseScheduleComparison;
}

function input(over: Partial<AgendaInput> = {}): AgendaInput {
  return {
    todayEpochDay: TODAY,
    marks: [],
    doses: { reason: 'noEpisode' },
    disguised: false,
    ...over
  };
}

test('the window is today through today plus seven, inclusive at both ends', () => {
  assert.deepEqual(agendaWindow(TODAY), { fromEpochDay: TODAY, toEpochDay: TODAY + AGENDA_DAYS });
  assert.equal(AGENDA_DAYS, 7);
});

test('marks come back in date order, whatever order they arrived in', () => {
  const projection = agenda(
    input({
      marks: [mark('milestone', TODAY + 5), mark('appointment', TODAY + 1), mark('letterUnlock', TODAY + 3)]
    })
  );
  assert.ok(projection);
  assert.deepEqual(
    projection.shown.map((item) => item.epochDay),
    [TODAY + 1, TODAY + 3, TODAY + 5]
  );
});

test('two marks on one day keep the order the read returned them in', () => {
  const projection = agenda(
    input({ marks: [mark('doseSlot', TODAY + 2), mark('appointment', TODAY + 2)] })
  );
  assert.deepEqual(
    projection!.shown.map((item) => item.kind),
    ['doseSlot', 'appointment']
  );
});

test('every item carries the route of the screen that owns it', () => {
  const kinds: DayAheadMarkKind[] = ['appointment', 'surgery', 'milestone', 'letterUnlock', 'doseSlot'];
  const projection = agenda(input({ marks: kinds.map((kind, index) => mark(kind, TODAY + index)) }));
  const items = [...projection!.shown, ...projection!.folded];
  assert.equal(items.length, kinds.length);
  for (const item of items) assert.ok(item.route.startsWith('/'), `${item.kind} has no route`);
  // Distinct routes, since each kind is owned by its own screen: two kinds
  // sharing one would mean a row that lands somewhere it cannot be seen.
  assert.equal(new Set(items.map((item) => item.route)).size, kinds.length);
});

test('a key is stable per kind and day, so two days of one kind are two rows', () => {
  const projection = agenda(input({ marks: [mark('doseSlot', TODAY + 1), mark('doseSlot', TODAY + 4)] }));
  const keys = projection!.shown.map((item) => item.key);
  assert.equal(new Set(keys).size, 2);
});

test('at or under the cap nothing folds', () => {
  const marks = Array.from({ length: AGENDA_CAP }, (_, index) => mark('appointment', TODAY + index));
  const projection = agenda(input({ marks }));
  assert.equal(projection!.shown.length, AGENDA_CAP);
  assert.deepEqual(projection!.folded, []);
});

test('over the cap folds the rest in place, and drops none of them', () => {
  const marks = Array.from({ length: AGENDA_CAP + 3 }, (_, index) => mark('appointment', TODAY + index));
  const projection = agenda(input({ marks }));
  assert.equal(projection!.shown.length, AGENDA_CAP);
  assert.equal(projection!.folded.length, 3);
  assert.deepEqual(
    [...projection!.shown, ...projection!.folded].map((item) => item.epochDay),
    marks.map((item) => item.epochDay)
  );
});

test('an empty window is nothing at all, not an empty projection', () => {
  assert.equal(agenda(input()), null);
});

test('a passed slot alone is still an agenda', () => {
  const projection = agenda(input({ doses: comparison([TODAY - 2]) }));
  assert.ok(projection);
  assert.deepEqual(projection.shown, []);
  assert.equal(projection.passed?.epochDay, TODAY - 2);
});

test('the passed slot is one item: the most recent one, never a count', () => {
  const projection = agenda(input({ doses: comparison([TODAY - 5, TODAY - 2, TODAY - 4]) }));
  assert.equal(projection!.passed?.epochDay, TODAY - 2);
  assert.equal(Object.values(projection!.passed!).some((value) => value === 3), false);
});

test("today's own slot has not passed", () => {
  assert.equal(agenda(input({ doses: comparison([TODAY]) })), null);
});

test('a slot with a dose logged against it never passed', () => {
  assert.equal(agenda(input({ doses: comparison([], [TODAY - 1]) })), null);
});

test('a schedule the person never set has no passed slot to state', () => {
  for (const doses of [{ reason: 'noEpisode' }, { reason: 'multipleEpisodes' }] as DoseScheduleComparison[]) {
    assert.equal(agenda(input({ doses })), null);
  }
});

test('the passed slot states its own date', () => {
  const sentence = passedSlotSentence(TODAY - 2, (epochDay) => `day ${epochDay}`);
  assert.ok(sentence.includes(`day ${TODAY - 2}`), `the date never reached the sentence: ${sentence}`);
});

/** The vocabulary of a lapse, in both languages. A word list cannot prove a
    sentence is kind, but it can prove nobody has quietly reintroduced the
    words ADR-0062 keeps off this kind of row - and it holds for the
    translation too, which no test of the English function would see. */
const FAILURE_WORDS =
  /missed|overdue|too late|failed|forgot|skipped|streak|behind|pominię|zaległ|spóźni|nieudan|zapomnia|passa|zaniedb/i;

for (const file of ['messages/en.json', 'messages/pl.json']) {
  test(`${file} carries the passed-slot copy and it names no failure`, () => {
    const catalogue = JSON.parse(readFileSync(file, 'utf8')) as Record<string, string>;
    const sentence = catalogue.agenda_passed_dose;
    assert.ok(sentence, `${file} has no agenda_passed_dose`);
    assert.ok(sentence.includes('{date}'), `${file} states no date`);
    assert.doesNotMatch(sentence, FAILURE_WORDS);
  });
}

test('disguise returns an empty projection for every input', () => {
  const marks = Array.from({ length: AGENDA_CAP + 2 }, (_, index) => mark('appointment', TODAY + index));
  assert.equal(agenda(input({ marks, doses: comparison([TODAY - 1]), disguised: true })), null);
});
