/* trackAndGraph.ts's own tests, at the parsing/resolving seam - the same
   layer daylio.test.ts and transtracks.test.ts cover for their own sources.
   `track-and-graph-edge-cases.csv` and `track-and-graph-malformed.csv` are
   the committed fixture pair spec.md's Testing Decisions ask every source
   to ship. Narrower single-purpose cases (a reordered header, a missing
   column) stay inline, the same mix daylio.test.ts and transtracks.test.ts
   themselves use. */

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'vitest';
import { emptyArchiveJournal } from '../journal/archiveSections.ts';
import {
  TrackAndGraphCsvError,
  detectTrackAndGraph,
  parseTrackAndGraphValue,
  trackAndGraphPreview
} from './trackAndGraph.ts';
import type { ArchiveJournal } from './payload.ts';

const fixtureText = (name: string) => readFile(new URL(`fixtures/${name}`, import.meta.url), 'utf8');

const empty = (): ArchiveJournal => emptyArchiveJournal();

test('detectTrackAndGraph sniffs the header alone, so a malformed body still detects', async () => {
  const wellFormed = await fixtureText('track-and-graph-edge-cases.csv');
  const malformed = await fixtureText('track-and-graph-malformed.csv');

  assert.ok(detectTrackAndGraph(wellFormed));
  assert.ok(detectTrackAndGraph(malformed));
  assert.ok(!detectTrackAndGraph('name,unrelated,columns\nA,B,C'));
  // Column order does not matter to detection either.
  assert.ok(detectTrackAndGraph('Value,FeatureName,Timestamp\n1,Weight,2022-01-01T00:00:00Z'));
});

test('the value grammar: no colon a plain double, H:MM:SS a duration in seconds, more colons a duration plus a dropped label, one colon the legacy value:label', () => {
  assert.deepEqual(parseTrackAndGraphValue('72.5'), { value: 72.5, unit: '' });
  assert.deepEqual(parseTrackAndGraphValue('1:02:03'), { value: 3723, unit: 'seconds' });
  assert.deepEqual(parseTrackAndGraphValue('1:02:03:workout'), { value: 3723, unit: 'seconds' });
  assert.deepEqual(parseTrackAndGraphValue('71.9:legacy label'), { value: 71.9, unit: '' });
  assert.deepEqual(parseTrackAndGraphValue('-1:-05:-30'), { value: -1 * 3600 - 5 * 60 - 30, unit: 'seconds' });
});

test('an unparseable value is refused rather than silently coerced to zero or NaN', () => {
  assert.equal(parseTrackAndGraphValue(''), null);
  assert.equal(parseTrackAndGraphValue('not a number'), null);
});

test('an explicit Label column and an in-band label on the same row both drop, and the value parses the same either way', async () => {
  const withBoth = await trackAndGraphPreview(
    'FeatureName,Timestamp,Value,Label\r\nRun duration,2022-01-01T00:00:00Z,1:02:03:in-band,explicit column\r\n',
    empty()
  );
  const inBandOnly = await trackAndGraphPreview(
    'FeatureName,Timestamp,Value\r\nRun duration,2022-01-01T00:00:00Z,1:02:03:in-band\r\n',
    empty()
  );

  // Neither label has anywhere to go (Mapping's own rule), so the explicit
  // column "winning" is trivial: the value parses identically whether or
  // not a Label column is even present, and exactly one reading results.
  assert.equal(withBoth.measurementCount, 1);
  assert.equal(withBoth.journal.measurements[0].value, 3723);
  assert.equal(withBoth.journal.measurements[0].unit, 'seconds');
  assert.equal(withBoth.journal.measurements[0].value, inBandOnly.journal.measurements[0].value);
});

test('the well-formed fixture: three features become three custom types, four readings, the extra column and the ignored Label/Note columns are named', async () => {
  const preview = await trackAndGraphPreview(await fixtureText('track-and-graph-edge-cases.csv'), empty());

  assert.equal(preview.measurementCount, 4);
  assert.equal(preview.newTypeCount, 3);
  assert.deepEqual(preview.ignoredColumns.toSorted(), ['Label', 'Note']);
  assert.deepEqual(preview.unrecognizedColumns, ['DeviceId']);

  const weightType = preview.journal.measurementTypes.find((type) => type.name === 'Weight')!;
  assert.equal(weightType.builtIn, false);
  const weightReadings = preview.journal.measurements.filter((measurement) => measurement.type === weightType.key);
  assert.equal(weightReadings.length, 2, 'both Weight rows resolve to the same custom type');

  const durationReading = preview.journal.measurements.find((measurement) => measurement.unit === 'seconds')!;
  assert.equal(durationReading.value, 3723);

  const legacyLabelReading = preview.journal.measurements.find((measurement) => measurement.value === 71.9)!;
  assert.equal(legacyLabelReading.unit, '', 'a plain double keeps an empty unit, never a guessed one');
});

test('units are never inferred from a feature name, even one that looks like it names one', async () => {
  const csv = 'FeatureName,Timestamp,Value\r\nWeight (kg),2022-01-01T00:00:00Z,80\r\n';
  const preview = await trackAndGraphPreview(csv, empty());
  assert.equal(preview.journal.measurements[0].unit, '');
  assert.equal(preview.journal.measurementTypes[0].name, 'Weight (kg)');
});

test('a file with only the three required headers imports', async () => {
  const csv = 'FeatureName,Timestamp,Value\r\nWeight,2022-01-01T00:00:00Z,80\r\n';
  const preview = await trackAndGraphPreview(csv, empty());
  assert.equal(preview.measurementCount, 1);
  assert.deepEqual(preview.ignoredColumns, []);
  assert.deepEqual(preview.unrecognizedColumns, []);
});

// A new custom type's key is minted at random (mintUuid), so two independent
// preview calls resolve the same feature under different keys - comparing by
// name and value is what proves reordering the header changes nothing about
// what is imported, without depending on that randomness (sources.test.ts's
// own `byLabel` reasoning for Daylio's tags).
function byTypeName(journal: ArchiveJournal) {
  const nameByKey = new Map(journal.measurementTypes.map((type) => [type.key, type.name]));
  return {
    types: journal.measurementTypes.map((type) => type.name).toSorted(),
    measurements: journal.measurements.map((measurement) => ({
      type: nameByKey.get(measurement.type),
      epochDay: measurement.epochDay,
      value: measurement.value,
      unit: measurement.unit
    }))
  };
}

test('a file with the columns in a different order imports identically', async () => {
  const inOrder = await trackAndGraphPreview('FeatureName,Timestamp,Value\r\nWeight,2022-01-01T00:00:00Z,80\r\n', empty());
  const reordered = await trackAndGraphPreview('Value,FeatureName,Timestamp\r\n80,Weight,2022-01-01T00:00:00Z\r\n', empty());
  assert.deepEqual(byTypeName(reordered.journal), byTypeName(inOrder.journal));
});

test('a file missing Value is a named structural error listing the required header', async () => {
  await assert.rejects(
    trackAndGraphPreview('FeatureName,Timestamp\r\nWeight,2022-01-01T00:00:00Z\r\n', empty()),
    (error: unknown) => error instanceof TrackAndGraphCsvError && /missing the Value column/.test((error as Error).message)
  );
});

test('the malformed fixture: an invalid Timestamp throws, naming the row', async () => {
  await assert.rejects(
    trackAndGraphPreview(await fixtureText('track-and-graph-malformed.csv'), empty()),
    (error: unknown) => error instanceof TrackAndGraphCsvError && /row 2.*Timestamp/.test((error as Error).message)
  );
});

test('timestamps with and without sub-second precision, with Z and with a numeric offset, all yield the right local epochDay', async () => {
  const csv = [
    'FeatureName,Timestamp,Value',
    'A,2021-02-09T11:07:28Z,1',
    'B,2022-09-14T21:30:41.432+01:00,1',
    'C,2022-09-14T23:59:59-05:00,1'
  ].join('\r\n');
  const preview = await trackAndGraphPreview(csv, empty());
  const typeKeyByName = new Map(preview.journal.measurementTypes.map((type) => [type.name, type.key]));
  const epochDayOf = (name: string) =>
    preview.journal.measurements.find((measurement) => measurement.type === typeKeyByName.get(name))!.epochDay;

  // The wall-clock date is the literal YYYY-MM-DD prefix regardless of offset:
  // getUTCDate() reads back the day-of-month an epoch day was stamped with.
  assert.equal(new Date(epochDayOf('A') * 86_400_000).getUTCDate(), 9);
  assert.equal(new Date(epochDayOf('B') * 86_400_000).getUTCDate(), 14);
  assert.equal(new Date(epochDayOf('C') * 86_400_000).getUTCDate(), 14);
});

test('re-importing the same file adds nothing, and mints no duplicate custom type', async () => {
  const csv = await fixtureText('track-and-graph-edge-cases.csv');
  const first = await trackAndGraphPreview(csv, empty());
  const second = await trackAndGraphPreview(csv, first.journal);

  assert.equal(second.measurementCount, 0);
  assert.equal(second.newTypeCount, 0);
  assert.deepEqual(second.journal.measurements, []);
  assert.deepEqual(second.journal.measurementTypes, []);
});

test('a renamed tracker between two exports reads as a new one - the source\'s own property', async () => {
  const before = await trackAndGraphPreview(
    'FeatureName,Timestamp,Value\r\nOld Name,2022-01-01T00:00:00Z,1\r\n',
    empty()
  );
  const after = await trackAndGraphPreview(
    'FeatureName,Timestamp,Value\r\nNew Name,2022-01-01T00:00:00Z,1\r\n',
    before.journal
  );
  assert.equal(after.newTypeCount, 1);
  assert.equal(after.measurementCount, 1);
});
