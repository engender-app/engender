/* The body-region area (phase 5 ticket 30, CONTEXT: "Reference data" -
   amended): id-or-key addressing, the same built-in/custom split
   affirmations.ts draws - except a body region has no delete at all, built-in
   or custom, so there is nothing to test there. */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { journalWithBuiltIns, UUID_PATTERN } from './test-support.ts';

test('a custom body region gets a minted uuid id, never a Date-based one', async () => {
  const { journal } = await journalWithBuiltIns();
  const region = await journal.bodyRegions.addCustomRegion('scar tissue');
  assert.match(region.id, UUID_PATTERN);

  const stored = (await journal.bodyRegions.getBodyRegions()).find((r) => r.id === region.id);
  assert.deepEqual(stored, { id: region.id, name: 'scar tissue', builtIn: false, hidden: false });
});

test('the built-in regions are seeded by key, with empty names', async () => {
  const { journal } = await journalWithBuiltIns();
  const regions = await journal.bodyRegions.getBodyRegions();
  const builtIns = regions.filter((r) => r.builtIn);

  assert.equal(builtIns.length, 10);
  assert.ok(builtIns.every((r) => r.name === '' && !r.hidden));
  assert.ok(builtIns.some((r) => r.id === 'chest'));
  assert.ok(builtIns.some((r) => r.id === 'shoulders'));
  assert.ok(builtIns.some((r) => r.id === 'whole_body'));
});

test('hide addresses a built-in by key and throws on an unknown id', async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.bodyRegions.setRegionHidden('chest', true);

  const stored = (await journal.bodyRegions.getBodyRegions()).find((r) => r.id === 'chest');
  assert.equal(stored?.hidden, true);

  await assert.rejects(journal.bodyRegions.setRegionHidden('nope', true), /unknown/);
});

test('unhiding a built-in reverses a hide', async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.bodyRegions.setRegionHidden('genitals', true);
  await journal.bodyRegions.setRegionHidden('genitals', false);

  const stored = (await journal.bodyRegions.getBodyRegions()).find((r) => r.id === 'genitals');
  assert.equal(stored?.hidden, false);
});

test('a custom region can be hidden by its uuid too', async () => {
  const { journal } = await journalWithBuiltIns();
  const region = await journal.bodyRegions.addCustomRegion('scar tissue');
  await journal.bodyRegions.setRegionHidden(region.id, true);

  const stored = (await journal.bodyRegions.getBodyRegions()).find((r) => r.id === region.id);
  assert.equal(stored?.hidden, true);
});
