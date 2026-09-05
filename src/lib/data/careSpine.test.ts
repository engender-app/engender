import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  careSpine,
  chooseRailEpisode,
  lastLoggedDoseDay,
  MIN_LABEL_GAP,
  nextExpectedSlot,
  scheduleDoseFacts,
  SPINE_BACK_DAYS,
  SPINE_FORWARD_DAYS,
  SPINE_MIN_BACK_DAYS,
  SPINE_MIN_FORWARD_DAYS
} from './careSpine';
import { startOfDayTimestamp } from './epochDay';
import type { DoseEvent, DosePause, DoseSchedule, RegimenEpisode } from './types';

const TODAY = 20000;

function episode(overrides: Partial<RegimenEpisode> = {}): RegimenEpisode {
  return {
    id: 'ep-1',
    drug: 'estradiol',
    ester: null,
    dose: 4,
    doseUnit: 'mg',
    route: 'im',
    interval: 'weekly',
    startEpochDay: TODAY - 100,
    endEpochDay: null,
    endReason: null,
    ...overrides
  };
}

const NO_FACTS = {
  lastDoseEpochDay: null,
  nextDoseEpochDay: null,
  labDrawEpochDay: null,
  runOutEpochDay: null
};

function dose(epochDay: number, overrides: Partial<DoseEvent> = {}): DoseEvent {
  return {
    id: `d-${epochDay}`,
    timestamp: startOfDayTimestamp(epochDay) + 9 * 3600000,
    dose: 4,
    doseUnit: 'mg',
    route: 'im',
    injectionSite: null,
    vehicle: null,
    status: 'taken',
    scheduled: null,
    drug: null,
    ...overrides
  } as DoseEvent;
}

function schedule(overrides: Partial<DoseSchedule> = {}): DoseSchedule {
  return {
    id: 's-1',
    episodeId: 'ep-1',
    recurrence: { kind: 'everyNDays', everyNDays: 7 },
    dosesPerDay: 1,
    doseAmounts: null,
    ...overrides
  } as DoseSchedule;
}

const markOf = (spine: NonNullable<ReturnType<typeof careSpine>>, kind: string) =>
  spine.marks.find((mark) => mark.kind === kind);

/* The rail exists or it does not */

test('today alone is not a rail', () => {
  assert.equal(careSpine(NO_FACTS, TODAY), null);
});

test('one other mark beside today is a rail', () => {
  const spine = careSpine({ ...NO_FACTS, nextDoseEpochDay: TODAY + 3 }, TODAY);
  assert.ok(spine);
  assert.deepEqual(
    spine.marks.map((mark) => mark.kind),
    ['today', 'nextDose']
  );
});

test('marks read left to right in time order', () => {
  const spine = careSpine(
    {
      lastDoseEpochDay: TODAY - 5,
      nextDoseEpochDay: TODAY + 2,
      labDrawEpochDay: TODAY - 20,
      runOutEpochDay: TODAY + 24
    },
    TODAY
  );
  assert.ok(spine);
  assert.deepEqual(
    spine.marks.map((mark) => mark.kind),
    ['labDraw', 'lastDose', 'today', 'nextDose', 'runOut']
  );
  const positions = spine.marks.map((mark) => mark.position);
  assert.deepEqual([...positions].sort((a, b) => a - b), positions);
});

/* What the rail spans */

test('the rail always reaches at least a fortnight either side of today', () => {
  const spine = careSpine({ ...NO_FACTS, nextDoseEpochDay: TODAY + 1 }, TODAY);
  assert.ok(spine);
  assert.equal(spine.fromEpochDay, TODAY - SPINE_MIN_BACK_DAYS);
  assert.equal(spine.toEpochDay, TODAY + SPINE_MIN_FORWARD_DAYS);
});

test('a mark past the fortnight stretches the rail to it, and lands on its end', () => {
  const spine = careSpine({ ...NO_FACTS, runOutEpochDay: TODAY + 40, labDrawEpochDay: TODAY - 30 }, TODAY);
  assert.ok(spine);
  assert.equal(spine.fromEpochDay, TODAY - 30);
  assert.equal(spine.toEpochDay, TODAY + 40);
  assert.equal(markOf(spine, 'labDraw')?.position, 0);
  assert.equal(markOf(spine, 'runOut')?.position, 1);
});

test('a mark past the rail sits at the end it was clamped to, and says so', () => {
  const spine = careSpine(
    { ...NO_FACTS, labDrawEpochDay: TODAY - 400, runOutEpochDay: TODAY + 900 },
    TODAY
  );
  assert.ok(spine);
  assert.equal(spine.fromEpochDay, TODAY - SPINE_BACK_DAYS);
  assert.equal(spine.toEpochDay, TODAY + SPINE_FORWARD_DAYS);

  const lab = markOf(spine, 'labDraw');
  assert.equal(lab?.position, 0);
  assert.equal(lab?.beyondSpan, true);
  assert.equal(lab?.epochDay, TODAY - 400, 'the label still says the day it happened');

  const runOut = markOf(spine, 'runOut');
  assert.equal(runOut?.position, 1);
  assert.equal(runOut?.beyondSpan, true);
});

test('a mark inside the rail is not beyond it', () => {
  const spine = careSpine({ ...NO_FACTS, runOutEpochDay: TODAY + 10 }, TODAY);
  assert.ok(spine);
  assert.equal(markOf(spine, 'runOut')?.beyondSpan, false);
  assert.equal(markOf(spine, 'today')?.beyondSpan, false);
});

test('today sits at the middle of the rail whatever the marks are', () => {
  for (const facts of [
    { ...NO_FACTS, runOutEpochDay: TODAY + 100 },
    { ...NO_FACTS, labDrawEpochDay: TODAY - 55 },
    { lastDoseEpochDay: TODAY - 3, nextDoseEpochDay: TODAY + 4, labDrawEpochDay: TODAY - 200, runOutEpochDay: TODAY + 9 }
  ]) {
    const spine = careSpine(facts, TODAY);
    assert.ok(spine);
    assert.equal(markOf(spine, 'today')?.position, 0.5);
  }
});

/* The rail's scale is the square root of the distance from today, not the
   distance: it is what makes a rail with a dose yesterday and a run-out in
   three weeks readable at all. Held here because it is a design decision
   about honesty rather than an implementation detail - the marks stay in
   order, so nothing on the line is ever drawn out of sequence, and every
   caption prints its own date. */
test('a day twice as far from today sits less than twice as far along', () => {
  const spine = careSpine({ ...NO_FACTS, nextDoseEpochDay: TODAY + 4, runOutEpochDay: TODAY + 16 }, TODAY);
  assert.ok(spine);
  const near = (markOf(spine, 'nextDose')?.position ?? 0) - 0.5;
  const far = (markOf(spine, 'runOut')?.position ?? 0) - 0.5;
  assert.ok(near > 0 && far > near);
  assert.ok(Math.abs(far / near - 2) < 1e-9, 'four times the days, twice the distance');
});

test('the scale never reorders two marks', () => {
  const spine = careSpine(
    { lastDoseEpochDay: TODAY - 1, nextDoseEpochDay: TODAY + 1, labDrawEpochDay: TODAY - 40, runOutEpochDay: TODAY + 2 },
    TODAY
  );
  assert.ok(spine);
  const positions = spine.marks.map((mark) => mark.position);
  assert.deepEqual([...positions].sort((a, b) => a - b), positions);
});

/* Labels that would collide take the second lane */

test('marks far apart all sit in the near lane', () => {
  const spine = careSpine({ lastDoseEpochDay: TODAY - 30, nextDoseEpochDay: TODAY + 30, labDrawEpochDay: null, runOutEpochDay: null }, TODAY);
  assert.ok(spine);
  assert.deepEqual(
    spine.marks.map((mark) => mark.lane),
    [0, 0, 0]
  );
});

test('a mark crowding the one before it drops to the far lane', () => {
  const spine = careSpine(
    { lastDoseEpochDay: TODAY - 1, nextDoseEpochDay: TODAY + 1, labDrawEpochDay: null, runOutEpochDay: TODAY + 30 },
    TODAY
  );
  assert.ok(spine);
  const lanes = new Map(spine.marks.map((mark) => [mark.kind, mark.lane]));
  assert.notEqual(lanes.get('lastDose'), lanes.get('today'));
  assert.notEqual(lanes.get('today'), lanes.get('nextDose'));
});

test('marks on the same day each get a lane of their own', () => {
  const spine = careSpine(
    { lastDoseEpochDay: TODAY, nextDoseEpochDay: null, labDrawEpochDay: TODAY, runOutEpochDay: TODAY + 20 },
    TODAY
  );
  assert.ok(spine);
  const onToday = spine.marks.filter((mark) => mark.epochDay === TODAY);
  assert.equal(onToday.length, 3);
  assert.deepEqual(
    onToday.map((mark) => mark.lane).sort(),
    [0, 1, 2],
    'three captions at one point need three lanes; two would print one over another'
  );
});

/* The case that put this rule in: dosed today, next dose tomorrow, and a
   run-out three weeks out. On a linear scale all three crowded into the last
   quarter of the rail and the captions printed on top of each other. */
test('a dose today, one tomorrow and a run-out weeks out all stay readable', () => {
  const spine = careSpine(
    { lastDoseEpochDay: TODAY, nextDoseEpochDay: TODAY + 1, labDrawEpochDay: TODAY - 70, runOutEpochDay: TODAY + 20 },
    TODAY
  );
  assert.ok(spine);
  const byLane = new Map<number, number[]>();
  for (const mark of spine.marks) byLane.set(mark.lane, [...(byLane.get(mark.lane) ?? []), mark.position]);
  for (const [lane, positions] of byLane) {
    for (let i = 1; i < positions.length; i++) {
      assert.ok(positions[i] - positions[i - 1] >= MIN_LABEL_GAP, `lane ${lane} has two captions too close together`);
    }
  }
});

test('every lane from 0 up is used, so the rail is never taller than it needs', () => {
  const spine = careSpine(
    { lastDoseEpochDay: TODAY, nextDoseEpochDay: TODAY + 1, labDrawEpochDay: TODAY - 70, runOutEpochDay: TODAY + 20 },
    TODAY
  );
  assert.ok(spine);
  const lanes = [...new Set(spine.marks.map((mark) => mark.lane))].sort((a, b) => a - b);
  assert.deepEqual(lanes, lanes.map((_, i) => i));
});

/* The two facts the rail reads off the dose log */

test('the last logged dose is the most recent one that happened', () => {
  assert.equal(lastLoggedDoseDay([dose(TODAY - 9), dose(TODAY - 2)]), TODAY - 2);
});

test('a skipped dose is not a dose that happened', () => {
  assert.equal(lastLoggedDoseDay([dose(TODAY - 9), dose(TODAY - 2, { status: 'skipped' })]), TODAY - 9);
});

test('no doses is no last dose', () => {
  assert.equal(lastLoggedDoseDay([]), null);
});

test('the next expected slot is the first one nothing is logged against', () => {
  const slot = nextExpectedSlot(schedule(), TODAY - 14, [], [], TODAY);
  assert.equal(slot?.epochDay, TODAY);
});

test("today's slot already logged moves the next one on", () => {
  const slot = nextExpectedSlot(schedule(), TODAY - 14, [dose(TODAY)], [], TODAY);
  assert.equal(slot?.epochDay, TODAY + 7);
});

test('a pause covering the next slot skips past it', () => {
  const pause: DosePause = {
    id: 'p-1',
    episodeId: 'ep-1',
    startEpochDay: TODAY,
    endEpochDay: TODAY + 1,
    reason: 'planned'
  };
  const slot = nextExpectedSlot(schedule(), TODAY - 14, [], [pause], TODAY);
  assert.equal(slot?.epochDay, TODAY + 7);
});

test('a rhythm whose next slot is past the rail has no next slot to show', () => {
  const slot = nextExpectedSlot(
    schedule({ recurrence: { kind: 'everyNDays', everyNDays: SPINE_FORWARD_DAYS + 30 } }),
    TODAY - 1,
    [],
    [],
    TODAY
  );
  assert.equal(slot, null);
});

/* Which of several active episodes draws the rail (ticket 38) */

test('one active episode of any drug always wins the rail', () => {
  const solo = episode({ drug: 'sertraline' });
  assert.deepEqual(chooseRailEpisode([solo]), { rail: solo, others: [], ambiguous: false });
});

test('no active episode leaves nothing to draw', () => {
  assert.deepEqual(chooseRailEpisode([]), { rail: null, others: [], ambiguous: false });
});

test('a curve drug alongside an unrelated one wins the rail; the other falls to its own row', () => {
  const curve = episode({ id: 'ep-curve', drug: 'estradiol' });
  const other = episode({ id: 'ep-other', drug: 'sertraline' });
  assert.deepEqual(chooseRailEpisode([curve, other]), { rail: curve, others: [other], ambiguous: false });
});

test('two concurrent curve episodes are genuinely ambiguous', () => {
  const first = episode({ id: 'ep-1', drug: 'estradiol' });
  const second = episode({ id: 'ep-2', drug: 'testosterone' });
  assert.deepEqual(chooseRailEpisode([first, second]), { rail: null, others: [first, second], ambiguous: true });
});

test('an ambiguous pair of curve episodes still lets an unrelated third row through', () => {
  const first = episode({ id: 'ep-1', drug: 'estradiol' });
  const second = episode({ id: 'ep-2', drug: 'testosterone' });
  const other = episode({ id: 'ep-3', drug: 'sertraline' });
  const result = chooseRailEpisode([first, second, other]);
  assert.equal(result.rail, null);
  assert.equal(result.ambiguous, true);
  assert.deepEqual(result.others, [first, second, other]);
});

/* One episode's own last and next dose, scoped so an unrelated concurrent
   schedule cannot bleed into either reading */

test('a dose from an earlier episode of the same drug still counts as the last one', () => {
  const oldRow = episode({ id: 'ep-old', drug: 'estradiol', startEpochDay: TODAY - 200, endEpochDay: TODAY - 50 });
  const currentRow = episode({ id: 'ep-current', drug: 'estradiol', startEpochDay: TODAY - 49 });
  const doses = [dose(TODAY - 60)]; // logged while ep-old was the active row
  const facts = scheduleDoseFacts(currentRow, [oldRow, currentRow], null, doses, [], TODAY);
  assert.equal(facts.lastDoseEpochDay, TODAY - 60);
});

/* The one edge the drug-name scoping reads differently to the whole-log
   scan it replaced: a dose logged before any episode covered it at all
   (nothing running yet, or an episode later deleted from under it). The
   old, unfiltered read counted it regardless; attributeDrug has nothing to
   attribute it to and drops it. A deliberate, documented narrowing
   (ticket 38's Decisions), not an oversight - a dose with no regimen
   covering it has nothing to say about that regimen's rail. */
test('a dose predating any episode does not count as that episode’s last one', () => {
  const solo = episode({ startEpochDay: TODAY - 10 });
  const facts = scheduleDoseFacts(solo, [solo], null, [dose(TODAY - 20)], [], TODAY);
  assert.equal(facts.lastDoseEpochDay, null, 'the dose predates the only episode there is, so it attributes to nothing');
});

test("a concurrent unrelated schedule's dose does not become this episode's last dose", () => {
  const curve = episode({ id: 'ep-curve', drug: 'estradiol' });
  const other = episode({ id: 'ep-other', drug: 'sertraline', dose: 50, doseUnit: 'mg', route: 'oral' });
  const doses = [
    dose(TODAY - 1, { drug: 'estradiol' }),
    dose(TODAY, { drug: 'sertraline' })
  ];
  const facts = scheduleDoseFacts(curve, [curve, other], null, doses, [], TODAY);
  assert.equal(facts.lastDoseEpochDay, TODAY - 1, 'today’s dose was the other drug, not this one');
});

test('no schedule for an episode means no next dose, but last dose still reads', () => {
  const solo = episode();
  const facts = scheduleDoseFacts(solo, [solo], null, [dose(TODAY - 3)], [], TODAY);
  assert.deepEqual(facts, { lastDoseEpochDay: TODAY - 3, nextDoseEpochDay: null });
});

test("next dose still asks doseSchedule.ts's own arithmetic, scoped to this episode's id", () => {
  const solo = episode({ startEpochDay: TODAY - 14 });
  const facts = scheduleDoseFacts(solo, [solo], schedule(), [], [], TODAY);
  assert.equal(facts.nextDoseEpochDay, TODAY);
});
