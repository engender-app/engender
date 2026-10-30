import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { alarmState, assertFilledState, assertUpgradeState, compareUpgradeState, droppedTables } from './installed-upgrade-state.mjs';

const sqlite = (file: string) => readFileSync(new URL(`../../src/lib/data/sqlite/${file}`, import.meta.url), 'utf8');
/* The tables later migrations drop, read from the migration sources the way the
   upgrade command reads them, never copied here. */
const dropped = () => droppedTables(sqlite('migrations.ts'), 88, [sqlite('closed-lists-migration.ts'), sqlite('waitlist-migration.ts')]);

const state = () => ({ userVersion: 88, counts: { entry: 3, side_effect: 2, milestone: 2, roadmap_check: 1 },
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
  const before = state(); const after = state(); after.counts.side_effect--;
  expect(() => assertUpgradeState(before, after, 88)).toThrow('rows:side_effect');
});

test('tables the migrations drop are read from the migration sources', () => {
  const names = dropped();
  for (const table of ['measurement', 'measurement_type', 'size_record', 'affirmation', 'revisit', 'roadmap_track',
    'journaling_pause', 'word_frequency_ignore', 'saved_question', 'felt_sense', 'hair_stage']) expect(names.has(table), table).toBe(true);
  for (const table of ['entry', 'milestone', 'side_effect', 'roadmap_check']) expect(names.has(table), table).toBe(false);
});

test('a healthy upgrade may lose the tables its migrations drop, and only those', () => {
  const before = { ...state(), counts: { ...state().counts, measurement: 2, affirmation: 14, roadmap_track: 3 } };
  const after = { ...state(), userVersion: 111 };
  expect(compareUpgradeState(before, after, 111).differences).toContain('rows:measurement');
  expect(assertUpgradeState(before, after, 111, dropped()).differences).toEqual([]);
  const lost = { ...after, counts: { entry: 3, side_effect: 2, roadmap_check: 1 } };
  expect(() => assertUpgradeState(before, lost, 111, dropped())).toThrow('rows:milestone');
});

test('a dropped table that still exists after the upgrade is still compared', () => {
  const before = { ...state(), counts: { ...state().counts, reminder: 4 } };
  const after = { ...state(), userVersion: 111, counts: { ...state().counts, reminder: 3 } };
  expect(dropped().has('reminder')).toBe(true);
  expect(() => assertUpgradeState(before, after, 111, dropped())).toThrow('rows:reminder');
});

test('same-count reseeding fails the preserved journal identity check', () => {
  const before = state();
  expect(compareUpgradeState(before, { ...before, entryUuids: ['new-first', 'new-second', 'new-third'] }, 88).differences).toEqual(['entry_uuids']);
});

test('detaching milestone photos fails even when counts and media are preserved', () => {
  const before = state();
  const after = { ...state(), linkedMilestones: 0 };
  expect(compareUpgradeState(before, after, 88).differences).toEqual(['linked_milestones']);
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
  for (const change of [{ userVersion: 89 }, { counts: {} }, { counts: { entry: 3, milestone: 2, roadmap_check: 1 } as Record<string, number> }, { linkedMilestones: 0 }, { mediaSha256: {} }, { alarms: [] }]) {
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
