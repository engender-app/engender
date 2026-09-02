/* Era mutes (phase 6 ticket 05, ADR-0049, CONTEXT: "Resurfacing consent").
   What is asked here is that the area is idempotent both ways and that a
   mute naming a deleted era is left exactly where it is - no error, no
   cleanup job - which is the ticket's own acceptance criterion. Whether a
   day resolves as muted is resurfacingConsent.test.ts's question, over
   these same rows once they are read back as a Set. */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { journalWithBuiltIns } from './test-support.ts';

test('an era starts unmuted', async () => {
  const { journal } = await journalWithBuiltIns();
  const id = await journal.eras.upsertEra({ name: 'before I knew', startEpochDay: null, endEpochDay: 19000 });
  assert.equal((await journal.eraMutes.getMutedEraUuids()).has(id), false);
});

test('muting and unmuting round-trip', async () => {
  const { journal } = await journalWithBuiltIns();
  const id = await journal.eras.upsertEra({ name: 'before I knew', startEpochDay: null, endEpochDay: 19000 });

  await journal.eraMutes.setEraMuted(id, true);
  assert.equal((await journal.eraMutes.getMutedEraUuids()).has(id), true);

  await journal.eraMutes.setEraMuted(id, false);
  assert.equal((await journal.eraMutes.getMutedEraUuids()).has(id), false);
});

test('muting an already-muted era changes nothing observable', async () => {
  const { journal } = await journalWithBuiltIns();
  const id = await journal.eras.upsertEra({ name: 'before I knew', startEpochDay: null, endEpochDay: 19000 });
  await journal.eraMutes.setEraMuted(id, true);
  await journal.eraMutes.setEraMuted(id, true);
  assert.deepEqual(await journal.eraMutes.getMutedEraUuids(), new Set([id]));
});

test('unmuting an era nobody muted is a no-op', async () => {
  const { journal } = await journalWithBuiltIns();
  const id = await journal.eras.upsertEra({ name: 'before I knew', startEpochDay: null, endEpochDay: 19000 });
  await journal.eraMutes.setEraMuted(id, false);
  assert.deepEqual(await journal.eraMutes.getMutedEraUuids(), new Set());
});

test('deleting a muted era leaves the mute in place, with no error and no cleanup job', async () => {
  const { journal } = await journalWithBuiltIns();
  const id = await journal.eras.upsertEra({ name: 'before I knew', startEpochDay: null, endEpochDay: 19000 });
  await journal.eraMutes.setEraMuted(id, true);

  await journal.eras.deleteEra(id);

  assert.deepEqual(await journal.eras.getEras(), []);
  // The row is still here - deleting an era is not this area's job to
  // notice, per ADR-0049 - and resurfacingConsent.ts's touchesMutedEra is
  // what reads it as harmless: a uuid `eras` no longer holds matches
  // nothing.
  assert.equal((await journal.eraMutes.getMutedEraUuids()).has(id), true);
});

test('two eras mute independently of each other', async () => {
  const { journal } = await journalWithBuiltIns();
  const first = await journal.eras.upsertEra({ name: 'before I knew', startEpochDay: null, endEpochDay: 19000 });
  const second = await journal.eras.upsertEra({ name: 'first year', startEpochDay: 19001, endEpochDay: 19365 });

  await journal.eraMutes.setEraMuted(first, true);

  assert.deepEqual(await journal.eraMutes.getMutedEraUuids(), new Set([first]));
  assert.notEqual(first, second);
});
