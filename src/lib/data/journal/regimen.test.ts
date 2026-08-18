/* The regimen episode area (phase 4 ticket 01, CONTEXT: "Regimen episode"):
   uuid-only identity, no built-in counterpart, hide-never-delete, and the
   ordering getEpisodes() promises resolveEpisodeAt relies on. */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { resolveEpisodeAt } from '../regimenEpisode.ts';
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
    startEpochDay: 19000
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
      hidden: false
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
    startEpochDay: 200
  });
  const earlier = await journal.regimen.upsertEpisode({
    drug: 'estradiol',
    ester: null,
    dose: 1,
    doseUnit: 'mg',
    route: 'oral',
    interval: 'daily',
    startEpochDay: 100
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
    startEpochDay: 100
  });

  await journal.regimen.upsertEpisode({
    id,
    drug: 'estradiol',
    ester: null,
    dose: 3,
    doseUnit: 'mg',
    route: 'oral',
    interval: 'daily',
    startEpochDay: 100
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
      startEpochDay: 1
    }),
    /unknown regimen episode/
  );
});

test('a retroactive correction (a past start date) changes what an existing episode list resolves for a past record', async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.regimen.upsertEpisode({
    drug: 'estradiol',
    ester: null,
    dose: 2,
    doseUnit: 'mg',
    route: 'oral',
    interval: 'daily',
    startEpochDay: 100
  });
  await journal.regimen.upsertEpisode({
    drug: 'estradiol valerate',
    ester: 'valerate',
    dose: 4,
    doseUnit: 'mg',
    route: 'im',
    interval: 'every 2 weeks',
    startEpochDay: 200
  });

  const dayTs = (day: number) => day * 86400000;

  // A record logged on epoch day 150 resolves to the first episode before
  // the correction.
  const beforeCorrection = await journal.regimen.getEpisodes();
  assert.equal(resolveEpisodeAt(beforeCorrection, dayTs(150))?.drug, 'estradiol');

  // A corrective episode starting on day 140, added after the fact.
  await journal.regimen.upsertEpisode({
    drug: 'estradiol patch',
    ester: null,
    dose: 100,
    doseUnit: 'mcg',
    route: 'patch',
    interval: 'twice weekly',
    startEpochDay: 140
  });

  const afterCorrection = await journal.regimen.getEpisodes();
  assert.equal(resolveEpisodeAt(afterCorrection, dayTs(150))?.drug, 'estradiol patch');
});

test('hiding an episode preserves it and its identity; an unknown id throws', async () => {
  const { journal } = await journalWithBuiltIns();
  const id = await journal.regimen.upsertEpisode({
    drug: 'estradiol',
    ester: null,
    dose: 2,
    doseUnit: 'mg',
    route: 'oral',
    interval: 'daily',
    startEpochDay: 100
  });

  await journal.regimen.setEpisodeHidden(id, true);

  const episodes = await journal.regimen.getEpisodes();
  assert.equal(episodes.length, 1);
  assert.equal(episodes[0].id, id);
  assert.equal(episodes[0].hidden, true);

  await journal.regimen.setEpisodeHidden(id, false);
  assert.equal((await journal.regimen.getEpisodes())[0].hidden, false);

  await assert.rejects(journal.regimen.setEpisodeHidden('nope', true), /unknown regimen episode/);
});

test('no delete operation exists: episodes hide, they never delete', async () => {
  const { journal } = await journalWithBuiltIns();
  assert.ok(!('deleteEpisode' in journal.regimen), 'no delete operation exists');
});
