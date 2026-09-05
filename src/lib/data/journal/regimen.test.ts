/* The regimen episode area (phase 4 ticket 01, CONTEXT: "Regimen episode"):
   uuid-only identity, no built-in counterpart, hide-never-delete, and the
   ordering getEpisodes() promises activeEpisodesAt relies on. */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { attributeDose } from '../regimenEpisode.ts';
import { journalWithBuiltIns, UUID_PATTERN } from './test-support.ts';

test('an episode gets a minted uuid id and round-trips every field', async () => {
  const { journal } = await journalWithBuiltIns();
  const id = await journal.regimen.upsertEpisode({
    drug: 'estradiol valerate',
    ester: 'valerate',
    dose: 4,
    doseUnit: 'mg',
    route: 'im',
    interval: 'every 2 weeks',
    startEpochDay: 19000,
    endEpochDay: null,
    endReason: null
  });
  assert.match(id, UUID_PATTERN);

  assert.deepEqual(await journal.regimen.getEpisodes(), [
    {
      id,
      drug: 'estradiol valerate',
      ester: 'valerate',
      dose: 4,
      doseUnit: 'mg',
      route: 'im',
      interval: 'every 2 weeks',
      startEpochDay: 19000,
      endEpochDay: null,
      endReason: null
    }
  ]);
});

test('episodes read back ordered by start day, ties broken by insertion order', async () => {
  const { journal } = await journalWithBuiltIns();
  const later = await journal.regimen.upsertEpisode({
    drug: 'estradiol',
    ester: null,
    dose: 2,
    doseUnit: 'mg',
    route: 'oral',
    interval: 'daily',
    startEpochDay: 200,
    endEpochDay: null,
    endReason: null
  });
  const earlier = await journal.regimen.upsertEpisode({
    drug: 'estradiol',
    ester: null,
    dose: 1,
    doseUnit: 'mg',
    route: 'oral',
    interval: 'daily',
    startEpochDay: 100,
    endEpochDay: null,
    endReason: null
  });

  const ids = (await journal.regimen.getEpisodes()).map((e) => e.id);
  assert.deepEqual(ids, [earlier, later]);
});

test('updating by id changes the row; an unknown id throws', async () => {
  const { journal } = await journalWithBuiltIns();
  const id = await journal.regimen.upsertEpisode({
    drug: 'estradiol',
    ester: null,
    dose: 2,
    doseUnit: 'mg',
    route: 'oral',
    interval: 'daily',
    startEpochDay: 100,
    endEpochDay: null,
    endReason: null
  });

  await journal.regimen.upsertEpisode({
    id,
    drug: 'estradiol',
    ester: null,
    dose: 3,
    doseUnit: 'mg',
    route: 'oral',
    interval: 'daily',
    startEpochDay: 100,
    endEpochDay: null,
    endReason: null
  });
  assert.equal((await journal.regimen.getEpisodes())[0].dose, 3);

  await assert.rejects(
    journal.regimen.upsertEpisode({
      id: 'nope',
      drug: 'x',
      ester: null,
      dose: 1,
      doseUnit: 'mg',
      route: 'oral',
      interval: 'daily',
      startEpochDay: 1,
      endEpochDay: null,
      endReason: null
    }),
    /unknown regimen episode/
  );
});

test('a retroactive correction (a past start date) changes what an existing episode list resolves for a past record', async () => {
  const { journal } = await journalWithBuiltIns();
  const estradiolId = await journal.regimen.upsertEpisode({
    drug: 'estradiol',
    ester: null,
    dose: 2,
    doseUnit: 'mg',
    route: 'oral',
    interval: 'daily',
    startEpochDay: 100,
    endEpochDay: 199,
    endReason: null
  });
  await journal.regimen.upsertEpisode({
    drug: 'estradiol valerate',
    ester: 'valerate',
    dose: 4,
    doseUnit: 'mg',
    route: 'im',
    interval: 'every 2 weeks',
    startEpochDay: 200,
    endEpochDay: null,
    endReason: null
  });

  const dayTs = (day: number) => day * 86400000;
  const record = { drug: null, timestamp: dayTs(150) };

  // A record logged on epoch day 150 resolves to the first episode before
  // the correction.
  const beforeCorrection = await journal.regimen.getEpisodes();
  assert.equal(attributeDose(beforeCorrection, record).episode?.drug, 'estradiol');

  // A corrective episode starting on day 140, added after the fact - the
  // estradiol tablets were a mistaken record and the patch is what was
  // really being used from day 140. Ticket 38 stores an end explicitly
  // rather than inferring one from the next episode's start, so a real
  // correction is two writes now, not one: the new episode, and shortening
  // the one it corrects so the two don't sit concurrently over days that
  // were never really concurrent.
  await journal.regimen.upsertEpisode({
    drug: 'estradiol patch',
    ester: null,
    dose: 100,
    doseUnit: 'mcg',
    route: 'patch',
    interval: 'twice weekly',
    startEpochDay: 140,
    endEpochDay: 199,
    endReason: null
  });
  await journal.regimen.upsertEpisode({
    id: estradiolId,
    drug: 'estradiol',
    ester: null,
    dose: 2,
    doseUnit: 'mg',
    route: 'oral',
    interval: 'daily',
    startEpochDay: 100,
    endEpochDay: 139,
    endReason: null
  });

  const afterCorrection = await journal.regimen.getEpisodes();
  assert.equal(attributeDose(afterCorrection, record).episode?.drug, 'estradiol patch');
});

test('no delete operation exists: episodes are never removed', async () => {
  const { journal } = await journalWithBuiltIns();
  assert.ok(!('deleteEpisode' in journal.regimen), 'no delete operation exists');
});

test('endEpisode sets an explicit end day, independent of any other episode starting; an unknown id throws', async () => {
  const { journal } = await journalWithBuiltIns();
  const id = await journal.regimen.upsertEpisode({
    drug: 'estradiol',
    ester: null,
    dose: 2,
    doseUnit: 'mg',
    route: 'oral',
    interval: 'daily',
    startEpochDay: 100,
    endEpochDay: null,
    endReason: null
  });

  await journal.regimen.endEpisode(id, 150);
  assert.equal((await journal.regimen.getEpisodes())[0].endEpochDay, 150);

  await assert.rejects(journal.regimen.endEpisode('nope', 150), /unknown regimen episode/);
});

/* Ticket 43: one nullable column, set only alongside the end day. */
test('endEpisode can carry a reason, set at the same time as the end day; ending with no reason stays valid', async () => {
  const { journal } = await journalWithBuiltIns();
  const id = await journal.regimen.upsertEpisode({
    drug: 'estradiol',
    ester: null,
    dose: 2,
    doseUnit: 'mg',
    route: 'oral',
    interval: 'daily',
    startEpochDay: 100,
    endEpochDay: null,
    endReason: null
  });

  await journal.regimen.endEpisode(id, 150, 'pausedForNow');
  assert.equal((await journal.regimen.getEpisodes())[0].endReason, 'pausedForNow');

  const secondId = await journal.regimen.upsertEpisode({
    drug: 'spironolactone',
    ester: null,
    dose: 100,
    doseUnit: 'mg',
    route: 'oral',
    interval: 'daily',
    startEpochDay: 200,
    endEpochDay: null,
    endReason: null
  });
  await journal.regimen.endEpisode(secondId, 250);
  const second = (await journal.regimen.getEpisodes()).find((e) => e.id === secondId);
  assert.equal(second?.endReason, null);
});

test('a reason is never assignable while endEpochDay is null, through upsertEpisode or through reopening', async () => {
  const { journal } = await journalWithBuiltIns();
  const id = await journal.regimen.upsertEpisode({
    drug: 'estradiol',
    ester: null,
    dose: 2,
    doseUnit: 'mg',
    route: 'oral',
    interval: 'daily',
    startEpochDay: 100,
    endEpochDay: null,
    // A caller passing a reason with no end day gets it dropped, not stored:
    // meaningless while the episode is still open.
    endReason: 'decidedToStop'
  });
  assert.equal((await journal.regimen.getEpisodes())[0].endReason, null);

  await journal.regimen.endEpisode(id, 150, 'decidedToStop');
  assert.equal((await journal.regimen.getEpisodes())[0].endReason, 'decidedToStop');

  // Reopening (clearing the end day back to null through a straight edit)
  // drops whatever reason the episode carried - a reason with no end day is
  // meaningless, so this is not "editing the reason on its own".
  await journal.regimen.upsertEpisode({
    id,
    drug: 'estradiol',
    ester: null,
    dose: 2,
    doseUnit: 'mg',
    route: 'oral',
    interval: 'daily',
    startEpochDay: 100,
    endEpochDay: null,
    endReason: 'decidedToStop'
  });
  assert.equal((await journal.regimen.getEpisodes())[0].endReason, null);
});

test('a straight edit of an already-ended episode\'s other fields preserves its stored reason', async () => {
  const { journal } = await journalWithBuiltIns();
  const id = await journal.regimen.upsertEpisode({
    drug: 'estradiol',
    ester: null,
    dose: 2,
    doseUnit: 'mg',
    route: 'oral',
    interval: 'daily',
    startEpochDay: 100,
    endEpochDay: null,
    endReason: null
  });
  await journal.regimen.endEpisode(id, 150, 'switchedDrugOrRoute');

  await journal.regimen.upsertEpisode({
    id,
    drug: 'estradiol',
    ester: null,
    dose: 3,
    doseUnit: 'mg',
    route: 'oral',
    interval: 'daily',
    startEpochDay: 100,
    endEpochDay: 150,
    endReason: 'switchedDrugOrRoute'
  });

  assert.equal((await journal.regimen.getEpisodes())[0].endReason, 'switchedDrugOrRoute');
});

test('two episodes for different drugs can both be active on the same day (phase 5 ticket 38)', async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.regimen.upsertEpisode({
    drug: 'estradiol',
    ester: null,
    dose: 2,
    doseUnit: 'mg',
    route: 'oral',
    interval: 'daily',
    startEpochDay: 100,
    endEpochDay: null,
    endReason: null
  });
  await journal.regimen.upsertEpisode({
    drug: 'spironolactone',
    ester: null,
    dose: 100,
    doseUnit: 'mg',
    route: 'oral',
    interval: 'daily',
    startEpochDay: 200,
    endEpochDay: null,
    endReason: null
  });

  const episodes = await journal.regimen.getEpisodes();
  const record = { drug: null, timestamp: 250 * 86400000 };
  // Neither episode ended when the other started - starting spironolactone
  // does not silently end estradiol - so a plain dose with no drug of its
  // own is now genuinely ambiguous between the two.
  assert.deepEqual(
    episodes.map((e) => e.endEpochDay),
    [null, null]
  );
  const attribution = attributeDose(episodes, record);
  assert.equal(attribution.episode, null);
  assert.equal(attribution.ambiguous, true);
});
