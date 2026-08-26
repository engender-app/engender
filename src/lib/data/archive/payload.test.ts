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

/* Ticket 35's step: an archive written when the active preset was a preset
   key carries that key, and the preference it lands in is now a list of
   dimension keys. The archive's own preset rows are what translate it, so a
   custom preset restores as faithfully as a built-in one. */

const v1Archive = (activePreset: string, presets: { id: string; dims: string[] }[]): ArchivePayload =>
  ({
    journal: { presets: presets.map((p) => ({ ...p, name: '', builtIn: true })) },
    preferences: { name: 'Ola', activePreset },
    files: []
  }) as unknown as ArchivePayload;

const scalesOf = (p: ArchivePayload) => (p.preferences as { activeScales?: string[] }).activeScales;

test('a v1 archive restores to the scales its preset stood for', () => {
  const migrated = migratePayload(v1Archive('p-nb', [{ id: 'p-nb', dims: ['euphoria_dysphoria', 'binary_nonbinary'] }]), 1);

  assert.deepEqual(scalesOf(migrated), ['euphoria_dysphoria', 'binary_nonbinary']);
  // The old key does not survive alongside the list it became: two answers to
  // one question is what this ticket removed.
  assert.equal((migrated.preferences as { activePreset?: string }).activePreset, undefined);
  assert.equal(migrated.preferences.name, 'Ola');
});

test('a v1 archive whose active preset was a custom one restores that custom list', () => {
  const migrated = migratePayload(
    v1Archive('custom-1', [
      { id: 'p-nb', dims: ['euphoria_dysphoria'] },
      { id: 'custom-1', dims: ['euphoria_dysphoria', 'femininity', 'my_own_scale'] }
    ]),
    1
  );

  assert.deepEqual(scalesOf(migrated), ['euphoria_dysphoria', 'femininity', 'my_own_scale']);
});

test('a v1 archive naming a built-in preset it did not carry falls back to what that key always meant', () => {
  // A hand-edited or partial file. The eight built-in presets are a fixed
  // translation table long after they stop being a picker, which is the
  // reason BUILT_IN_PRESETS outlives the eight cards.
  const migrated = migratePayload(v1Archive('p-agender', []), 1);

  assert.deepEqual(scalesOf(migrated), ['euphoria_dysphoria', 'agender_gendered']);
});

test('a v1 archive naming a preset nobody has ever had restores the default scales', () => {
  const migrated = migratePayload(v1Archive('p-invented', []), 1);

  assert.deepEqual(scalesOf(migrated), PREFERENCE_DEFAULTS.activeScales);
});

test('a v1 archive that never carried a preset at all is left saying nothing about scales', () => {
  const bare = { journal: { presets: [] }, preferences: { name: 'Ola' }, files: [] } as unknown as ArchivePayload;

  // Not filled in with the default: applyPortablePreferences keeps this
  // device's value for a key the archive is missing, and inventing one here
  // would turn "the file does not say" into "the file says the default".
  assert.equal(scalesOf(migratePayload(bare, 1)), undefined);
});
