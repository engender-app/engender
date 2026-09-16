import { test } from 'vitest';
import assert from 'node:assert/strict';
import { ROW_FORWARD_KEYS, rowForward, type RowForwardFacts as Facts } from './rowForward.ts';
import type { ProcedureConsult } from './types.ts';

const TODAY = 20000;

const facts = (over: Partial<Facts> = {}): Facts => ({
  todayEpochDay: TODAY,
  milestones: [],
  sealedUnlockDays: [],
  runningWear: null,
  tryouts: [],
  appointments: [],
  procedures: [],
  nextDoseEpochDay: null,
  runOutEpochDay: null,
  latestMeasurement: null,
  ...over
});

/* Every helper builds the narrowed shape `RowForwardFacts` declares rather
   than a whole record: what this module may read is the whole of what it is
   given, and a fixture carrying a milestone's photo would suggest otherwise. */
const milestone = (name: string, epochDay: number): Facts['milestones'][number] => ({ name, epochDay });

const appointment = (
  epochDay: number,
  kind: string | null,
  procedureId: string | null = null
): Facts['appointments'][number] => ({ epochDay, kind, procedureId });

const procedure = (
  over: { surgeryEpochDay?: number | null; consults?: ProcedureConsult[] } = {}
): Facts['procedures'][number] => ({ surgeryEpochDay: null, consults: [], ...over });

const tryout = (
  label: string,
  startEpochDay: number,
  endEpochDay: number | null = null
): Facts['tryouts'][number] => ({ label, startEpochDay, endEpochDay });

const measurement = (): NonNullable<Facts['latestMeasurement']> => ({
  type: 'waist',
  epochDay: TODAY - 8,
  value: 77,
  unit: 'cm'
});

// --- nothing to say ------------------------------------------------------

test('an empty journal puts no row forward', () => {
  assert.deepEqual(rowForward(facts()), {});
});

/* The map is sparse on purpose: `rowLine` falls through to the reading a row
   always had, so a key present with a null fact would be a row that reports
   neither. */
test('a row with nothing ahead is absent rather than null', () => {
  const map = rowForward(facts({ milestones: [milestone('Started HRT', TODAY - 400)] }));
  assert.equal('milestones' in map, false);
});

// --- milestones ----------------------------------------------------------

test('the milestones row names the soonest milestone still ahead', () => {
  const map = rowForward(
    facts({
      milestones: [
        milestone('Voice workshop weekend', TODAY + 42),
        milestone('Name-change hearing', TODAY + 16),
        milestone('Started HRT', TODAY - 400)
      ]
    })
  );
  assert.deepEqual(map.milestones, {
    kind: 'next',
    epochDay: TODAY + 16,
    what: { area: 'milestone', name: 'Name-change hearing' }
  });
});

test('a milestone landing today is still ahead', () => {
  const map = rowForward(facts({ milestones: [milestone('Name-change hearing', TODAY)] }));
  assert.deepEqual(map.milestones, {
    kind: 'next',
    epochDay: TODAY,
    what: { area: 'milestone', name: 'Name-change hearing' }
  });
});

/* A past milestone has an anniversary and the row says nothing about it: an
   anniversary is a reading of a day that already happened, so announcing one
   would put a date on the row the person never entered. */
test('a past milestone does not become a forward fact through its anniversary', () => {
  const map = rowForward(facts({ milestones: [milestone('Started HRT', TODAY - 364)] }));
  assert.equal(map.milestones, undefined);
});

// --- letters -------------------------------------------------------------

test('one sealed letter says when it opens', () => {
  const map = rowForward(facts({ sealedUnlockDays: [TODAY + 42] }));
  assert.deepEqual(map.letters, { kind: 'next', epochDay: TODAY + 42, what: { area: 'letter', several: false } });
});

test('several sealed letters report the soonest, and that there are several', () => {
  const map = rowForward(facts({ sealedUnlockDays: [TODAY + 300, TODAY + 42, TODAY + 90] }));
  assert.deepEqual(map.letters, { kind: 'next', epochDay: TODAY + 42, what: { area: 'letter', several: true } });
});

test('a letter already open counts towards neither the day nor the several', () => {
  const map = rowForward(facts({ sealedUnlockDays: [TODAY - 5, TODAY + 42] }));
  assert.deepEqual(map.letters, { kind: 'next', epochDay: TODAY + 42, what: { area: 'letter', several: false } });
});

// --- wear ----------------------------------------------------------------

test('a running wear session carries its kind and its start', () => {
  const map = rowForward(facts({ runningWear: { kind: 'binder', startTimestamp: 1_700_000_000_000 } }));
  assert.deepEqual(map.wear, {
    kind: 'running',
    what: { area: 'wear', wearKind: 'binder', startTimestamp: 1_700_000_000_000 }
  });
});

// --- tryouts -------------------------------------------------------------

test('the running tryout counts its first day as day one', () => {
  const map = rowForward(facts({ tryouts: [tryout('she/her', TODAY - 100)] }));
  assert.deepEqual(map.tryouts, { kind: 'running', what: { area: 'tryout', label: 'she/her', dayCount: 101 } });
});

test('an ended tryout is not running', () => {
  const map = rowForward(facts({ tryouts: [tryout('they/them', TODAY - 100, TODAY - 2)] }));
  assert.equal(map.tryouts, undefined);
});

/* Several can be open at once, and the one that has been running longest is
   the one with something to report - a tryout started this morning says "day
   1", which the person has just written down themselves. */
test('with several running, the longest-running one speaks', () => {
  const map = rowForward(facts({ tryouts: [tryout('he/him', TODAY - 3), tryout('she/her', TODAY - 100)] }));
  assert.deepEqual(map.tryouts, { kind: 'running', what: { area: 'tryout', label: 'she/her', dayCount: 101 } });
});

test('a tryout dated to start next week is not running yet', () => {
  const map = rowForward(facts({ tryouts: [tryout('she/her', TODAY + 7)] }));
  assert.equal(map.tryouts, undefined);
});

// --- appointments --------------------------------------------------------

test('the appointments row names the kind of the soonest one', () => {
  const map = rowForward(
    facts({ appointments: [appointment(TODAY + 30, 'GP'), appointment(TODAY + 12, 'Endocrinologist')] })
  );
  assert.deepEqual(map.appointments, {
    kind: 'next',
    epochDay: TODAY + 12,
    what: { area: 'appointment', appointmentKind: 'Endocrinologist' }
  });
});

test('an appointment with no kind still dates itself', () => {
  const map = rowForward(facts({ appointments: [appointment(TODAY + 12, null)] }));
  assert.deepEqual(map.appointments, {
    kind: 'next',
    epochDay: TODAY + 12,
    what: { area: 'appointment', appointmentKind: null }
  });
});

/* ADR-0066: a consult is one appointment record read by two screens. The
   surgery row states it, so the appointments row does not - otherwise one
   fact is drawn twice on one door. */
test('a consult belongs to the surgery row, not the appointments row', () => {
  const map = rowForward(facts({ appointments: [appointment(TODAY + 9, 'Consult', 'pr-1')] }));
  assert.equal(map.appointments, undefined);
});

test('a past appointment is not ahead', () => {
  const map = rowForward(facts({ appointments: [appointment(TODAY - 1, 'GP')] }));
  assert.equal(map.appointments, undefined);
});

// --- surgery -------------------------------------------------------------

test('a consult still ahead is what the surgery row says', () => {
  const map = rowForward(facts({ procedures: [procedure({ consults: [{ id: 'c1', epochDay: TODAY + 9 }] })] }));
  assert.deepEqual(map.surgery, { kind: 'next', epochDay: TODAY + 9, what: { area: 'consult' } });
});

test('with no consult ahead, a dated operation is', () => {
  const map = rowForward(facts({ procedures: [procedure({ surgeryEpochDay: TODAY + 60 })] }));
  assert.deepEqual(map.surgery, { kind: 'next', epochDay: TODAY + 60, what: { area: 'surgery' } });
});

test('the nearer of a consult and an operation wins', () => {
  const map = rowForward(
    facts({
      procedures: [procedure({ surgeryEpochDay: TODAY + 60, consults: [{ id: 'c1', epochDay: TODAY + 9 }] })]
    })
  );
  assert.deepEqual(map.surgery, { kind: 'next', epochDay: TODAY + 9, what: { area: 'consult' } });
});

/* Rule 16's order, and this ticket's choice rule: what is running comes
   before what is next. So an operation already behind reads as a post-op day
   even where a consult is dated ahead of today. */
test('a past operation reads as a post-op day, ahead of a dated consult', () => {
  const map = rowForward(
    facts({
      procedures: [procedure({ surgeryEpochDay: TODAY - 400, consults: [{ id: 'c1', epochDay: TODAY + 9 }] })]
    })
  );
  assert.deepEqual(map.surgery, { kind: 'running', what: { area: 'postOp', days: 400 } });
});

/* Unbounded by SURGERY_RECOVERY_CUTOFF_DAYS: the Home tile drops away after
   ninety days because it is news; a row saying what is behind it is not. */
test('the post-op count is not cut off at ninety days', () => {
  const map = rowForward(facts({ procedures: [procedure({ surgeryEpochDay: TODAY - 400 })] }));
  assert.deepEqual(map.surgery, { kind: 'running', what: { area: 'postOp', days: 400 } });
});

test('an operation today reads as day zero rather than as a countdown', () => {
  const map = rowForward(facts({ procedures: [procedure({ surgeryEpochDay: TODAY })] }));
  assert.deepEqual(map.surgery, { kind: 'running', what: { area: 'postOp', days: 0 } });
});

test('with two operations behind, the count is from the most recent', () => {
  const map = rowForward(
    facts({
      procedures: [
        procedure({ surgeryEpochDay: TODAY - 400 }),
        procedure({ surgeryEpochDay: TODAY - 30 })
      ]
    })
  );
  assert.deepEqual(map.surgery, { kind: 'running', what: { area: 'postOp', days: 30 } });
});

test('a procedure with no dates at all says nothing', () => {
  const map = rowForward(facts({ procedures: [procedure()] }));
  assert.equal(map.surgery, undefined);
});

// --- care ----------------------------------------------------------------

test('the care row states the next dose with the run-out beside it', () => {
  const map = rowForward(facts({ nextDoseEpochDay: TODAY + 2, runOutEpochDay: TODAY + 19 }));
  assert.deepEqual(map.care, {
    kind: 'next',
    epochDay: TODAY + 2,
    what: { area: 'dose', runOutEpochDay: TODAY + 19 }
  });
});

test('a next dose with no projected run-out states the dose alone', () => {
  const map = rowForward(facts({ nextDoseEpochDay: TODAY + 2 }));
  assert.deepEqual(map.care, { kind: 'next', epochDay: TODAY + 2, what: { area: 'dose', runOutEpochDay: null } });
});

test('a run-out with no schedule to expect a dose stands on its own', () => {
  const map = rowForward(facts({ runOutEpochDay: TODAY + 19 }));
  assert.deepEqual(map.care, { kind: 'next', epochDay: TODAY + 19, what: { area: 'runOut' } });
});

// --- measurements --------------------------------------------------------

/* The one row with neither a span nor a date. It states the value rather
   than the age of it, since a value is more of a reading than a gap. */
test('the measurements row states its last value and the day it was taken', () => {
  const map = rowForward(facts({ latestMeasurement: measurement() }));
  assert.deepEqual(map.measurements, { kind: 'value', epochDay: TODAY - 8, type: 'waist', value: 77, unit: 'cm' });
});

// --- the registry is the only enumeration --------------------------------

test('every declared key has a rule, and no rule invents a key', () => {
  const map = rowForward(
    facts({
      milestones: [milestone('Name-change hearing', TODAY + 16)],
      sealedUnlockDays: [TODAY + 42],
      runningWear: { kind: 'binder', startTimestamp: 1_700_000_000_000 },
      tryouts: [tryout('she/her', TODAY - 100)],
      appointments: [appointment(TODAY + 12, 'Endocrinologist')],
      procedures: [procedure({ surgeryEpochDay: TODAY - 400 })],
      nextDoseEpochDay: TODAY + 2,
      runOutEpochDay: TODAY + 19,
      latestMeasurement: measurement()
    })
  );
  assert.deepEqual(Object.keys(map).sort(), [...ROW_FORWARD_KEYS].sort());
});
