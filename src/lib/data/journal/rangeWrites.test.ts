import { test } from 'vitest';
import assert from 'node:assert/strict';
import { journalWithBuiltIns } from './test-support.ts';

type Journal = Awaited<ReturnType<typeof journalWithBuiltIns>>['journal'];
type RangeInput = { id?: string; startEpochDay: number; endEpochDay: number | null };
const episode = {
  drug: 'estradiol', ester: null, dose: 2, doseUnit: 'mg', route: 'oral',
  interval: 'daily', startEpochDay: 100, endEpochDay: null, endReason: null
};

const areas = {
  regimen: async (journal: Journal) => ({
    save: (range: RangeInput) => journal.regimen.upsertEpisode({ ...episode, ...range }),
    read: () => journal.regimen.getEpisodes(), table: 'regimen_episode'
  }),
  dosePause: async (journal: Journal) => {
    const episodeId = await journal.regimen.upsertEpisode(episode);
    return {
      save: (range: RangeInput) => journal.doses.upsertPause({ episodeId, reason: 'planned', ...range }),
      read: () => journal.doses.getPauses(), table: 'dose_pause'
    };
  },
  tryout: async (journal: Journal) => ({
    save: (range: RangeInput) => journal.tryouts.upsertTryout({ kind: 'name', label: 'Alex', ...range }),
    read: () => journal.tryouts.getTryouts(), table: 'tryout'
  })
};

for (const [name, makeArea] of Object.entries(areas)) {
  test(`${name} refuses inverted inserts and updates without changing stored rows`, async () => {
    const { journal } = await journalWithBuiltIns();
    const area = await makeArea(journal);
    await assert.rejects(area.save({ startEpochDay: 100, endEpochDay: 99 }), /ends before it starts/);
    assert.deepEqual(await area.read(), []);
    const id = await area.save({ startEpochDay: 100, endEpochDay: 110 });
    const before = await area.read();
    await assert.rejects(area.save({ id, startEpochDay: 111, endEpochDay: 110 }), /ends before it starts/);
    assert.deepEqual(await area.read(), before);
  });

  test(`${name} preserves equal and open end bounds on insert and update`, async () => {
    const { journal } = await journalWithBuiltIns();
    const area = await makeArea(journal);
    for (const endEpochDay of [100, null]) {
      const id = await area.save({ startEpochDay: 100, endEpochDay });
      assert.equal((await area.read()).find((row) => row.id === id)?.endEpochDay, endEpochDay);
      const updatedEnd = endEpochDay === null ? 101 : null;
      await area.save({ id, startEpochDay: 101, endEpochDay: updatedEnd });
      const row = (await area.read()).find((row) => row.id === id)!;
      assert.equal(row.startEpochDay, 101);
      assert.equal(row.endEpochDay, updatedEnd);
    }
  });

  test(`${name} reads existing inverted records without rewriting them`, async () => {
    const { journal, db } = await journalWithBuiltIns();
    const area = await makeArea(journal);
    const id = await area.save({ startEpochDay: 100, endEpochDay: null });
    await db.run(`UPDATE ${area.table} SET end_epoch_day = 99 WHERE uuid = ?`, [id]);
    const before = await db.query(`SELECT * FROM ${area.table} WHERE uuid = ?`, [id]);
    const row = (await area.read()).find((row) => row.id === id)!;
    assert.equal(row.startEpochDay, 100);
    assert.equal(row.endEpochDay, 99);
    assert.deepEqual(await db.query(`SELECT * FROM ${area.table} WHERE uuid = ?`, [id]), before);
  });
}

test('ending an episode refuses a day before its stored start and accepts the same day', async () => {
  const { journal } = await journalWithBuiltIns();
  const id = await journal.regimen.upsertEpisode(episode);
  await assert.rejects(journal.regimen.endEpisode(id, 99, 'decidedToStop'), /ends before it starts/);
  assert.equal((await journal.regimen.getEpisodes())[0].endEpochDay, null);
  assert.equal((await journal.regimen.getEpisodes())[0].endReason, null);
  await journal.regimen.endEpisode(id, 100, 'decidedToStop');
  assert.equal((await journal.regimen.getEpisodes())[0].endEpochDay, 100);
});

test('adopting a tryout refuses an earlier end before creating a milestone', async () => {
  const { journal } = await journalWithBuiltIns();
  const id = await journal.tryouts.upsertTryout({ kind: 'name', label: 'Alex', startEpochDay: 100, endEpochDay: null });
  await assert.rejects(journal.tryouts.adoptTryout(id, { endEpochDay: 99, createMilestone: true }), /ends before it starts/);
  assert.equal((await journal.tryouts.getTryouts())[0].endEpochDay, null);
  assert.deepEqual(await journal.milestones.getMilestones(), []);
  await journal.tryouts.adoptTryout(id, { endEpochDay: 100 });
  assert.equal((await journal.tryouts.getTryouts())[0].endEpochDay, 100);
});

test('ending an episode cannot interleave its checked start with a concurrent date edit', async () => {
  const { journal } = await journalWithBuiltIns();
  const id = await journal.regimen.upsertEpisode(episode);
  await Promise.all([
    journal.regimen.endEpisode(id, 100),
    journal.regimen.upsertEpisode({ ...episode, id, startEpochDay: 200 })
  ]);
  const [row] = await journal.regimen.getEpisodes();
  assert.equal(row.startEpochDay, 200);
  assert.equal(row.endEpochDay, null);
});

test('adoption cannot interleave its checked start with a concurrent date edit', async () => {
  const { journal } = await journalWithBuiltIns();
  const input = { kind: 'name' as const, label: 'Alex', startEpochDay: 100, endEpochDay: null };
  const id = await journal.tryouts.upsertTryout(input);
  await Promise.all([
    journal.tryouts.adoptTryout(id, { endEpochDay: 100 }),
    journal.tryouts.upsertTryout({ ...input, id, startEpochDay: 200 })
  ]);
  const [row] = await journal.tryouts.getTryouts();
  assert.equal(row.startEpochDay, 200);
  assert.equal(row.endEpochDay, null);
});
