import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  procedureRail,
  RAIL_BACK_REACH_DAYS,
  RAIL_MIN_BACK_DAYS,
  RAIL_MIN_FORWARD_DAYS
} from './procedureRail';

const TODAY = 20000;

const consult = (epochDay: number, id = `c${epochDay}`) => ({ id, epochDay });

const positionOf = (rail: ReturnType<typeof procedureRail>, kind: string, epochDay?: number) => {
  const mark = rail.marks.find((m) => m.kind === kind && (epochDay === undefined || m.epochDay === epochDay));
  assert.ok(mark, `no ${kind} mark${epochDay === undefined ? '' : ` on day ${epochDay}`}`);
  return mark.position;
};

test('the date is the rail\'s pivot, with today on whichever side it belongs', () => {
  const ahead = procedureRail({ surgeryEpochDay: TODAY + 30, consults: [] }, TODAY);
  const behind = procedureRail({ surgeryEpochDay: TODAY - 30, consults: [] }, TODAY);
  assert.equal(ahead.pivot, positionOf(ahead, 'surgery'));
  assert.equal(behind.pivot, positionOf(behind, 'surgery'));
  assert.ok(positionOf(ahead, 'today') < ahead.pivot, 'a date still ahead puts today behind it');
  assert.ok(positionOf(behind, 'today') > behind.pivot, 'a date already past puts today ahead of it');
});

test('where the date falls along the rail is a fact about the journey', () => {
  /* The defect this replaced: with the pivot pinned to the middle, every
     procedure past its date drew the same right half - the date at 0.5 and
     today hard against 1. */
  const fresh = procedureRail(
    { surgeryEpochDay: TODAY - 18, consults: [consult(TODAY - 160), consult(TODAY - 52)] },
    TODAY
  );
  const old = procedureRail(
    { surgeryEpochDay: TODAY - 400, consults: [consult(TODAY - 460), consult(TODAY - 420)] },
    TODAY
  );
  assert.ok(fresh.pivot !== null && old.pivot !== null);
  assert.ok(fresh.pivot > 0.6, `a recent operation sits late on its own rail, not at ${fresh.pivot}`);
  assert.ok(old.pivot < 0.4, `one four hundred days back sits early, not at ${old.pivot}`);
});

test('consults sit behind the date and keep their order', () => {
  const rail = procedureRail(
    { surgeryEpochDay: TODAY - 400, consults: [consult(TODAY - 460), consult(TODAY - 420)] },
    TODAY
  );
  const first = positionOf(rail, 'consult', TODAY - 460);
  const second = positionOf(rail, 'consult', TODAY - 420);
  assert.ok(rail.pivot !== null);
  assert.ok(first < second, 'the older consult is drawn further left');
  assert.ok(second < rail.pivot, 'both are behind the date');
  assert.equal(first, 0, 'the earliest consult is the rail\'s left end');
  assert.deepEqual(
    rail.marks.map((mark) => mark.kind),
    ['consult', 'consult', 'surgery', 'today']
  );
});

test('a consult further back than the reach is drawn at the end and flagged', () => {
  const rail = procedureRail(
    {
      surgeryEpochDay: TODAY - 10,
      consults: [consult(TODAY - 10 - RAIL_BACK_REACH_DAYS - 200), consult(TODAY - 20)]
    },
    TODAY
  );
  const far = rail.marks.find((mark) => mark.epochDay === TODAY - 10 - RAIL_BACK_REACH_DAYS - 200);
  const near = rail.marks.find((mark) => mark.epochDay === TODAY - 20);
  assert.ok(far && near);
  assert.equal(far.beyondSpan, true);
  assert.equal(far.position, 0);
  assert.equal(near.beyondSpan, false);
  assert.equal(rail.fromEpochDay, TODAY - 10 - RAIL_BACK_REACH_DAYS);
  assert.ok(rail.pivot !== null && near.position > rail.pivot * 0.8,
    'the near consult keeps its room rather than being crushed by the far one');
});

test('today is never beyond the span, however far off the date is', () => {
  const soon = procedureRail({ surgeryEpochDay: TODAY + 900, consults: [] }, TODAY);
  const old = procedureRail({ surgeryEpochDay: TODAY - 4000, consults: [] }, TODAY);
  for (const rail of [soon, old]) {
    const today = rail.marks.find((mark) => mark.kind === 'today');
    assert.ok(today);
    assert.equal(today.beyondSpan, false);
    assert.ok(today.position >= 0 && today.position <= 1);
  }
  assert.equal(soon.fromEpochDay, TODAY);
  assert.equal(old.toEpochDay, TODAY);
});

test('the rail keeps a floor either side so two marks are never just the two ends', () => {
  const rail = procedureRail({ surgeryEpochDay: TODAY, consults: [consult(TODAY - 1)] }, TODAY);
  assert.equal(rail.fromEpochDay, TODAY - RAIL_MIN_BACK_DAYS);
  assert.equal(rail.toEpochDay, TODAY + RAIL_MIN_FORWARD_DAYS);
  const yesterday = positionOf(rail, 'consult', TODAY - 1);
  assert.ok(rail.pivot !== null);
  assert.ok(yesterday > 0, 'the consult is off the left end rather than on it');
  assert.ok(yesterday < rail.pivot);
});

test('the gap runs between the date and today, on whichever side today is', () => {
  const healing = procedureRail({ surgeryEpochDay: TODAY - 30, consults: [] }, TODAY);
  assert.ok(healing.gap);
  assert.equal(healing.gap.from, healing.pivot);
  assert.equal(healing.gap.to, positionOf(healing, 'today'));

  const waiting = procedureRail({ surgeryEpochDay: TODAY + 30, consults: [] }, TODAY);
  assert.ok(waiting.gap);
  assert.equal(waiting.gap.from, positionOf(waiting, 'today'));
  assert.equal(waiting.gap.to, waiting.pivot);
});

test('the gap is drawn no further than today, so nothing paces a recovery', () => {
  const rail = procedureRail({ surgeryEpochDay: TODAY - 3, consults: [] }, TODAY);
  assert.ok(rail.gap);
  assert.equal(rail.gap.to, positionOf(rail, 'today'));
  assert.ok(rail.gap.to < 1, 'the stretch travelled is not the whole of the line ahead');
  assert.equal(rail.toEpochDay, TODAY + RAIL_MIN_FORWARD_DAYS - 3);
});

test('a consult at the rail\'s left end sits at 0 and today at its right', () => {
  const rail = procedureRail(
    { surgeryEpochDay: TODAY - 400, consults: [consult(TODAY - 460)] },
    TODAY
  );
  assert.equal(positionOf(rail, 'consult', TODAY - 460), 0);
  assert.equal(positionOf(rail, 'today'), 1);
});

test('with no date there is no pivot and no gap, and the line runs on past today', () => {
  const rail = procedureRail({ surgeryEpochDay: null, consults: [consult(TODAY - 40)] }, TODAY);
  assert.equal(rail.pivot, null);
  assert.equal(rail.gap, null);
  const today = positionOf(rail, 'today');
  assert.ok(today > 0 && today < 1, `today is on the line rather than at an end, not ${today}`);
  assert.ok(positionOf(rail, 'consult', TODAY - 40) < today);
  assert.equal(rail.marks.filter((mark) => mark.kind === 'surgery').length, 0);
});

test('a consult on the day of the operation is drawn before it, and today after', () => {
  const rail = procedureRail({ surgeryEpochDay: TODAY, consults: [consult(TODAY)] }, TODAY);
  assert.deepEqual(
    rail.marks.map((mark) => mark.kind),
    ['consult', 'surgery', 'today']
  );
  const [first] = rail.marks;
  for (const mark of rail.marks) assert.equal(mark.position, first.position);
});

test('positions grow with the day, so nothing is ever drawn out of sequence', () => {
  const days = [TODAY - 300, TODAY - 200, TODAY - 100, TODAY - 5, TODAY + 1, TODAY + 40];
  const rail = procedureRail(
    { surgeryEpochDay: TODAY - 100, consults: days.map((day) => consult(day)) },
    TODAY
  );
  const drawn = rail.marks.filter((mark) => mark.kind === 'consult');
  for (let i = 1; i < drawn.length; i++) {
    assert.ok(drawn[i].position >= drawn[i - 1].position, `${drawn[i].epochDay} drawn left of ${drawn[i - 1].epochDay}`);
  }
});
