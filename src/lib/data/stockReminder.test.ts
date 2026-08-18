import { test } from 'vitest';
import assert from 'node:assert/strict';
import { reconcileStockReminder } from './stockReminder';
import { RUN_OUT_LEAD_DAYS, type StockProjection } from './stockProjection';

const TODAY = 20000;

function projection(runOutEpochDay: number | null): StockProjection {
  return { remaining: 3, dailyRate: 1, runOutEpochDay };
}

test('a fresh projection with no reminder yet creates one dated RUN_OUT_LEAD_DAYS before run-out', () => {
  const action = reconcileStockReminder(
    { everCreated: false, dismissed: false },
    projection(TODAY + 40),
    null,
    TODAY
  );
  assert.deepEqual(action, { kind: 'create', epochDay: TODAY + 40 - RUN_OUT_LEAD_DAYS });
});

test('a projected run-out already inside the lead window creates one dated today, not in the past', () => {
  const action = reconcileStockReminder({ everCreated: false, dismissed: false }, projection(TODAY + 2), null, TODAY);
  assert.deepEqual(action, { kind: 'create', epochDay: TODAY });
});

test('a projected run-out already today or earlier fires at asOfEpochDay too', () => {
  const action = reconcileStockReminder({ everCreated: false, dismissed: false }, projection(TODAY - 1), null, TODAY);
  assert.deepEqual(action, { kind: 'create', epochDay: TODAY });
});

test('a moved projection updates an existing reminder to the new lead day', () => {
  const action = reconcileStockReminder(
    { everCreated: true, dismissed: false },
    projection(TODAY + 40),
    { id: 'rem-1', epochDay: TODAY + 10 },
    TODAY
  );
  assert.deepEqual(action, { kind: 'update', reminderId: 'rem-1', epochDay: TODAY + 40 - RUN_OUT_LEAD_DAYS });
});

test('an unchanged projection leaves a matching existing reminder alone', () => {
  const epochDay = TODAY + 40 - RUN_OUT_LEAD_DAYS;
  const action = reconcileStockReminder(
    { everCreated: true, dismissed: false },
    projection(TODAY + 40),
    { id: 'rem-1', epochDay },
    TODAY
  );
  assert.deepEqual(action, { kind: 'none' });
});

test('a projection moving further out still updates in place - it is not cleared just for moving later', () => {
  const action = reconcileStockReminder(
    { everCreated: true, dismissed: false },
    projection(TODAY + 400),
    { id: 'rem-1', epochDay: TODAY + 10 },
    TODAY
  );
  assert.deepEqual(action, { kind: 'update', reminderId: 'rem-1', epochDay: TODAY + 400 - RUN_OUT_LEAD_DAYS });
});

test('no projection at all (nothing to run out from) clears an existing reminder rather than leaving it stale', () => {
  const action = reconcileStockReminder(
    { everCreated: true, dismissed: false },
    projection(null),
    { id: 'rem-1', epochDay: TODAY + 1 },
    TODAY
  );
  assert.deepEqual(action, { kind: 'clear', reminderId: 'rem-1' });
});

test('no projection and no existing reminder does nothing', () => {
  const action = reconcileStockReminder({ everCreated: false, dismissed: false }, projection(null), null, TODAY);
  assert.deepEqual(action, { kind: 'none' });
});

test('a reminder that was created before and is now missing is treated as a person taking it over, not recreated', () => {
  const action = reconcileStockReminder(
    { everCreated: true, dismissed: false },
    projection(TODAY + 1),
    null,
    TODAY
  );
  assert.deepEqual(action, { kind: 'mark-dismissed' });
});

test('a dismissed drug is left alone regardless of how the projection moves', () => {
  const stillCreatable = reconcileStockReminder({ everCreated: true, dismissed: true }, projection(TODAY + 1), null, TODAY);
  const stillUpdatable = reconcileStockReminder(
    { everCreated: true, dismissed: true },
    projection(TODAY + 200),
    { id: 'rem-1', epochDay: TODAY + 1 },
    TODAY
  );
  assert.deepEqual(stillCreatable, { kind: 'none' });
  assert.deepEqual(stillUpdatable, { kind: 'none' });
});
