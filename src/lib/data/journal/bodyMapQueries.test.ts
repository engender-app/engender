/* Somatic breakdown per body region queries (phase 5 deepening ticket 08).
   Combines feelings trajectory, linked measurements, progress photos, and
   hair removal / staging records for an anatomical region. */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { journalWithBuiltIns } from './test-support.ts';
import {
  getRegionSomaticBreakdown,
  linkedMeasurementTypesForRegion,
  linkedHairRemovalAreasForRegion
} from './bodyMapQueries.ts';

const photoShot = (full: string, thumb: string) => ({
  full: new Uint8Array([...full].map((c) => c.charCodeAt(0))),
  thumb: new Uint8Array([...thumb].map((c) => c.charCodeAt(0)))
});

test('linked mappings resolve correctly for built-in body regions', () => {
  assert.deepEqual(linkedMeasurementTypesForRegion('chest'), ['chest', 'underbust']);
  assert.deepEqual(linkedMeasurementTypesForRegion('hips_waist'), ['waist', 'hips']);
  assert.ok(linkedHairRemovalAreasForRegion('face_jaw').includes('chin'));
  assert.ok(linkedHairRemovalAreasForRegion('face_jaw').includes('upper_lip'));
  assert.ok(linkedHairRemovalAreasForRegion('chest').includes('chest'));
});

test('empty somatic breakdown when nothing is logged for a region', async () => {
  const { db } = await journalWithBuiltIns();
  const breakdown = await getRegionSomaticBreakdown(db, 'chest');

  assert.equal(breakdown.region, 'chest');
  assert.equal(breakdown.isEmpty, true);
  assert.deepEqual(breakdown.trajectory, []);
  assert.deepEqual(breakdown.measurements, []);
  assert.deepEqual(breakdown.photos, []);
  assert.deepEqual(breakdown.hairRemovalSessions, []);
  assert.deepEqual(breakdown.hairStages, []);
  assert.equal(breakdown.averageDysphoria, null);
  assert.equal(breakdown.averageEuphoria, null);
});

test('feelings trajectory aggregates for a region and excludes trashed entries', async () => {
  const { journal, db } = await journalWithBuiltIns();

  await journal.entries.upsertEntry({
    epochDay: 100,
    mood: 3,
    bodyRegions: { chest: { dysphoria: 60, euphoria: 10 } }
  });
  await journal.entries.upsertEntry({
    epochDay: 105,
    mood: 4,
    bodyRegions: { chest: { dysphoria: 40, euphoria: 30 } }
  });
  const trashed = await journal.entries.upsertEntry({
    epochDay: 110,
    mood: 2,
    bodyRegions: { chest: { dysphoria: 90, euphoria: 0 } }
  });
  await journal.entries.deleteEntry(trashed);

  const breakdown = await getRegionSomaticBreakdown(db, 'chest');
  assert.equal(breakdown.isEmpty, false);
  assert.equal(breakdown.trajectory.length, 2);
  assert.equal(breakdown.trajectory[0].epochDay, 105);
  assert.equal(breakdown.trajectory[0].dysphoria, 40);
  assert.equal(breakdown.trajectory[0].euphoria, 30);
  assert.equal(breakdown.trajectory[1].epochDay, 100);
  assert.equal(breakdown.trajectory[1].dysphoria, 60);
  assert.equal(breakdown.trajectory[1].euphoria, 10);
  assert.equal(breakdown.averageDysphoria, 50);
  assert.equal(breakdown.averageEuphoria, 20);
  assert.equal(breakdown.latestDysphoria, 40);
  assert.equal(breakdown.latestEuphoria, 30);
});

test('linked measurements filter by region mapping', async () => {
  const { journal, db } = await journalWithBuiltIns();

  await journal.measurements.upsertMeasurement({
    epochDay: 100,
    type: 'chest',
    value: 95,
    unit: 'cm'
  });
  await journal.measurements.upsertMeasurement({
    epochDay: 102,
    type: 'underbust',
    value: 80,
    unit: 'cm'
  });
  await journal.measurements.upsertMeasurement({
    epochDay: 104,
    type: 'waist',
    value: 70,
    unit: 'cm'
  });

  const chestBreakdown = await getRegionSomaticBreakdown(db, 'chest');
  assert.equal(chestBreakdown.measurements.length, 2);
  assert.equal(chestBreakdown.measurements[0].type, 'underbust');
  assert.equal(chestBreakdown.measurements[1].type, 'chest');

  const hipsBreakdown = await getRegionSomaticBreakdown(db, 'hips_waist');
  assert.equal(hipsBreakdown.measurements.length, 1);
  assert.equal(hipsBreakdown.measurements[0].type, 'waist');
});

test('progress photos filter by region and exclude trashed entries', async () => {
  const { journal, db } = await journalWithBuiltIns();

  await journal.entries.upsertEntry({
    epochDay: 100,
    mood: 3,
    bodyRegions: { face_jaw: { dysphoria: 50, euphoria: null } },
    attachPhotos: [photoShot('full1', 'thumb1')]
  });

  await journal.entries.upsertEntry({
    epochDay: 105,
    mood: 4,
    bodyRegions: { chest: { dysphoria: 20, euphoria: null } },
    attachPhotos: [photoShot('full2', 'thumb2')]
  });

  const trashed = await journal.entries.upsertEntry({
    epochDay: 110,
    mood: 1,
    bodyRegions: { face_jaw: { dysphoria: 70, euphoria: null } },
    attachPhotos: [photoShot('full3', 'thumb3')]
  });
  await journal.entries.deleteEntry(trashed);

  const faceBreakdown = await getRegionSomaticBreakdown(db, 'face_jaw');
  assert.equal(faceBreakdown.photos.length, 1);
  assert.equal(faceBreakdown.photos[0].epochDay, 100);
});

test('hair removal sessions and hair staging link to relevant regions', async () => {
  const { journal, db } = await journalWithBuiltIns();

  await journal.hairRemoval.upsertSession({
    epochDay: 101,
    area: 'chin',
    method: 'laser',
    painRating: 3,
    cost: '50',
    provider: 'Clinic A'
  });

  await journal.hairRemoval.upsertSession({
    epochDay: 103,
    area: 'legs',
    method: 'laser',
    painRating: 2
  });

  await journal.hairProgress.upsertStage({
    epochDay: 102,
    scale: 'norwood_hamilton',
    stage: '2'
  });

  const faceBreakdown = await getRegionSomaticBreakdown(db, 'face_jaw');
  assert.equal(faceBreakdown.hairRemovalSessions.length, 1);
  assert.equal(faceBreakdown.hairRemovalSessions[0].area, 'chin');
  assert.equal(faceBreakdown.hairStages.length, 0);

  const hairlineBreakdown = await getRegionSomaticBreakdown(db, 'hairline');
  assert.equal(hairlineBreakdown.hairStages.length, 1);
  assert.equal(hairlineBreakdown.hairStages[0].stage, '2');
});
