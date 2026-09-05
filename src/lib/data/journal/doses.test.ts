/* The dose log area (phase 4 ticket 02, CONTEXT: "Dose event"): what a dose
   carries per route, that it is not an Entry, and that its regimen episode
   is resolved from its timestamp every time rather than stored. */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { attributeDose } from '../regimenEpisode.ts';
import { startOfDayTimestamp } from '../epochDay.ts';
import { journalWithBuiltIns, UUID_PATTERN } from './test-support.ts';
import type { Journal } from './journal.ts';

const at = (epochDay: number, hour = 8) => startOfDayTimestamp(epochDay) + hour * 3600000;

async function episode(journal: Journal, startEpochDay: number, drug: string, endEpochDay: number | null = null) {
  return journal.regimen.upsertEpisode({
    drug,
    ester: null,
    dose: 2,
    doseUnit: 'mg',
    route: 'oral',
    interval: 'daily',
    startEpochDay,
    endEpochDay,
    endReason: null
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
    scheduled: null,
    drug: null
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
    'drug',
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
  const wrongId = await episode(journal, 100, 'estradiol');
  await journal.doses.upsertDose({ timestamp: at(150), route: 'oral', dose: 2, doseUnit: 'mg' });

  const [dose] = await journal.doses.getDoses(150, 150);
  assert.equal(attributeDose(await journal.regimen.getEpisodes(), dose).episode?.drug, 'estradiol');

  // Logged well after the fact: the episode that was really in effect.
  // Correcting the mistaken one's end alongside it is what makes this a
  // real correction rather than two drugs concurrently active (ticket 38) -
  // the person is saying "this one was wrong", not "both were true".
  await journal.regimen.endEpisode(wrongId, 139);
  await episode(journal, 140, 'estradiol valerate');

  assert.equal(attributeDose(await journal.regimen.getEpisodes(), dose).episode?.drug, 'estradiol valerate');
});

test('backdating a dose re-resolves its episode instead of keeping the one it was saved under', async () => {
  const { journal } = await journalWithBuiltIns();
  await episode(journal, 100, 'first', 199);
  await episode(journal, 200, 'second');

  const id = await journal.doses.upsertDose({ timestamp: at(250), route: 'oral', dose: 2, doseUnit: 'mg' });
  const episodes = await journal.regimen.getEpisodes();

  const [saved] = await journal.doses.getDoses(250, 250);
  assert.equal(attributeDose(episodes, saved).episode?.drug, 'second');

  await journal.doses.upsertDose({ id, timestamp: at(150), route: 'oral', dose: 2, doseUnit: 'mg' });

  const [backdated] = await journal.doses.getDoses(150, 150);
  assert.equal(backdated.id, id);
  assert.equal(attributeDose(episodes, backdated).episode?.drug, 'first');
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

  const id = await journal.doses.upsertSchedule({
    episodeId,
    recurrence: { kind: 'everyNDays', everyNDays: 1 },
    dosesPerDay: 2,
    doseAmounts: null
  });
  assert.deepEqual(await journal.doses.getSchedules(), [
    { id, episodeId, recurrence: { kind: 'everyNDays', everyNDays: 1 }, dosesPerDay: 2, doseAmounts: null }
  ]);

  await journal.doses.upsertSchedule({
    episodeId,
    recurrence: { kind: 'everyNDays', everyNDays: 14 },
    dosesPerDay: 1,
    doseAmounts: null
  });
  const schedules = await journal.doses.getSchedules();
  assert.equal(schedules.length, 1, 'one schedule per episode');
  assert.deepEqual(schedules[0].recurrence, { kind: 'everyNDays', everyNDays: 14 });
});

test('a schedule against an unknown episode is refused', async () => {
  const { journal } = await journalWithBuiltIns();
  await assert.rejects(
    journal.doses.upsertSchedule({
      episodeId: 'nope',
      recurrence: { kind: 'everyNDays', everyNDays: 1 },
      dosesPerDay: 1,
      doseAmounts: null
    }),
    /unknown regimen episode/
  );
});

test('a weekday schedule round-trips its weekdays, and switching shape drops the old one\'s', async () => {
  const { journal } = await journalWithBuiltIns();
  const episodeId = await episode(journal, 100, 'estradiol');

  const id = await journal.doses.upsertSchedule({
    episodeId,
    recurrence: { kind: 'weekdays', weekdays: [3, 0] },
    dosesPerDay: 1,
    doseAmounts: null
  });
  const [schedule] = await journal.doses.getSchedules();
  // Read back sorted, not in write order: the set is what matters, not the
  // order it was typed in.
  assert.deepEqual(schedule, {
    id,
    episodeId,
    recurrence: { kind: 'weekdays', weekdays: [0, 3] },
    dosesPerDay: 1,
    doseAmounts: null
  });

  await journal.doses.upsertSchedule({
    episodeId,
    recurrence: { kind: 'everyNDays', everyNDays: 7 },
    dosesPerDay: 1,
    doseAmounts: null
  });
  const [switched] = await journal.doses.getSchedules();
  assert.deepEqual(switched.recurrence, { kind: 'everyNDays', everyNDays: 7 });
});

test('doseAmounts round-trips in cycle order, and is null again once cleared', async () => {
  const { journal } = await journalWithBuiltIns();
  const episodeId = await episode(journal, 100, 'estradiol');

  await journal.doses.upsertSchedule({
    episodeId,
    recurrence: { kind: 'everyNDays', everyNDays: 1 },
    dosesPerDay: 1,
    doseAmounts: [
      { dose: 2, doseUnit: 'mg' },
      { dose: 1, doseUnit: 'mg' }
    ]
  });
  const [withAmounts] = await journal.doses.getSchedules();
  assert.deepEqual(withAmounts.doseAmounts, [
    { dose: 2, doseUnit: 'mg' },
    { dose: 1, doseUnit: 'mg' }
  ]);

  await journal.doses.upsertSchedule({
    episodeId,
    recurrence: { kind: 'everyNDays', everyNDays: 1 },
    dosesPerDay: 1,
    doseAmounts: null
  });
  const [cleared] = await journal.doses.getSchedules();
  assert.equal(cleared.doseAmounts, null);
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

test('a pause can be deleted, and deleting it again changes nothing', async () => {
  const { journal } = await journalWithBuiltIns();
  const episodeId = await episode(journal, 100, 'estradiol');
  const id = await journal.doses.upsertPause({ episodeId, startEpochDay: 110, endEpochDay: 120, reason: 'planned' });

  await journal.doses.deletePause(id);
  assert.deepEqual(await journal.doses.getPauses(), []);
  await journal.doses.deletePause(id); // idempotent
});

test('a dose can be deleted, and deleting it again changes nothing', async () => {
  const { journal } = await journalWithBuiltIns();
  const id = await journal.doses.upsertDose({ timestamp: at(100), route: 'oral', dose: 2, doseUnit: 'mg' });

  await journal.doses.deleteDose(id);
  assert.deepEqual(await journal.doses.getDoses(100, 100), []);
  await journal.doses.deleteDose(id); // idempotent
});

/* The schedule comparison (phase 5 audit-deepening ticket 17). The six-step
   assembly the dose log screen used to do in markup, and which the
   long-journal benchmark used to do a second, drifted way: which episode is
   in effect, its schedule, its pauses, the doses attributed to it, and the
   slots-against-doses comparison over them. */

async function injectableEpisode(journal: Journal, startEpochDay: number, drug: string, endEpochDay: number | null = null) {
  return journal.regimen.upsertEpisode({
    drug,
    ester: null,
    dose: 2,
    doseUnit: 'mg',
    route: 'oral',
    interval: 'daily',
    startEpochDay,
    endEpochDay,
    endReason: null
  });
}

async function takeOral(journal: Journal, epochDay: number, hour = 8) {
  return journal.doses.upsertDose({ timestamp: at(epochDay, hour), route: 'oral', dose: 2, doseUnit: 'mg' });
}

test('the comparison is the active episode’s schedule against the doses attributed to it', async () => {
  const { journal } = await journalWithBuiltIns();
  const episodeId = await injectableEpisode(journal, 19000, 'estradiol');
  await journal.doses.upsertSchedule({
    episodeId,
    recurrence: { kind: 'everyNDays', everyNDays: 1 },
    dosesPerDay: 1,
    doseAmounts: null
  });
  await takeOral(journal, 19001);
  await takeOral(journal, 19002);

  const result = await journal.doses.getComparison({ fromEpochDay: 19000, toEpochDay: 19003 });

  assert.equal(result.reason, null);
  assert.ok(result.reason === null);
  assert.equal(result.activeEpisode.id, episodeId);
  assert.equal(result.schedule.episodeId, episodeId);
  // One slot a day across the whole window, two of them logged.
  assert.equal(result.comparison.rows.length, 4);
  assert.deepEqual(
    result.comparison.rows.map((row) => row.dose !== null),
    [false, true, true, false]
  );
  assert.deepEqual(result.comparison.unmatched, []);
});

test('an earlier episode’s doses are not compared against the active one’s schedule', async () => {
  /* The reason the screen filters through attributeDose rather than by date:
     handing a whole window's doses to one episode's slots puts the earlier
     episode's doses in `unmatched`, where the wording calls them extras. */
  const { journal } = await journalWithBuiltIns();
  await injectableEpisode(journal, 19000, 'estradiol valerate', 19001);
  const currentId = await injectableEpisode(journal, 19002, 'estradiol');
  await journal.doses.upsertSchedule({
    episodeId: currentId,
    recurrence: { kind: 'everyNDays', everyNDays: 1 },
    dosesPerDay: 1,
    doseAmounts: null
  });
  await takeOral(journal, 19000);
  await takeOral(journal, 19003);

  const result = await journal.doses.getComparison({ fromEpochDay: 19000, toEpochDay: 19003 });

  assert.ok(result.reason === null);
  assert.equal(result.activeEpisode.id, currentId);
  // Slots from the episode's own start day, not from the window's edge.
  assert.deepEqual(
    result.comparison.rows.map((row) => row.slot.epochDay),
    [19002, 19003]
  );
  assert.deepEqual(result.comparison.unmatched, []);
});

test('only the active episode’s own pauses suppress its slots', async () => {
  const { journal } = await journalWithBuiltIns();
  const episodeId = await injectableEpisode(journal, 19000, 'estradiol');
  const otherId = await injectableEpisode(journal, 18000, 'testosterone', 18100);
  await journal.doses.upsertSchedule({
    episodeId,
    recurrence: { kind: 'everyNDays', everyNDays: 1 },
    dosesPerDay: 1,
    doseAmounts: null
  });
  await journal.doses.upsertPause({ episodeId, startEpochDay: 19002, endEpochDay: 19003, reason: 'planned' });
  await journal.doses.upsertPause({ episodeId: otherId, startEpochDay: 19000, endEpochDay: null, reason: 'planned' });

  const result = await journal.doses.getComparison({ fromEpochDay: 19000, toEpochDay: 19003 });

  assert.ok(result.reason === null);
  assert.deepEqual(result.pauses.map((pause) => pause.episodeId), [episodeId]);
  assert.deepEqual(
    result.comparison.rows.map((row) => row.slot.epochDay),
    [19000, 19001]
  );
});

test('two episodes in effect on the last day of the range leave nothing to compare', async () => {
  const { journal } = await journalWithBuiltIns();
  const episodeId = await injectableEpisode(journal, 19000, 'estradiol');
  await injectableEpisode(journal, 19000, 'spironolactone');
  await journal.doses.upsertSchedule({
    episodeId,
    recurrence: { kind: 'everyNDays', everyNDays: 1 },
    dosesPerDay: 1,
    doseAmounts: null
  });

  const result = await journal.doses.getComparison({ fromEpochDay: 19000, toEpochDay: 19003 });

  assert.equal(result.reason, 'multipleEpisodes');
});

test('no episode in effect on the last day of the range leaves nothing to compare', async () => {
  const { journal } = await journalWithBuiltIns();
  await injectableEpisode(journal, 19000, 'estradiol', 19001);

  const result = await journal.doses.getComparison({ fromEpochDay: 19000, toEpochDay: 19003 });

  assert.equal(result.reason, 'noEpisode');
});

test('an episode with no schedule says so, and names the episode the notice is about', async () => {
  const { journal } = await journalWithBuiltIns();
  const episodeId = await injectableEpisode(journal, 19000, 'estradiol');

  const result = await journal.doses.getComparison({ fromEpochDay: 19000, toEpochDay: 19003 });

  assert.equal(result.reason, 'noSchedule');
  assert.ok(result.reason === 'noSchedule');
  assert.equal(result.activeEpisode.id, episodeId);
  assert.equal(result.activeEpisode.drug, 'estradiol');
});

test('countConsumingDosesByDrug counts non-skipped doses per drug value in each range', async () => {
  const { journal } = await journalWithBuiltIns();
  await episode(journal, 100, 'estradiol');

  // Two named 'estradiol', one named 'spironolactone', one naming nothing,
  // one skipped and one outside every range.
  await journal.doses.upsertDose({ timestamp: at(100), route: 'oral', dose: 2, doseUnit: 'mg', drug: 'estradiol' });
  await journal.doses.upsertDose({ timestamp: at(105), route: 'oral', dose: 2, doseUnit: 'mg', drug: 'estradiol' });
  await journal.doses.upsertDose({
    timestamp: at(105),
    route: 'oral',
    dose: 1,
    doseUnit: 'mg',
    drug: 'spironolactone'
  });
  await journal.doses.upsertDose({ timestamp: at(107), route: 'oral', dose: 2, doseUnit: 'mg' });
  await journal.doses.upsertDose({
    timestamp: at(106),
    route: 'oral',
    dose: 2,
    doseUnit: 'mg',
    drug: 'estradiol',
    status: 'skipped'
  });
  await journal.doses.upsertDose({ timestamp: at(200), route: 'oral', dose: 2, doseUnit: 'mg', drug: 'estradiol' });

  const counts = await journal.doses.countConsumingDosesByDrug([
    { fromEpochDay: 100, toEpochDay: 104 },
    { fromEpochDay: 105, toEpochDay: 110 }
  ]);

  const byDrug = new Map(counts.map((row) => [row.drug, row.countsByRange]));
  assert.deepEqual(byDrug.get('estradiol'), [1, 1], 'the skipped one is not counted');
  assert.deepEqual(byDrug.get('spironolactone'), [0, 1]);
  assert.deepEqual(byDrug.get(null), [0, 1], 'a dose naming no drug keeps its own key');
  // The dose on day 200 falls in no range and contributes nothing.
  assert.equal(
    counts.reduce((total, row) => total + row.countsByRange.reduce((a, b) => a + b, 0), 0),
    4
  );
});

test('countConsumingDosesByDrug agrees with counting getDoses in JS', async () => {
  const { journal } = await journalWithBuiltIns();
  await episode(journal, 100, 'estradiol');
  for (const day of [100, 101, 103, 108, 109, 130]) {
    await journal.doses.upsertDose({
      timestamp: at(day),
      route: 'oral',
      dose: 2,
      doseUnit: 'mg',
      drug: day % 2 === 0 ? 'estradiol' : null,
      status: day === 103 ? 'skipped' : 'taken'
    });
  }

  const ranges = [
    { fromEpochDay: 100, toEpochDay: 105 },
    { fromEpochDay: 106, toEpochDay: 140 }
  ];
  const counts = await journal.doses.countConsumingDosesByDrug(ranges);

  for (const [index, range] of ranges.entries()) {
    const doses = (await journal.doses.getDoses(range.fromEpochDay, range.toEpochDay)).filter(
      (dose) => dose.status !== 'skipped'
    );
    for (const row of counts) {
      const inJs = doses.filter((dose) => (dose.drug ?? null) === row.drug).length;
      assert.equal(row.countsByRange[index], inJs, `drug ${row.drug} in range ${index}`);
    }
  }
});

test('countConsumingDosesByDrug answers nothing for no ranges, and zeroes for an empty log', async () => {
  const { journal } = await journalWithBuiltIns();
  assert.deepEqual(await journal.doses.countConsumingDosesByDrug([]), []);
  assert.deepEqual(await journal.doses.countConsumingDosesByDrug([{ fromEpochDay: 1, toEpochDay: 9 }]), []);
});

test('countConsumingDosesByDrug refuses overlapping ranges and backwards ones', async () => {
  const { journal } = await journalWithBuiltIns();
  await assert.rejects(
    () =>
      journal.doses.countConsumingDosesByDrug([
        { fromEpochDay: 100, toEpochDay: 110 },
        { fromEpochDay: 105, toEpochDay: 120 }
      ]),
    /ranges overlap at day 105/
  );
  await assert.rejects(
    () => journal.doses.countConsumingDosesByDrug([{ fromEpochDay: 110, toEpochDay: 100 }]),
    /runs backwards/
  );
});
