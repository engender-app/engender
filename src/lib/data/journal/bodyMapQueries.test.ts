/* Somatic breakdown per body region queries (phase 5 deepening ticket 08).
   Combines feelings trajectory, progress photos, and
   hair removal records for an anatomical region. */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { journalWithBuiltIns } from './test-support.ts';
import {
  getRegionSomaticBreakdown,
  linkedHairRemovalAreasForRegion
} from './bodyMapQueries.ts';

const photoShot = (full: string, thumb: string) => ({
  full: new Uint8Array([...full].map((c) => c.charCodeAt(0))),
  thumb: new Uint8Array([...thumb].map((c) => c.charCodeAt(0)))
});

test('linked mappings resolve correctly for built-in body regions', () => {
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
  assert.deepEqual(breakdown.photos, []);
  assert.deepEqual(breakdown.hairRemovalSessions, []);
  assert.equal(breakdown.averageDysphoria, null);
  assert.equal(breakdown.averageEuphoria, null);
});

test('feelings trajectory aggregates for a region and excludes trashed entries', async () => {
  const { journal, db } = await journalWithBuiltIns();

  // A region is one value on the shared scale now (ticket 39, ADR-0081), so
  // one entry is dysphoria-only and the other euphoria-only rather than
  // both at once.
  await journal.entries.upsertEntry({
    epochDay: 100,
    mood: 3,
    bodyRegions: { chest: 20 } // dysphoria intensity 60
  });
  await journal.entries.upsertEntry({
    epochDay: 105,
    mood: 4,
    bodyRegions: { chest: 65 } // euphoria intensity 30
  });
  const trashed = await journal.entries.upsertEntry({
    epochDay: 110,
    mood: 2,
    bodyRegions: { chest: 5 } // dysphoria intensity 90
  });
  await journal.entries.deleteEntry(trashed);

  const breakdown = await getRegionSomaticBreakdown(db, 'chest');
  assert.equal(breakdown.isEmpty, false);
  assert.equal(breakdown.trajectory.length, 2);
  assert.equal(breakdown.trajectory[0].epochDay, 105);
  assert.equal(breakdown.trajectory[0].dysphoria, null);
  assert.equal(breakdown.trajectory[0].euphoria, 30);
  assert.equal(breakdown.trajectory[1].epochDay, 100);
  assert.equal(breakdown.trajectory[1].dysphoria, 60);
  assert.equal(breakdown.trajectory[1].euphoria, null);
  assert.equal(breakdown.averageDysphoria, 60);
  assert.equal(breakdown.averageEuphoria, 30);
  assert.equal(breakdown.latestDysphoria, 60);
  assert.equal(breakdown.latestEuphoria, 30);
});

test('progress photos filter by region and exclude trashed entries', async () => {
  const { journal, db } = await journalWithBuiltIns();

  await journal.entries.upsertEntry({
    epochDay: 100,
    mood: 3,
    bodyRegions: { face_jaw: 25 },
    attachPhotos: [photoShot('full1', 'thumb1')]
  });

  await journal.entries.upsertEntry({
    epochDay: 105,
    mood: 4,
    bodyRegions: { chest: 40 },
    attachPhotos: [photoShot('full2', 'thumb2')]
  });

  const trashed = await journal.entries.upsertEntry({
    epochDay: 110,
    mood: 1,
    bodyRegions: { face_jaw: 15 },
    attachPhotos: [photoShot('full3', 'thumb3')]
  });
  await journal.entries.deleteEntry(trashed);

  const faceBreakdown = await getRegionSomaticBreakdown(db, 'face_jaw');
  assert.equal(faceBreakdown.photos.length, 1);
  assert.equal(faceBreakdown.photos[0].epochDay, 100);
});

test('the trajectory and its photos filter by presentation (ADR-0048, ticket 18)', async () => {
  const { journal, db } = await journalWithBuiltIns();

  const girl = await journal.presentations.addPresentation('Girl mode', 0);
  const boy = await journal.presentations.addPresentation('Boy mode', 1);

  await journal.entries.upsertEntry({
    epochDay: 100,
    mood: 3,
    bodyRegions: { chest: 90 },
    presentationId: girl.id,
    attachPhotos: [photoShot('girl1', 'girl1t')]
  });
  await journal.entries.upsertEntry({
    epochDay: 101,
    mood: 3,
    bodyRegions: { chest: 10 },
    presentationId: boy.id,
    attachPhotos: [photoShot('boy1', 'boy1t')]
  });
  await journal.entries.upsertEntry({
    epochDay: 102,
    mood: 3,
    bodyRegions: { chest: 30 }
  });

  const girlBreakdown = await getRegionSomaticBreakdown(db, 'chest', girl.id);
  assert.equal(girlBreakdown.trajectory.length, 1);
  assert.equal(girlBreakdown.trajectory[0].epochDay, 100);
  assert.equal(girlBreakdown.photos.length, 1);
  assert.equal(girlBreakdown.photos[0].epochDay, 100);

  const noPresentationBreakdown = await getRegionSomaticBreakdown(db, 'chest', null);
  assert.equal(noPresentationBreakdown.trajectory.length, 1);
  assert.equal(noPresentationBreakdown.trajectory[0].epochDay, 102);

  // Partition: per-presentation reads plus the no-presentation read account
  // for every entry the unfiltered view shows.
  const unfiltered = await getRegionSomaticBreakdown(db, 'chest');
  const boyBreakdown = await getRegionSomaticBreakdown(db, 'chest', boy.id);
  assert.equal(
    girlBreakdown.trajectory.length + boyBreakdown.trajectory.length + noPresentationBreakdown.trajectory.length,
    unfiltered.trajectory.length
  );
  assert.equal(
    girlBreakdown.photos.length + boyBreakdown.photos.length + noPresentationBreakdown.photos.length,
    unfiltered.photos.length
  );
});

test('hair removal sessions link to relevant regions', async () => {
  const { journal, db } = await journalWithBuiltIns();

  await journal.hairRemoval.upsertSession({
    epochDay: 101,
    area: 'chin',
    method: 'laser',
    painRating: 3,
    provider: 'Clinic A'
  });

  await journal.hairRemoval.upsertSession({
    epochDay: 103,
    area: 'legs',
    method: 'laser',
    painRating: 2
  });

  const faceBreakdown = await getRegionSomaticBreakdown(db, 'face_jaw');
  assert.equal(faceBreakdown.hairRemovalSessions.length, 1);
  assert.equal(faceBreakdown.hairRemovalSessions[0].area, 'chin');

  const hairlineBreakdown = await getRegionSomaticBreakdown(db, 'hairline');
  assert.equal(hairlineBreakdown.hairRemovalSessions.length, 0);
});
