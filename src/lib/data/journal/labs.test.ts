import { test } from 'vitest';
import assert from 'node:assert/strict';
import { journalWithBuiltIns } from './test-support';

test('getResultById finds an existing lab result by UUID and returns null for unknown', async () => {
  const { journal } = await journalWithBuiltIns();
  const id = await journal.labs.upsertResult({
    epochDay: 20000,
    analyte: 'estradiol',
    value: 175,
    unit: 'pg/mL',
    provider: 'Synlab'
  });

  const found = await journal.labs.getResultById(id);
  assert.ok(found);
  assert.equal(found.id, id);
  assert.equal(found.epochDay, 20000);
  assert.equal(found.analyte, 'estradiol');
  assert.equal(found.value, 175);
  assert.equal(found.unit, 'pg/mL');
  assert.equal(found.provider, 'Synlab');

  const missing = await journal.labs.getResultById('00000000-0000-4000-8000-000000000000');
  assert.equal(missing, null);
});

test('ranged lab reads include boundaries across analytes and omit older history', async () => {
  const { journal, db } = await journalWithBuiltIns();
  for (const [epochDay, analyte] of [[20000, 'estradiol'], [20001, 'testosterone'], [20002, 'estradiol'], [20003, 'testosterone']] as const) {
    await journal.labs.upsertResult({ epochDay, analyte, value: 10 });
  }
  assert.deepEqual((await journal.labs.getResultsInRange(20001, 20002)).map((result) => [result.epochDay, result.analyte]), [
    [20001, 'testosterone'], [20002, 'estradiol']
  ]);
  assert.deepEqual(await journal.labs.getResultsInRange(20004, 20005), []);
  await db.close();
});
