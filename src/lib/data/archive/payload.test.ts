import assert from 'node:assert/strict';
import { test } from 'vitest';
import { PREFERENCE_DEFAULTS, PORTABLE_KEYS } from '../prefs/catalogue.ts';
import { ARCHIVE_FORMAT_VERSION } from './container.ts';
import { PAYLOAD_MIGRATIONS, applyMigrations, migratePayload, portablePreferences, type ArchivePayload } from './payload.ts';

const payload = (name: string): ArchivePayload =>
  ({ journal: { entries: [] }, preferences: { name } }) as unknown as ArchivePayload;

test('portable preferences are exactly the allowlist, whatever else is set', () => {
  const portable = portablePreferences({ ...PREFERENCE_DEFAULTS, name: 'Alicja', pinHash: 'secret' });

  assert.deepEqual(Object.keys(portable).sort(), [...PORTABLE_KEYS].sort());
  assert.equal(portable.name, 'Alicja');
});

test('an archive at the current version is not migrated', () => {
  const current = payload('as written');

  assert.equal(migratePayload(current, ARCHIVE_FORMAT_VERSION), current);
});

test('the ladder walks one version at a time', () => {
  const steps = [
    (p: ArchivePayload) => payload(`${p.preferences.name}, then v2`),
    (p: ArchivePayload) => payload(`${p.preferences.name}, then v3`)
  ];

  const migrated = applyMigrations(payload('v1'), 1, 3, steps);

  assert.equal(migrated.preferences.name, 'v1, then v2, then v3');
});

test('a version with no step to leave it fails loudly rather than importing as it is', () => {
  assert.throws(() => applyMigrations(payload('v1'), 1, 3, []), /no migration from archive format version 1/);
});

test('the shipped ladder covers every version below the current one', () => {
  assert.equal(PAYLOAD_MIGRATIONS.length, ARCHIVE_FORMAT_VERSION - 1);
});
