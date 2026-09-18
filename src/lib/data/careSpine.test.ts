import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  careSpine,
  lastLoggedDoseDay,
  MIN_LABEL_GAP,
  nextExpectedSlot,
  railEpisodes,
  scheduleDoseFacts,
  SPINE_BACK_DAYS,
  SPINE_FORWARD_DAYS,
  SPINE_MIN_BACK_DAYS,
  SPINE_MIN_FORWARD_DAYS,
  type CareSpine,
  type LaneFacts
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

/** One lane's own three days, all absent unless the test says otherwise. */
function lane(overrides: Partial<LaneFacts> = {}): LaneFacts {
  return {
    episodeId: 'ep-1',
    drug: 'estradiol',
    lastDoseEpochDay: null,
    nextDoseEpochDay: null,
    runOutEpochDay: null,
    ...overrides
  };
}

/** The one-drug spine most of these tests are about: a single lane, and
    whatever lab draw the case needs. */
function oneLane(own: Partial<LaneFacts>, labDrawEpochDay: number | null = null, todayEpochDay = TODAY) {
  return careSpine({ labDrawEpochDay, lanes: [lane(own)] }, todayEpochDay);
}

const NO_FACTS = { labDrawEpochDay: null, lanes: [lane()] };

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

/** Every mark on the rail, shared and per lane alike - what the old
    single-lane `spine.marks` was. */
const allMarks = (spine: CareSpine) => [...spine.shared, ...spine.lanes.flatMap((l) => l.marks)];

const markOf = (spine: CareSpine, kind: string) => allMarks(spine).find((mark) => mark.kind === kind);

/* The rail exists or it does not */

test('today alone is not a rail', () => {
  assert.equal(careSpine(NO_FACTS, TODAY), null);
});

test('one other mark beside today is a rail', () => {
  const spine = oneLane({ nextDoseEpochDay: TODAY + 3 });
  assert.ok(spine);
  assert.deepEqual(
    spine.shared.map((mark) => mark.kind),
    ['today']
  );
  assert.deepEqual(
    spine.lanes.map((l) => l.marks.map((mark) => mark.kind)),
    [['nextDose']]
  );
});

test('a lane with nothing logged against it yet draws no line', () => {
  const spine = careSpine(
    {
      labDrawEpochDay: TODAY - 9,
      lanes: [lane({ episodeId: 'ep-1', nextDoseEpochDay: TODAY + 2 }), lane({ episodeId: 'ep-2', drug: 'Sertraline' })]
    },
    TODAY
  );
  assert.ok(spine);
  assert.deepEqual(
    spine.lanes.map((l) => l.episodeId),
    ['ep-1'],
    'a running regimen with no last dose, next dose or run-out has no mark to put on a line'
  );
});

test('marks read left to right in time order', () => {
  const spine = oneLane(
    { lastDoseEpochDay: TODAY - 5, nextDoseEpochDay: TODAY + 2, runOutEpochDay: TODAY + 24 },
    TODAY - 20
  );
  assert.ok(spine);
  assert.deepEqual(
    spine.shared.map((mark) => mark.kind),
    ['labDraw', 'today']
  );
  assert.deepEqual(
    spine.lanes[0].marks.map((mark) => mark.kind),
    ['lastDose', 'nextDose', 'runOut']
  );
  for (const marks of [spine.shared, spine.lanes[0].marks]) {
    const positions = marks.map((mark) => mark.position);
    assert.deepEqual([...positions].sort((a, b) => a - b), positions);
  }
});

/* What the rail spans */

test('the rail always reaches at least a fortnight either side of today', () => {
  const spine = oneLane({ nextDoseEpochDay: TODAY + 1 });
  assert.ok(spine);
  assert.equal(spine.fromEpochDay, TODAY - SPINE_MIN_BACK_DAYS);
  assert.equal(spine.toEpochDay, TODAY + SPINE_MIN_FORWARD_DAYS);
});

test('a mark past the fortnight stretches the rail to it, and lands on its end', () => {
  const spine = oneLane({ runOutEpochDay: TODAY + 40 }, TODAY - 30);
  assert.ok(spine);
  assert.equal(spine.fromEpochDay, TODAY - 30);
  assert.equal(spine.toEpochDay, TODAY + 40);
  assert.equal(markOf(spine, 'labDraw')?.position, 0);
  assert.equal(markOf(spine, 'runOut')?.position, 1);
});

test('a mark past the rail sits at the end it was clamped to, and says so', () => {
  const spine = oneLane({ runOutEpochDay: TODAY + 900 }, TODAY - 400);
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
  const spine = oneLane({ runOutEpochDay: TODAY + 10 });
  assert.ok(spine);
  assert.equal(markOf(spine, 'runOut')?.beyondSpan, false);
  assert.equal(markOf(spine, 'today')?.beyondSpan, false);
});

test('today sits at the middle of the rail whatever the marks are', () => {
  const spines = [
    oneLane({ runOutEpochDay: TODAY + 100 }),
    oneLane({}, TODAY - 55),
    oneLane({ lastDoseEpochDay: TODAY - 3, nextDoseEpochDay: TODAY + 4, runOutEpochDay: TODAY + 9 }, TODAY - 200)
  ];
  for (const spine of spines) {
    assert.ok(spine);
    assert.equal(markOf(spine, 'today')?.position, 0.5);
  }
});

/* One day axis, whatever a lane's own days are: two lanes are only
   comparable if the same distance along the rail means the same day on
   both. */

test('every lane is placed against one span, taken across all of them', () => {
  const spine = careSpine(
    {
      labDrawEpochDay: null,
      lanes: [
        lane({ episodeId: 'ep-1', nextDoseEpochDay: TODAY + 2 }),
        lane({ episodeId: 'ep-2', drug: 'Progesterone', nextDoseEpochDay: TODAY + 2, runOutEpochDay: TODAY + 60 })
      ]
    },
    TODAY
  );
  assert.ok(spine);
  assert.equal(spine.toEpochDay, TODAY + 60, 'the far run-out on the second lane opens the span for both');
  const [first, second] = spine.lanes;
  assert.equal(
    first.marks.find((m) => m.kind === 'nextDose')?.position,
    second.marks.find((m) => m.kind === 'nextDose')?.position,
    'the same day is the same distance along on both lanes'
  );
});

/* The rail's scale is the square root of the distance from today, not the
   distance: it is what makes a rail with a dose yesterday and a run-out in
   three weeks readable at all. Held here because it is a design decision
   about honesty rather than an implementation detail - the marks stay in
   order, so nothing on the line is ever drawn out of sequence, and every
   caption prints its own date. */
test('a day twice as far from today sits less than twice as far along', () => {
  const spine = oneLane({ nextDoseEpochDay: TODAY + 4, runOutEpochDay: TODAY + 16 });
  assert.ok(spine);
  const near = (markOf(spine, 'nextDose')?.position ?? 0) - 0.5;
  const far = (markOf(spine, 'runOut')?.position ?? 0) - 0.5;
  assert.ok(near > 0 && far > near);
  assert.ok(Math.abs(far / near - 2) < 1e-9, 'four times the days, twice the distance');
});

test('the scale never reorders two marks', () => {
  const spine = oneLane(
    { lastDoseEpochDay: TODAY - 1, nextDoseEpochDay: TODAY + 1, runOutEpochDay: TODAY + 2 },
    TODAY - 40
  );
  assert.ok(spine);
  const positions = spine.lanes[0].marks.map((mark) => mark.position);
  assert.deepEqual([...positions].sort((a, b) => a - b), positions);
});

/* Labels that would collide take the next row down, inside their own lane */

test('marks far apart all sit in the near row', () => {
  const spine = oneLane({ lastDoseEpochDay: TODAY - 30, nextDoseEpochDay: TODAY + 30 });
  assert.ok(spine);
  assert.deepEqual(
    allMarks(spine).map((mark) => mark.labelRow),
    [0, 0, 0]
  );
});

test('a mark crowding the one before it drops to the next row down', () => {
  const spine = oneLane({ lastDoseEpochDay: TODAY - 1, nextDoseEpochDay: TODAY + 1, runOutEpochDay: TODAY + 30 });
  assert.ok(spine);
  const rows = new Map(spine.lanes[0].marks.map((mark) => [mark.kind, mark.labelRow]));
  assert.notEqual(rows.get('lastDose'), rows.get('nextDose'));
});

test("a lane's own labels never collide with the rail's shared ones", () => {
  /* The case the one-lane spine spent a whole label row on: today and a
     dose the next day. The two now head different rows of the card - today
     labels the rail once, the lane's captions hang under its own line - so
     neither is pushed out for the other. */
  const spine = oneLane({ nextDoseEpochDay: TODAY + 1 });
  assert.ok(spine);
  assert.equal(markOf(spine, 'today')?.labelRow, 0);
  assert.equal(markOf(spine, 'nextDose')?.labelRow, 0);
});

test('marks on the same day in one lane each get a row of their own', () => {
  const spine = oneLane({ lastDoseEpochDay: TODAY, nextDoseEpochDay: TODAY, runOutEpochDay: TODAY + 20 });
  assert.ok(spine);
  const onToday = spine.lanes[0].marks.filter((mark) => mark.epochDay === TODAY);
  assert.equal(onToday.length, 2);
  assert.deepEqual(
    onToday.map((mark) => mark.labelRow).sort(),
    [0, 1],
    'two captions at one point need two rows; one would print over the other'
  );
});

/* The case that put this rule in: dosed today, next dose tomorrow, and a
   run-out three weeks out. On a linear scale all three crowded into the last
   quarter of the rail and the captions printed on top of each other. */
test('a dose today, one tomorrow and a run-out weeks out all stay readable', () => {
  const spine = oneLane(
    { lastDoseEpochDay: TODAY, nextDoseEpochDay: TODAY + 1, runOutEpochDay: TODAY + 20 },
    TODAY - 70
  );
  assert.ok(spine);
  for (const marks of [spine.shared, ...spine.lanes.map((l) => l.marks)]) {
    const byRow = new Map<number, number[]>();
    for (const mark of marks) byRow.set(mark.labelRow, [...(byRow.get(mark.labelRow) ?? []), mark.position]);
    for (const [row, positions] of byRow) {
      for (let i = 1; i < positions.length; i++) {
        assert.ok(positions[i] - positions[i - 1] >= MIN_LABEL_GAP, `row ${row} has two captions too close together`);
      }
    }
  }
});

test('every row from 0 up is used, so a lane is never taller than it needs', () => {
  const spine = oneLane(
    { lastDoseEpochDay: TODAY, nextDoseEpochDay: TODAY + 1, runOutEpochDay: TODAY + 20 },
    TODAY - 70
  );
  assert.ok(spine);
  const rows = [...new Set(spine.lanes[0].marks.map((mark) => mark.labelRow))].sort((a, b) => a - b);
  assert.deepEqual(rows, rows.map((_, i) => i));
});

/* Three running drugs: three lanes of their own marks, one set of shared
   ones (phase 11 ticket 10) */

test('three running episodes draw three lanes with their own last, next and run-out', () => {
  const spine = careSpine(
    {
      labDrawEpochDay: TODAY - 71,
      lanes: [
        lane({
          episodeId: 'ep-e',
          drug: 'Estradiol valerate',
          lastDoseEpochDay: TODAY - 2,
          nextDoseEpochDay: TODAY + 5,
          runOutEpochDay: TODAY + 21
        }),
        lane({
          episodeId: 'ep-p',
          drug: 'Progesterone',
          lastDoseEpochDay: TODAY - 1,
          nextDoseEpochDay: TODAY,
          runOutEpochDay: TODAY + 40
        }),
        lane({ episodeId: 'ep-s', drug: 'Sertraline', lastDoseEpochDay: TODAY, nextDoseEpochDay: TODAY + 1 })
      ]
    },
    TODAY
  );
  assert.ok(spine);

  assert.deepEqual(
    spine.shared.map((mark) => mark.kind),
    ['labDraw', 'today'],
    'today and the draw are drawn once for the whole rail, not once per lane'
  );
  assert.deepEqual(
    spine.lanes.map((l) => [l.episodeId, l.drug, l.marks.map((mark) => mark.kind)]),
    [
      ['ep-e', 'Estradiol valerate', ['lastDose', 'nextDose', 'runOut']],
      ['ep-p', 'Progesterone', ['lastDose', 'nextDose', 'runOut']],
      ['ep-s', 'Sertraline', ['lastDose', 'nextDose']]
    ],
    'each lane carries its own three readings, and only the ones it has'
  );
  assert.equal(spine.lanes[1].marks.find((m) => m.kind === 'nextDose')?.position, 0.5, "one lane's next dose is today");
});

test('one episode yields one lane, over the same span and positions as three would give it', () => {
  const own = {
    episodeId: 'ep-e',
    drug: 'Estradiol valerate',
    lastDoseEpochDay: TODAY - 2,
    nextDoseEpochDay: TODAY + 5,
    runOutEpochDay: TODAY + 21
  };
  const alone = careSpine({ labDrawEpochDay: TODAY - 71, lanes: [lane(own)] }, TODAY);
  assert.ok(alone);
  assert.equal(alone.lanes.length, 1);
  assert.equal(alone.fromEpochDay, TODAY - SPINE_BACK_DAYS);
  assert.deepEqual(
    alone.lanes[0].marks.map((mark) => [mark.kind, mark.labelRow]),
    [
      ['lastDose', 0],
      ['nextDose', 1],
      ['runOut', 0]
    ],
    'a lone lane resolves its own crowding exactly as one of three does'
  );
});

/* Which order the lanes are drawn in (phase 11 ticket 10) */

test('every running episode gets a lane, curve drugs first', () => {
  const curve = episode({ id: 'ep-curve', drug: 'estradiol', startEpochDay: TODAY - 10 });
  const other = episode({ id: 'ep-other', drug: 'sertraline', startEpochDay: TODAY - 300 });
  assert.deepEqual(
    railEpisodes([other, curve]).map((e) => e.id),
    ['ep-curve', 'ep-other']
  );
});

test('two curve episodes both get a lane rather than cancelling each other out', () => {
  const first = episode({ id: 'ep-1', drug: 'estradiol', startEpochDay: TODAY - 400 });
  const second = episode({ id: 'ep-2', drug: 'testosterone', startEpochDay: TODAY - 40 });
  assert.deepEqual(
    railEpisodes([second, first]).map((e) => e.id),
    ['ep-1', 'ep-2'],
    'the older of the two curve drugs is drawn first; neither is primary'
  );
});

test('one active episode of any drug is one lane', () => {
  const solo = episode({ drug: 'sertraline' });
  assert.deepEqual(railEpisodes([solo]), [solo]);
});

test('no active episode is no lane', () => {
  assert.deepEqual(railEpisodes([]), []);
});

test('lanes of the same class read oldest first', () => {
  const young = episode({ id: 'ep-young', drug: 'Sertraline', startEpochDay: TODAY - 50 });
  const old = episode({ id: 'ep-old', drug: 'Progesterone', startEpochDay: TODAY - 300 });
  assert.deepEqual(
    railEpisodes([young, old]).map((e) => e.id),
    ['ep-old', 'ep-young']
  );
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
  assert.deepEqual(facts, { lastDoseEpochDay: TODAY - 3, lastDoseId: `d-${TODAY - 3}`, nextDoseEpochDay: null });
});

test("next dose still asks doseSchedule.ts's own arithmetic, scoped to this episode's id", () => {
  const solo = episode({ startEpochDay: TODAY - 14 });
  const facts = scheduleDoseFacts(solo, [solo], schedule(), [], [], TODAY);
  assert.equal(facts.nextDoseEpochDay, TODAY);
});

test('careSpine marks carry the backing record IDs for last dose and lab draw', () => {
  const spine = careSpine(
    {
      labDrawEpochDay: TODAY - 10,
      labDrawId: 'lab-123',
      lanes: [
        {
          episodeId: 'ep-1',
          drug: 'estradiol',
          lastDoseEpochDay: TODAY - 2,
          lastDoseId: 'dose-456',
          nextDoseEpochDay: TODAY + 5,
          runOutEpochDay: null
        }
      ]
    },
    TODAY
  )!;
  assert.ok(spine);
  const labMark = spine.shared.find((m) => m.kind === 'labDraw');
  assert.equal(labMark?.recordId, 'lab-123');
  const laneMarks = spine.lanes[0].marks;
  const lastDoseMark = laneMarks.find((m) => m.kind === 'lastDose');
  assert.equal(lastDoseMark?.recordId, 'dose-456');
  const nextDoseMark = laneMarks.find((m) => m.kind === 'nextDose');
  assert.equal(nextDoseMark?.recordId, null);
});
