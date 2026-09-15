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

test('the surgery date is the middle of the rail, whichever side today is on', () => {
  const ahead = procedureRail({ surgeryEpochDay: TODAY + 30, consults: [] }, TODAY);
  const behind = procedureRail({ surgeryEpochDay: TODAY - 30, consults: [] }, TODAY);
  assert.equal(ahead.pivot, 0.5);
  assert.equal(behind.pivot, 0.5);
  assert.equal(positionOf(ahead, 'surgery'), 0.5);
  assert.equal(positionOf(behind, 'surgery'), 0.5);
  assert.ok(positionOf(ahead, 'today') < 0.5, 'a date still ahead puts today behind it');
  assert.ok(positionOf(behind, 'today') > 0.5, 'a date already past puts today ahead of it');
});

test('consults sit behind the date and keep their order', () => {
  const rail = procedureRail(
    { surgeryEpochDay: TODAY - 400, consults: [consult(TODAY - 460), consult(TODAY - 420)] },
    TODAY
  );
  const first = positionOf(rail, 'consult', TODAY - 460);
  const second = positionOf(rail, 'consult', TODAY - 420);
  assert.ok(first < second, 'the older consult is drawn further left');
  assert.ok(second < 0.5, 'both are behind the date');
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
  assert.ok(near.position > 0.4, 'the near consult keeps its room rather than being crushed by the far one');
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
  assert.ok(yesterday > 0, 'the consult is off the left end rather than on it');
  assert.ok(yesterday < 0.5);
});

test('the gap runs between the date and today, on whichever side today is', () => {
  const healing = procedureRail({ surgeryEpochDay: TODAY - 30, consults: [] }, TODAY);
  assert.ok(healing.gap);
  assert.equal(healing.gap.from, 0.5);
  assert.equal(healing.gap.to, positionOf(healing, 'today'));

  const waiting = procedureRail({ surgeryEpochDay: TODAY + 30, consults: [] }, TODAY);
  assert.ok(waiting.gap);
  assert.equal(waiting.gap.from, positionOf(waiting, 'today'));
  assert.equal(waiting.gap.to, 0.5);
});

test('the gap is drawn no further than today, so nothing paces a recovery', () => {
  const rail = procedureRail({ surgeryEpochDay: TODAY - 3, consults: [] }, TODAY);
  assert.ok(rail.gap);
  assert.equal(rail.gap.to, positionOf(rail, 'today'));
  assert.ok(rail.gap.to < 1, 'the stretch travelled is not the whole of the line ahead');
  assert.equal(rail.toEpochDay, TODAY + RAIL_MIN_FORWARD_DAYS - 3);
});

test('with no date there is no pivot and no gap, and today holds the middle', () => {
  const rail = procedureRail({ surgeryEpochDay: null, consults: [consult(TODAY - 40)] }, TODAY);
  assert.equal(rail.pivot, null);
  assert.equal(rail.gap, null);
  assert.equal(positionOf(rail, 'today'), 0.5);
  assert.ok(positionOf(rail, 'consult', TODAY - 40) < 0.5);
  assert.equal(rail.marks.filter((mark) => mark.kind === 'surgery').length, 0);
});

test('a consult on the day of the operation is drawn before it, and today after', () => {
  const rail = procedureRail({ surgeryEpochDay: TODAY, consults: [consult(TODAY)] }, TODAY);
  assert.deepEqual(
    rail.marks.map((mark) => mark.kind),
    ['consult', 'surgery', 'today']
  );
  for (const mark of rail.marks) assert.equal(mark.position, 0.5);
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
