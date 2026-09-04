/* What the `.daylio` source accepts, what it refuses, and what it
   produces (phase 7 ticket 09).

   The failure cases are the bulk of this file on purpose. The format is
   undocumented by its vendor and its version number does not move when
   its shape does, so the thing worth testing is not that a clean file
   imports - it is that a changed one is refused rather than half-read,
   and that the two month conventions in the same file are each read the
   way that file writes them.

   `daylio.ts` is untouched by this ticket, and nothing here imports its
   `MOODS` table: a mood's position comes from the backup's own
   `customMoods`, which is the whole reason this source exists. */

import assert from 'node:assert/strict';
import { test } from 'vitest';
import { epochDayFromDateInputValue } from '../epochDay.ts';
import { emptyArchiveJournal } from '../journal/archiveSections.ts';
import { DaylioBackupError, daylioBackupPreview, detectDaylioBackup } from './daylioBackup.ts';
import {
  AUDIO_BYTES,
  AUDIO_CHECKSUM,
  MILESTONE_PHOTO_BYTES,
  PHOTO_BYTES,
  PHOTO_CHECKSUM,
  daylioAssetFiles,
  daylioPayload,
  makeDaylioBackup,
  makeDaylioBackupFrom,
  makeMalformedDaylioBackup,
  makeZip
} from './test-support/daylio-backup.ts';

const naming = { tagLabels: () => [] };
const preview = async (payload: unknown = daylioPayload(), assets = daylioAssetFiles()) =>
  daylioBackupPreview(await makeDaylioBackup(payload, assets), emptyArchiveJournal(), naming);

/** The payload with one collection replaced, so a test bends one thing
    and inherits every other shape from the fixture. */
const withCollection = (key: string, value: unknown) => ({ ...daylioPayload(), [key]: value });

const entryOn = (result: Awaited<ReturnType<typeof preview>>, date: string) => {
  const found = result.journal.entries.find((entry) => entry.epochDay === epochDayFromDateInputValue(date));
  assert.ok(found, `no entry on ${date}`);
  return found;
};

test('a well-formed backup imports its entries, tags, groups and milestones', async () => {
  const result = await preview();

  assert.equal(result.entryCount, 3);
  assert.equal(result.milestoneCount, 2);
  assert.equal(result.journal.entries.length, 3);
  assert.equal(result.journal.milestones.length, 2);
  assert.deepEqual(
    result.journal.tagGroups.map((group) => group.name).toSorted(),
    ['Codziennie', 'Zdrowie']
  );
});

/* The trap the ticket names: two month conventions in one file. Each of
   these fails if the other convention is applied, which is what makes
   them worth writing - a flipped base produces plausible wrong dates and
   no error at all. */

test('dayEntries.month is read 0-based', async () => {
  const result = await preview();
  // month: 0, day: 15, year: 2026. A 1-based read lands in February.
  assert.equal(entryOn(result, '2026-01-15').epochDay, epochDayFromDateInputValue('2026-01-15'));
  assert.equal(entryOn(result, '2026-02-25').epochDay, epochDayFromDateInputValue('2026-02-25'));
});

test('milestones.month is read 1-based, in the same file', async () => {
  const result = await preview();
  const byName = new Map(result.journal.milestones.map((milestone) => [milestone.name, milestone]));

  // month: 12 is December. A 0-based read cannot even express it.
  assert.equal(byName.get('came out to my sister')!.epochDay, epochDayFromDateInputValue('1999-12-31'));
  assert.equal(byName.get('first appointment')!.epochDay, epochDayFromDateInputValue('2026-03-04'));
});

test('a milestone dated decades before the earliest entry imports', async () => {
  const result = await preview();
  const earliest = Math.min(...result.journal.entries.map((entry) => entry.epochDay));
  const milestone = result.journal.milestones.find((one) => one.name === 'came out to my sister')!;

  assert.ok(milestone.epochDay < earliest, 'the 1999 milestone is older than every entry and still arrives');
});

test('a milestone note becomes the milestone description', async () => {
  const result = await preview();
  const byName = new Map(result.journal.milestones.map((milestone) => [milestone.name, milestone]));

  assert.equal(byName.get('came out to my sister')!.description, 'in the car, parked outside hers');
  // Unlike dayEntries.note, a milestone note is present and empty.
  assert.equal(byName.get('first appointment')!.description, '');
});

test('an entry keeps its local wall-clock time rather than the UTC datetime', async () => {
  const result = await preview();
  const clock = new Date(entryOn(result, '2026-01-15').timestamp);

  assert.equal(clock.getHours(), 8);
  assert.equal(clock.getMinutes(), 30);
});

/* Moods. `dayEntries.mood` is a foreign key into customMoods, and the
   scale position is that row's mood_group_id, where 1 is the best day.
   This app's mood is the other way round - 1 is awful, 5 is great - so
   the two ends have to swap. */

test('a custom mood resolves through mood_group_id, not through a label table', async () => {
  const result = await preview();

  // "spokojnie" is in no label table anywhere, and predefined_name_id is -1.
  assert.equal(entryOn(result, '2026-01-15').mood, 3);
  assert.deepEqual(
    result.moods.map((mood) => ({ name: mood.name, mood: mood.mood })).toSorted((a, b) => a.mood! - b.mood!),
    [
      { name: 'nie dało się', mood: 1 },
      { name: 'spokojnie', mood: 3 },
      { name: null, mood: 5 }
    ]
  );
  assert.deepEqual(result.unmappedMoodNames, []);
});

test('the scale is inverted: Daylio 1 is the best day and this app 5 is', async () => {
  const result = await preview();

  // mood_group_id 1 (Daylio's best) on the 16th, 5 (its worst) on the 25th.
  assert.equal(entryOn(result, '2026-01-16').mood, 5);
  assert.equal(entryOn(result, '2026-02-25').mood, 1);
});

test('dayEntries.mood is never clamped to the scale: it is a foreign key', async () => {
  const moods = daylioPayload().customMoods as Record<string, unknown>[];
  // An id well outside 1-5, which a clamping reader turns into a mood of 5.
  const payload = withCollection('customMoods', [{ ...moods[1], id: 41, mood_group_id: 2 }]);
  const entries = (payload.dayEntries as Record<string, unknown>[]).map((entry) => ({ ...entry, mood: 41 }));

  const result = await preview({ ...payload, dayEntries: entries });
  for (const entry of result.journal.entries) assert.equal(entry.mood, 4);
});

test('a mood whose group is outside the scale is named as unmapped rather than guessed', async () => {
  const moods = (daylioPayload().customMoods as Record<string, unknown>[]).map((mood) =>
    mood.id === 7 ? { ...mood, mood_group_id: 9 } : mood
  );

  const result = await preview(withCollection('customMoods', moods));
  assert.deepEqual(result.unmappedMoodNames, ['spokojnie']);
  assert.equal(entryOn(result, '2026-01-15').mood, null);
});

test('a mood pointing at no customMoods row is a named structural error', async () => {
  const entries = (daylioPayload().dayEntries as Record<string, unknown>[]).map((entry) => ({ ...entry, mood: 404 }));

  await assert.rejects(() => preview(withCollection('dayEntries', entries)), (error: Error) => {
    assert.ok(error instanceof DaylioBackupError);
    assert.match(error.message, /entry 1 names mood 404/);
    return true;
  });
});

/* Notes. */

test('an entry with no note and no note_title key imports', async () => {
  const result = await preview();
  assert.equal(entryOn(result, '2026-01-16').note, '');
});

test('HTML in a note is converted, including a list', async () => {
  const result = await preview();

  assert.equal(entryOn(result, '2026-01-15').note, 'Piątek\na good morning\nthen a walk');
  assert.equal(entryOn(result, '2026-02-25').note, '- bloods\n- call the clinic');
});

test('a writing template arrives as an entry template, its HTML body converted', async () => {
  const result = await preview();

  assert.equal(result.templateCount, 1);
  assert.deepEqual(
    result.journal.entryTemplates.map((template) => ({ name: template.name, noteScaffold: template.noteScaffold })),
    [{ name: 'Evening', noteScaffold: 'What happened today?\nHow did it feel?' }]
  );
});

/* Tags and groups: the person's own groups, not one invented "imported"
   group, which is what the CSV path has to do. */

test('tag groups import with their own names', async () => {
  const result = await preview();
  const groups = result.journal.tagGroups;

  assert.equal(groups.length, 2);
  assert.ok(!groups.some((group) => group.key === 'imported'), 'no invented group');
  const codziennie = groups.find((group) => group.name === 'Codziennie')!;
  assert.deepEqual(codziennie.tags.map((tag) => tag.label), ['praca']);
  assert.equal(codziennie.builtIn, false);
});

test('a tag already in the journal is matched rather than duplicated', async () => {
  const existing = emptyArchiveJournal();
  existing.tagGroups = [
    { key: 'activities', name: 'Activities', enabled: true, builtIn: true, tags: [{ id: 'a-work', label: 'praca', builtIn: true, hidden: false }] }
  ];

  const result = await daylioBackupPreview(await makeDaylioBackup(), existing, naming);
  assert.equal(result.matchedTagCount, 1);
  assert.equal(result.newTagCount, 1);
  assert.deepEqual(entryOn(result, '2026-01-16').tags, ['a-work']);
});

test('a tag whose group id names no group is a named structural error', async () => {
  const tags = (daylioPayload().tags as Record<string, unknown>[]).map((tag) => ({ ...tag, id_tag_group: 77 }));

  await assert.rejects(() => preview(withCollection('tags', tags)), (error: Error) => {
    assert.match(error.message, /tag 14 names tag group 77/);
    return true;
  });
});

test('a tag with no group at all lands in the built-in imported group', async () => {
  const tags = (daylioPayload().tags as Record<string, unknown>[]).map(({ id, name }) => ({ id, name }));

  const result = await preview(withCollection('tags', tags));
  assert.deepEqual(result.journal.tagGroups.map((group) => group.key), ['imported']);
  assert.equal(result.journal.tagGroups[0].builtIn, true);
});

/* Assets. */

test('assets resolve by checksum under photos and audio alike', async () => {
  const result = await preview();

  assert.equal(result.photoCount, 2);
  assert.equal(result.audioCount, 1);

  const entry = entryOn(result, '2026-01-15');
  assert.equal(entry.photos.length, 1);
  assert.equal(entry.recordings.length, 1);
  assert.match(entry.photos[0].fileName, /\.jpg$/);

  const byName = new Map(result.assets.map((asset) => [asset.fileName, asset]));
  assert.deepEqual(await byName.get(entry.photos[0].fileName)!.read(), PHOTO_BYTES);
  assert.deepEqual(await byName.get(entry.recordings[0].fileName)!.read(), AUDIO_BYTES);
});

test('a milestone photo resolves through assetId, from a deflated member', async () => {
  const result = await preview();
  const milestone = result.journal.milestones.find((one) => one.name === 'came out to my sister')!;

  assert.ok(milestone.photo, 'the milestone carries its photo');
  const asset = result.assets.find((one) => one.fileName === milestone.photo!.fileName)!;
  assert.deepEqual(await asset.read(), MILESTONE_PHOTO_BYTES);
});

test('an audio asset keeps an extension matching its own bytes', async () => {
  const result = await preview();
  const entry = entryOn(result, '2026-01-15');
  // The fixture's audio bytes are an ISO base media file, not a webm.
  assert.match(entry.recordings[0].fileName, /\.m4a$/);
});

test('android_metadata is parsed as JSON inside JSON, which is where an unsniffable audio type comes from', async () => {
  const assets = (daylioPayload().assets as Record<string, unknown>[]).map((asset) =>
    asset.type === 2
      ? { ...asset, android_metadata: JSON.stringify({ Name: 'AUD_0001.3gp', LastModified: 1, Duration: 900 }) }
      : asset
  );
  // Bytes that name no container at all, so the extension can only come
  // from that doubly-encoded field. A reader that took `android_metadata`
  // for an object gets nothing out of it and drops the recording.
  const files = daylioAssetFiles().map((file) =>
    file.name.includes(AUDIO_CHECKSUM) ? { ...file, bytes: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]) } : file
  );

  const result = await preview(withCollection('assets', assets), files);
  assert.match(entryOn(result, '2026-01-15').recordings[0].fileName, /\.3gp$/);
});

test('an audio asset whose android_metadata names an extension outside the recordings allowlist is named as skipped', async () => {
  const assets = (daylioPayload().assets as Record<string, unknown>[]).map((asset) =>
    asset.type === 2
      ? { ...asset, android_metadata: JSON.stringify({ Name: 'AUD_0001.exe', LastModified: 1, Duration: 900 }) }
      : asset
  );
  // Bytes that name no container, same as the doubly-encoded-metadata test
  // above: the extension can only come from `sourceName`, and `.exe` is
  // exactly the shape the old regex accepted and voiceRecordings/mime.ts's
  // allowlist does not - a recording this app could never play.
  const files = daylioAssetFiles().map((file) =>
    file.name.includes(AUDIO_CHECKSUM) ? { ...file, bytes: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]) } : file
  );

  const result = await preview(withCollection('assets', assets), files);
  assert.deepEqual(entryOn(result, '2026-01-15').recordings, []);
  assert.equal(result.audioCount, 0);
  assert.deepEqual(result.skipped.find((skip) => skip.kind === 'assets'), { kind: 'assets', count: 1 });
});

test('an audio asset whose type is in neither its bytes nor its metadata is named as skipped', async () => {
  const assets = (daylioPayload().assets as Record<string, unknown>[]).map((asset) =>
    asset.type === 2 ? { ...asset, android_metadata: 'not json at all' } : asset
  );
  const files = daylioAssetFiles().map((file) =>
    file.name.includes(AUDIO_CHECKSUM) ? { ...file, bytes: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]) } : file
  );

  const result = await preview(withCollection('assets', assets), files);
  assert.deepEqual(entryOn(result, '2026-01-15').recordings, []);
  assert.equal(result.audioCount, 0);
  assert.deepEqual(result.skipped.find((skip) => skip.kind === 'assets'), { kind: 'assets', count: 1 });
});

test('a dangling assetId is a named structural error, not a crash', async () => {
  const milestones = (daylioPayload().milestones as Record<string, unknown>[]).map((milestone) =>
    milestone.id === 1 ? { ...milestone, assetId: 909 } : milestone
  );

  await assert.rejects(() => preview(withCollection('milestones', milestones)), (error: Error) => {
    assert.ok(error instanceof DaylioBackupError);
    assert.match(error.message, /milestone 1 names asset 909/);
    return true;
  });
});

test('an entry asset id naming no asset row is a named structural error', async () => {
  const entries = (daylioPayload().dayEntries as Record<string, unknown>[]).map((entry) =>
    entry.id === 1 ? { ...entry, assets: [101, 808] } : entry
  );

  await assert.rejects(() => preview(withCollection('dayEntries', entries)), (error: Error) => {
    assert.match(error.message, /entry 1 names asset 808/);
    return true;
  });
});

test('an asset row whose file is missing from the zip is named in the preview, not imported', async () => {
  const withoutPhoto = daylioAssetFiles().filter((file) => !file.name.includes(PHOTO_CHECKSUM));

  const result = await preview(daylioPayload(), withoutPhoto);
  assert.equal(entryOn(result, '2026-01-15').photos.length, 0, 'no row pointing at a file that never arrives');
  assert.equal(result.photoCount, 1);
  assert.deepEqual(result.skipped.find((skip) => skip.kind === 'assets'), { kind: 'assets', count: 1 });
});

/* Scales become custom gender dimensions, which is where an entry's own
   scale value has somewhere to land. */

test('a scale becomes a dimension and an entry scale value lands on it', async () => {
  const result = await preview();

  assert.equal(result.dimensionCount, 1);
  const dimension = result.journal.dimensions[0];
  assert.deepEqual(
    { name: dimension.name, low: dimension.low, high: dimension.high, min: dimension.min, max: dimension.max, builtIn: dimension.builtIn },
    { name: 'Sen', low: 'zle', high: 'dobrze', min: 1, max: 3, builtIn: false }
  );
  // id_text_scale_value 12 is the third of three values.
  assert.deepEqual(entryOn(result, '2026-01-15').dims, { [dimension.key]: 3 });
});

test('a scale whose value list cannot be read is named as skipped rather than guessed', async () => {
  const scales = (daylioPayload().scales as Record<string, unknown>[]).map((scale) => ({
    ...scale,
    // A future shape: values as bare strings, with no id to resolve
    // dayEntries.scaleValues against.
    text_scale: { id: 1, id_scale: 1, metric: '', values: ['zle', 'dobrze'] }
  }));

  const result = await preview(withCollection('scales', scales));
  assert.deepEqual(result.journal.dimensions, []);
  assert.deepEqual(entryOn(result, '2026-01-15').dims, {});
  assert.deepEqual(result.skipped.find((skip) => skip.kind === 'scales'), { kind: 'scales', count: 1 });
});

/* Everything the ticket puts out of scope has to be named rather than
   silently dropped. */

test('the preview names what it skipped', async () => {
  const result = await preview();

  assert.deepEqual(result.skipped.toSorted((a, b) => a.kind.localeCompare(b.kind)), [
    { kind: 'achievements', count: 1 },
    { kind: 'anniversaries', count: 1 },
    { kind: 'goals', count: 2 },
    { kind: 'icons' },
    { kind: 'preferences', count: 1 },
    { kind: 'reminders', count: 1 },
    // Both of Daylio's records about goals: one success week, one goal entry.
    { kind: 'statistics', count: 2 }
  ]);
});

test('goals are not imported anywhere, however their repeat is written', async () => {
  const result = await preview();

  assert.deepEqual(result.journal.checklists, []);
  assert.deepEqual(result.journal.roadmapGoals, []);
  // repeat_value 127 with repeat_type 1 is a weekday bitmask, so the goal
  // count is 2 and nothing anywhere reads 127 as a number of anything.
  assert.deepEqual(result.skipped.find((skip) => skip.kind === 'goals'), { kind: 'goals', count: 2 });
});

test('an anniversary milestone imports on its origin date, with the recurrence named', async () => {
  const result = await preview();
  const milestone = result.journal.milestones.find((one) => one.name === 'came out to my sister')!;

  assert.equal(milestone.epochDay, epochDayFromDateInputValue('1999-12-31'));
  assert.deepEqual(result.skipped.find((skip) => skip.kind === 'anniversaries'), { kind: 'anniversaries', count: 1 });
});

/* The security boundary and the version contract. */

test('pin and pinMode are stripped at the parse boundary', async () => {
  const result = await preview();
  const serialised = JSON.stringify(result.journal);

  assert.ok(!serialised.includes('1234'), 'the pin does not reach the journal');
  assert.ok(!serialised.includes('pinMode'));
});

test('a platform other than android is declined by name', async () => {
  const payload = { ...daylioPayload(), metadata: { ...(daylioPayload().metadata as object), platform: 'ios' }, version: 18 };

  await assert.rejects(() => preview(payload), (error: Error) => {
    assert.ok(error instanceof DaylioBackupError);
    assert.match(error.message, /ios/);
    return true;
  });
});

test('an unknown version warns and proceeds', async () => {
  const result = await preview({ ...daylioPayload(), version: 21 });

  assert.equal(result.unexpectedVersion, 21);
  assert.equal(result.entryCount, 3);
});

test('the expected version reports no warning', async () => {
  assert.equal((await preview()).unexpectedVersion, null);
});

test('unknown keys never fail, at the top level or inside a record', async () => {
  const payload = daylioPayload();
  const entries = (payload.dayEntries as Record<string, unknown>[]).map((entry) => ({ ...entry, futureField: [1, 2] }));

  const result = await preview({ ...payload, dayEntries: entries, futureCollection: [{ anything: true }] });
  assert.equal(result.entryCount, 3);
});

test('an absent collection is read as empty rather than as a fault', async () => {
  const result = await preview({
    version: 15,
    metadata: { platform: 'android' },
    customMoods: [],
    dayEntries: []
  });

  assert.equal(result.entryCount, 0);
  assert.deepEqual(result.journal.milestones, []);
  assert.deepEqual(result.skipped, []);
});

/* Refusals: only what cannot be read at all. */

test('a file that is not a zip is refused', async () => {
  await assert.rejects(
    () => daylioBackupPreview(new TextEncoder().encode('full_date,time,mood\n'), emptyArchiveJournal(), naming),
    (error: Error) => {
      assert.ok(error instanceof DaylioBackupError);
      assert.match(error.message, /not a zip/);
      return true;
    }
  );
});

test('a zip with no backup.daylio member is refused by name', async () => {
  const zip = makeZip([{ name: 'readme.txt', bytes: new TextEncoder().encode('hello') }]);

  await assert.rejects(() => daylioBackupPreview(zip, emptyArchiveJournal(), naming), (error: Error) => {
    assert.match(error.message, /backup\.daylio/);
    return true;
  });
});

test('a member that is not base64 is refused', async () => {
  const backup = await makeDaylioBackupFrom('this is not base64 !!!! @@@@');
  await assert.rejects(() => daylioBackupPreview(backup, emptyArchiveJournal(), naming), (error: Error) => {
    assert.match(error.message, /base64/);
    return true;
  });
});

test('a member that decodes to something other than JSON is refused', async () => {
  const backup = await makeDaylioBackupFrom(btoa('{ this is not json'));
  await assert.rejects(() => daylioBackupPreview(backup, emptyArchiveJournal(), naming), (error: Error) => {
    assert.match(error.message, /JSON/);
    return true;
  });
});

test('a payload that is not an object is refused', async () => {
  const backup = await makeDaylioBackupFrom(btoa('[1, 2, 3]'));
  await assert.rejects(() => daylioBackupPreview(backup, emptyArchiveJournal(), naming), DaylioBackupError);
});

test('the malformed fixture is refused, naming the record rather than the file', async () => {
  const malformed = await makeMalformedDaylioBackup();
  await assert.rejects(
    () => daylioBackupPreview(malformed, emptyArchiveJournal(), naming),
    (error: Error) => {
      assert.ok(error instanceof DaylioBackupError);
      assert.equal(error.kind, 'record');
      assert.match(error.message, /entry 1 names mood 404/);
      return true;
    }
  );
});

test('a refusal carries the kind a screen branches on, not just its wording', async () => {
  const platform = { ...daylioPayload(), metadata: { platform: 'ios' } };
  await assert.rejects(() => preview(platform), (error: Error) => {
    assert.equal((error as DaylioBackupError).kind, 'platform');
    return true;
  });

  await assert.rejects(
    () => daylioBackupPreview(new TextEncoder().encode('nope'), emptyArchiveJournal(), naming),
    (error: Error) => {
      assert.equal((error as DaylioBackupError).kind, 'unreadable');
      return true;
    }
  );
});

test('an entry whose only content is an unreadable mood reaches the preview rather than aborting it', async () => {
  const moods = (daylioPayload().customMoods as Record<string, unknown>[]).map((mood) => ({
    ...mood,
    mood_group_id: 41
  }));
  // Entry 2 carries a mood and a tag; strip the tag and it is a mood-only
  // entry whose mood cannot be placed, which is exactly the case the
  // preview exists to hold open.
  const entries = (daylioPayload().dayEntries as Record<string, unknown>[]).map((entry) =>
    entry.id === 2 ? { ...entry, tags: [] } : entry
  );

  const result = await preview({ ...daylioPayload(), customMoods: moods, dayEntries: entries });
  assert.equal(result.entryCount, 3);
  assert.equal(result.unmappedMoodNames.length, 3);
  assert.equal(entryOn(result, '2026-01-16').mood, null);
});

test('an entry carrying only a tag row that has no name of its own is refused, not mis-blamed', async () => {
  // A nameless tag cannot be imported, so the preview names it - and an
  // entry pointing at it must not be told the row is missing, because it
  // is not.
  const tags = (daylioPayload().tags as Record<string, unknown>[]).map((tag) =>
    tag.id === 83 ? { ...tag, name: '' } : tag
  );

  const result = await preview(withCollection('tags', tags));
  assert.deepEqual(result.skipped.find((skip) => skip.kind === 'unnamed'), { kind: 'unnamed', count: 1 });
  // Entry 1 names tags 14 and 83; only the named one arrives.
  assert.equal(entryOn(result, '2026-01-15').tags.length, 1);
});

test('a milestone with no name of its own is named as skipped rather than dropped in silence', async () => {
  const milestones = (daylioPayload().milestones as Record<string, unknown>[]).map((milestone) =>
    milestone.id === 2 ? { ...milestone, name: '' } : milestone
  );

  const result = await preview(withCollection('milestones', milestones));
  assert.equal(result.milestoneCount, 1);
  assert.deepEqual(result.skipped.find((skip) => skip.kind === 'unnamed'), { kind: 'unnamed', count: 1 });
});

test('an entry with no readable date is refused, naming the entry', async () => {
  const entries = [{ id: 12, mood: 1, year: 2026, month: 0 }];

  await assert.rejects(() => preview(withCollection('dayEntries', entries)), (error: Error) => {
    assert.match(error.message, /entry 12 has no readable date/);
    return true;
  });
});

test('an entry carrying nothing at all is refused, naming the entry', async () => {
  const entries = [{ id: 5, year: 2026, month: 0, day: 3, hour: 1, minute: 0, mood: -1, tags: [], assets: [] }];

  await assert.rejects(() => preview(withCollection('dayEntries', entries)), (error: Error) => {
    assert.match(error.message, /entry 5/);
    return true;
  });
});

/* Identity: the same file twice is the same work, and re-importing is a
   no-op through the ordinary merge. */

test('the same backup resolves the same uuids every time', async () => {
  const first = await preview();
  const second = await preview();

  assert.deepEqual(
    first.journal.entries.map((entry) => entry.uuid),
    second.journal.entries.map((entry) => entry.uuid)
  );
  assert.deepEqual(
    first.journal.milestones.map((milestone) => milestone.id),
    second.journal.milestones.map((milestone) => milestone.id)
  );
  assert.deepEqual(first.journal.dimensions[0].key, second.journal.dimensions[0].key);
});

test('re-importing what the journal already holds adds nothing', async () => {
  const first = await preview();
  const second = await daylioBackupPreview(await makeDaylioBackup(), first.journal, naming);

  assert.equal(second.entryCount, 0);
  assert.deepEqual(second.journal.entries, []);
  assert.equal(second.milestoneCount, 0);
  assert.equal(second.newTagCount, 0);
  assert.equal(second.photoCount, 0);
  assert.equal(second.templateCount, 0);
  assert.equal(second.dimensionCount, 0);
});

/* Detection, for the registry. */

test('detectDaylioBackup sniffs a zip carrying a backup.daylio member', async () => {
  assert.ok(detectDaylioBackup(await makeDaylioBackup()));
});

test('detectDaylioBackup refuses a CSV, a plain zip and an empty file', async () => {
  assert.ok(!detectDaylioBackup(new TextEncoder().encode('full_date,time,mood,activities,note_title,note\n')));
  assert.ok(!detectDaylioBackup(makeZip([{ name: 'notes.txt', bytes: new TextEncoder().encode('x') }])));
  assert.ok(!detectDaylioBackup(new Uint8Array(0)));
});

test('detection does not throw on a truncated zip: it declines', async () => {
  const whole = await makeDaylioBackup();
  assert.equal(detectDaylioBackup(whole.slice(0, 12)), false);
});
