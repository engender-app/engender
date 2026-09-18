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
