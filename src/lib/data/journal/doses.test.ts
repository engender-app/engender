/* The dose log area (phase 4 ticket 02, CONTEXT: "Dose event"): what a dose
   carries per route, that it is not an Entry, and that its regimen episode
   is resolved from its timestamp every time rather than stored. */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { resolveEpisodeAt } from '../regimenEpisode.ts';
import { startOfDayTimestamp } from '../epochDay.ts';
import { journalWithBuiltIns, UUID_PATTERN } from './test-support.ts';
import type { Journal } from './journal.ts';

const at = (epochDay: number, hour = 8) => startOfDayTimestamp(epochDay) + hour * 3600000;

async function episode(journal: Journal, startEpochDay: number, drug: string) {
  return journal.regimen.upsertEpisode({
    drug,
    ester: null,
    dose: 2,
    doseUnit: 'mg',
    route: 'oral',
    interval: 'daily',
    startEpochDay
  });
}

test('an injection carries a site and a vehicle, and round-trips both', async () => {
  const { journal } = await journalWithBuiltIns();
  const id = await journal.doses.upsertDose({
    timestamp: at(19000, 9),
    route: 'im',
    dose: 4,
    doseUnit: 'mg',
    injectionSite: 'ventrogluteal-left',
    vehicle: 'oil'
  });
  assert.match(id, UUID_PATTERN);

  const [dose] = await journal.doses.getDoses(19000, 19000);
  assert.deepEqual(dose, {
    id,
    timestamp: at(19000, 9),
    route: 'im',
    dose: 4,
    doseUnit: 'mg',
    injectionSite: 'ventrogluteal-left',
    vehicle: 'oil',
    status: 'taken',
    scheduled: null
  });
});

test('a patch carries an application site and no vehicle', async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.doses.upsertDose({
    timestamp: at(19000),
    route: 'patch',
    dose: 100,
    doseUnit: 'mcg',
    applicationSite: 'abdomen'
  });

  const [dose] = await journal.doses.getDoses(19000, 19000);
  assert.deepEqual(Object.keys(dose).sort(), [
    'applicationSite',
    'dose',
    'doseUnit',
    'id',
    'route',
    'scheduled',
    'status',
    'timestamp'
  ]);
});

test('an oral dose has no site or vehicle field at all, not a null one', async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.doses.upsertDose({
    timestamp: at(19000, 7),
    route: 'oral',
    dose: 2,
    doseUnit: 'mg'
  });

  const [dose] = await journal.doses.getDoses(19000, 19000);
  assert.ok(!('injectionSite' in dose));
  assert.ok(!('vehicle' in dose));
  assert.ok(!('applicationSite' in dose));
});

test('a dose event carries no mood, dimension values, tags or note, and writes no entry row', async () => {
  const { journal, db } = await journalWithBuiltIns();
  await journal.doses.upsertDose({ timestamp: at(19000), route: 'sublingual', dose: 2, doseUnit: 'mg' });

  const [dose] = await journal.doses.getDoses(19000, 19000);
  for (const field of ['mood', 'note', 'tags', 'dimensionValues']) {
    assert.ok(!(field in dose), `a dose event must not carry ${field}`);
  }

  const entries = await db.query<{ n: number }>('SELECT COUNT(*) AS n FROM entry');
  assert.equal(entries[0].n, 0, 'a dose is its own record type, not an Entry');
});

test('a dose keeps a real time of day, not just the day it fell on', async () => {
  const { journal } = await journalWithBuiltIns();
  const timestamp = at(19000, 14) + 37 * 60000;
  await journal.doses.upsertDose({ timestamp, route: 'sublingual', dose: 2, doseUnit: 'mg' });

  const [dose] = await journal.doses.getDoses(19000, 19000);
  assert.equal(dose.timestamp, timestamp);
});

test('doses read back oldest first, and the range is inclusive of both days', async () => {
  const { journal } = await journalWithBuiltIns();
  const later = await journal.doses.upsertDose({ timestamp: at(102), route: 'oral', dose: 2, doseUnit: 'mg' });
  const earlier = await journal.doses.upsertDose({ timestamp: at(100), route: 'oral', dose: 2, doseUnit: 'mg' });
  await journal.doses.upsertDose({ timestamp: at(103), route: 'oral', dose: 2, doseUnit: 'mg' });

  const ids = (await journal.doses.getDoses(100, 102)).map((d) => d.id);
  assert.deepEqual(ids, [earlier, later]);
});

test('a dose can be taken, skipped or changed; a changed one keeps the scheduled value beside the actual', async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.doses.upsertDose({ timestamp: at(100), route: 'oral', dose: 2, doseUnit: 'mg', status: 'skipped' });
  await journal.doses.upsertDose({
    timestamp: at(101, 20),
    route: 'sublingual',
    dose: 1,
    doseUnit: 'mg',
    status: 'changed',
    scheduled: { dose: 2, route: 'oral', timestamp: at(101, 8) }
  });

  const [skipped, changed] = await journal.doses.getDoses(100, 101);
  assert.equal(skipped.status, 'skipped');
  assert.equal(skipped.scheduled, null);

  assert.equal(changed.status, 'changed');
  assert.equal(changed.dose, 1);
  assert.equal(changed.route, 'sublingual');
  assert.deepEqual(changed.scheduled, { dose: 2, route: 'oral', timestamp: at(101, 8) });
});

test('a dose stores no regimen episode: attribution comes from its timestamp every time', async () => {
  const { journal, db } = await journalWithBuiltIns();
  await episode(journal, 100, 'estradiol');
  await journal.doses.upsertDose({ timestamp: at(150), route: 'oral', dose: 2, doseUnit: 'mg' });

  const columns = await db.query<{ name: string }>('SELECT name FROM pragma_table_info(?)', ['dose_event']);
  const names = columns.map((c) => c.name);
  assert.ok(
    !names.some((name) => name.includes('episode')),
    `dose_event must not link to an episode, got: ${names.join(', ')}`
  );
});

test('a corrective episode with a past start date changes which episode an already-logged dose resolves to', async () => {
  const { journal } = await journalWithBuiltIns();
  await episode(journal, 100, 'estradiol');
  await journal.doses.upsertDose({ timestamp: at(150), route: 'oral', dose: 2, doseUnit: 'mg' });

  const [dose] = await journal.doses.getDoses(150, 150);
  assert.equal(resolveEpisodeAt(await journal.regimen.getEpisodes(), dose.timestamp)?.drug, 'estradiol');

  // Logged well after the fact: the episode that was really in effect.
  await episode(journal, 140, 'estradiol valerate');

  assert.equal(resolveEpisodeAt(await journal.regimen.getEpisodes(), dose.timestamp)?.drug, 'estradiol valerate');
});

test('backdating a dose re-resolves its episode instead of keeping the one it was saved under', async () => {
  const { journal } = await journalWithBuiltIns();
  await episode(journal, 100, 'first');
  await episode(journal, 200, 'second');

  const id = await journal.doses.upsertDose({ timestamp: at(250), route: 'oral', dose: 2, doseUnit: 'mg' });
  const episodes = await journal.regimen.getEpisodes();

  const [saved] = await journal.doses.getDoses(250, 250);
  assert.equal(resolveEpisodeAt(episodes, saved.timestamp)?.drug, 'second');

  await journal.doses.upsertDose({ id, timestamp: at(150), route: 'oral', dose: 2, doseUnit: 'mg' });

  const [backdated] = await journal.doses.getDoses(150, 150);
  assert.equal(backdated.id, id);
  assert.equal(resolveEpisodeAt(episodes, backdated.timestamp)?.drug, 'first');
  assert.deepEqual(await journal.doses.getDoses(250, 250), []);
});

test('changing a dose from injection to oral drops the site and vehicle it no longer has', async () => {
  const { journal } = await journalWithBuiltIns();
  const id = await journal.doses.upsertDose({
    timestamp: at(100),
    route: 'sc',
    dose: 4,
    doseUnit: 'mg',
    injectionSite: 'abdomen-left',
    vehicle: 'aqueous'
  });

  await journal.doses.upsertDose({ id, timestamp: at(100), route: 'oral', dose: 2, doseUnit: 'mg' });

  const [dose] = await journal.doses.getDoses(100, 100);
  assert.equal(dose.route, 'oral');
  assert.ok(!('injectionSite' in dose));
  assert.ok(!('vehicle' in dose));
});

test('an injection row with no vehicle reads back as unknown, not as oil', async () => {
  const { journal, db } = await journalWithBuiltIns();
  // The shape an archive from another build could carry: route says injection,
  // the vehicle column says nothing.
  await db.run(
    `INSERT INTO dose_event (uuid, timestamp, route, dose, dose_unit, status, updated_at)
     VALUES ('imported', ?, 'im', 4, 'mg', 'taken', 0)`,
    [at(100)]
  );

  const [dose] = await journal.doses.getDoses(100, 100);
  assert.equal(dose.route, 'im');
  assert.equal(dose.route === 'im' ? dose.vehicle : 'set', null, 'a missing vehicle must not become oil');
  assert.equal(dose.route === 'im' ? dose.injectionSite : 'set', null);
});

test('updating or deleting an unknown dose id throws rather than silently doing nothing', async () => {
  const { journal } = await journalWithBuiltIns();
  await assert.rejects(
    journal.doses.upsertDose({ id: 'nope', timestamp: at(100), route: 'oral', dose: 2, doseUnit: 'mg' }),
    /unknown dose event/
  );
});

test('no schedule delete exists: an episode\'s rhythm is edited, and a pause is what suppresses it', async () => {
  const { journal } = await journalWithBuiltIns();
  assert.ok(!('deleteSchedule' in journal.doses), 'no schedule delete operation exists');
});

test('a schedule belongs to an episode, one per episode, and an update replaces it', async () => {
  const { journal } = await journalWithBuiltIns();
  const episodeId = await episode(journal, 100, 'estradiol');

  const id = await journal.doses.upsertSchedule({ episodeId, everyNDays: 1, dosesPerDay: 2 });
  assert.deepEqual(await journal.doses.getSchedules(), [{ id, episodeId, everyNDays: 1, dosesPerDay: 2 }]);

  await journal.doses.upsertSchedule({ episodeId, everyNDays: 14, dosesPerDay: 1 });
  const schedules = await journal.doses.getSchedules();
  assert.equal(schedules.length, 1, 'one schedule per episode');
  assert.equal(schedules[0].everyNDays, 14);
});

test('a schedule against an unknown episode is refused', async () => {
  const { journal } = await journalWithBuiltIns();
  await assert.rejects(
    journal.doses.upsertSchedule({ episodeId: 'nope', everyNDays: 1, dosesPerDay: 1 }),
    /unknown regimen episode/
  );
});

test('a pause is a dated range on an episode with a planned or accidental reason', async () => {
  const { journal } = await journalWithBuiltIns();
  const episodeId = await episode(journal, 100, 'estradiol');

  const planned = await journal.doses.upsertPause({
    episodeId,
    startEpochDay: 110,
    endEpochDay: 120,
    reason: 'planned'
  });
  const running = await journal.doses.upsertPause({
    episodeId,
    startEpochDay: 200,
    endEpochDay: null,
    reason: 'accidental'
  });

  assert.deepEqual(await journal.doses.getPauses(), [
    { id: planned, episodeId, startEpochDay: 110, endEpochDay: 120, reason: 'planned' },
    { id: running, episodeId, startEpochDay: 200, endEpochDay: null, reason: 'accidental' }
  ]);
});

test('a pause can be deleted, and deleting an unknown one throws', async () => {
  const { journal } = await journalWithBuiltIns();
  const episodeId = await episode(journal, 100, 'estradiol');
  const id = await journal.doses.upsertPause({ episodeId, startEpochDay: 110, endEpochDay: 120, reason: 'planned' });

  await journal.doses.deletePause(id);
  assert.deepEqual(await journal.doses.getPauses(), []);
  await assert.rejects(journal.doses.deletePause(id), /unknown dose pause/);
});

test('a dose can be deleted', async () => {
  const { journal } = await journalWithBuiltIns();
  const id = await journal.doses.upsertDose({ timestamp: at(100), route: 'oral', dose: 2, doseUnit: 'mg' });

  await journal.doses.deleteDose(id);
  assert.deepEqual(await journal.doses.getDoses(100, 100), []);
  await assert.rejects(journal.doses.deleteDose(id), /unknown dose event/);
});
