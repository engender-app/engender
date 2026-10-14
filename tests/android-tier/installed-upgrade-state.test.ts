import { expect, test } from 'vitest';
import { alarmState, assertFilledState, assertUpgradeState, compareUpgradeState } from './installed-upgrade-state.mjs';

const state = () => ({ userVersion: 88, counts: { entry: 3, measurement: 2, milestone: 2, roadmap_check: 1 },
  linkedMilestones: 1,
  entryUuids: ['first', 'second', 'third'],
  mediaSha256: { 'photo.enc': '1234' }, integrity: [{ integrity_check: 'ok' }], foreignKeys: [],
  alarms: [{ when: 1791914400000, tag: 'reminder', detail: 'type=RTC_WAKEUP window=0' }] });

test('healthy upgrade permits only the declared schema version change', () => {
  const before = state(); const after = { ...state(), userVersion: 89 };
  expect(assertUpgradeState(before, after, 89).differences).toEqual([]);
  expect(compareUpgradeState(before, after, 88).differences).toEqual(['user_version']);
});

test('row-deleting control fails even when integrity and foreign keys pass', () => {
  const before = state(); const after = state(); after.counts.measurement--;
  expect(() => assertUpgradeState(before, after, 88)).toThrow('rows:measurement');
});

test('same-count reseeding fails the preserved journal identity check', () => {
  const before = state();
  expect(compareUpgradeState(before, { ...before, entryUuids: ['new-first', 'new-second', 'new-third'] }, 88).differences).toEqual(['entry_uuids']);
});

test('media additions, removals and changed checksums fail', () => {
  const before = state();
  const variants: Record<string, string>[] = [{}, { 'photo.enc': 'different' }, { ...before.mediaSha256, 'extra.enc': 'abcd' }];
  for (const mediaSha256 of variants) {
    expect(compareUpgradeState(before, { ...before, mediaSha256 }, 88).differences.some((name: string) => name.startsWith('media:'))).toBe(true);
  }
});

test('integrity, foreign keys and alarm changes fail independently of row counts', () => {
  const before = state();
  expect(compareUpgradeState(before, { ...before, integrity: [{ integrity_check: 'damaged' }] }, 88).differences).toEqual(['integrity']);
  expect(compareUpgradeState(before, { ...before, foreignKeys: [{ table: 'roadmap_check' }] }, 88).differences).toEqual(['foreign_keys']);
  expect(compareUpgradeState(before, { ...before, alarms: [] }, 88).differences).toEqual(['alarms']);
});

test('empty or already migrated baselines cannot pass upgrade proof', () => {
  assertFilledState(state());
  for (const change of [{ userVersion: 89 }, { counts: {} }, { linkedMilestones: 0 }, { mediaSha256: {} }, { alarms: [] }]) {
    expect(() => assertFilledState({ ...state(), ...change })).toThrow('filled schema-88');
  }
});

test('alarm comparison ignores object IDs and batch positions but preserves due time and mode', () => {
  const alarm = (position: number, id: string, when = '1791914400000') => `RTC_WAKEUP #${position}: Alarm{${id} type 0 origWhen ${when} whenElapsed 123 dev.engender.app.test.upgrade40}\n tag=*walarm*:dev.engender.app.REMINDER\n type=RTC_WAKEUP origWhen=2026-10-13 20:00:00.000 window=0 flags=0x5`;
  expect(alarmState(alarm(1, 'abc'), 'dev.engender.app.test.upgrade40')).toEqual(alarmState(alarm(9, 'def'), 'dev.engender.app.test.upgrade40'));
  expect(alarmState(alarm(1, 'abc', '1791914400001'), 'dev.engender.app.test.upgrade40')).not.toEqual(alarmState(alarm(1, 'abc'), 'dev.engender.app.test.upgrade40'));
  expect(alarmState(alarm(1, 'abc'), 'dev.engender.app')).toEqual([]);
  expect(() => alarmState(alarm(1, 'abc').split('\n')[0], 'dev.engender.app.test.upgrade40')).toThrow('Incomplete');
});
