import assert from 'node:assert/strict';
import { test } from 'vitest';
import { startOfDayTimestamp } from '../epochDay.ts';
import { PREFERENCE_DEFAULTS } from '../prefs/catalogue.ts';
import { portablePreferences } from './payload.ts';
import type { ArchiveEntry, ArchiveJournal } from './payload.ts';
import { journalCsv, journalJson, type PlainNaming } from './plain.ts';

/* January, so that local midnight plus a whole number of hours reads back
   as that hour in every timezone: the CSV's time column is wall-clock
   local, and a fixture on a DST transition day would read an hour off in
   whichever zone the test happens to run in. */
const JAN_15 = 20468;
const JAN_16 = 20469;

const at = (epochDay: number, hour: number, minute: number) =>
  startOfDayTimestamp(epochDay) + (hour * 60 + minute) * 60_000;

/** Built-in wording, which storage does not hold (builtins.ts). The screen
    passes paraglide's lookups here; the two below are enough to prove a
    key is asked for rather than the empty name a built-in row carries. */
const naming: PlainNaming = {
  dimensionName: (key) => (key === 'femininity' ? 'Femininity' : key),
  tagLabel: (id) => (id === 'e-happy' ? 'happy' : id)
};

function entry(fields: Partial<ArchiveEntry>): ArchiveEntry {
  return {
    uuid: 'e1',
    epochDay: JAN_15,
    timestamp: at(JAN_15, 7, 15),
    mood: null,
    note: '',
    dims: {},
    tags: [],
    photos: [],
    ...fields
  };
}

function journalOf(entries: ArchiveEntry[]): ArchiveJournal {
  return {
    dimensions: [
      { key: 'femininity', name: '', low: '', high: '', min: 0, max: 100, builtIn: true, hidden: false },
      { key: 'masculinity', name: '', low: '', high: '', min: 0, max: 100, builtIn: true, hidden: false },
      { key: 'voice', name: 'Voice', low: 'off', high: 'mine', min: 0, max: 10, builtIn: false, hidden: false },
      { key: 'binder', name: 'Binder hours', low: 'none', high: 'all day', min: 0, max: 12, builtIn: false, hidden: true }
    ],
    presets: [],
    tagGroups: [
      {
        key: 'emotions',
        name: '',
        enabled: true,
        builtIn: true,
        tags: [
          { id: 'e-happy', label: '', builtIn: true, hidden: false },
          { id: 'tag-uuid', label: 'karaoke', builtIn: false, hidden: false }
        ]
      }
    ],
    entries,
    milestones: [],
    labResults: [],
    measurements: [],
    reminders: []
  };
}

const rows = (csv: string) => csv.split('\n');

test('the header is date, time, mood, a column per dimension, tags, note', () => {
  const csv = journalCsv(journalOf([entry({ dims: { femininity: 60, voice: 7, binder: 3 } })]), naming);
  assert.equal(rows(csv)[0], 'date,time,mood,Femininity,Voice,Binder hours,tags,note');
});

test('a dimension nothing was ever logged against gets no column', () => {
  const csv = journalCsv(journalOf([entry({ dims: { femininity: 60 } })]), naming);
  assert.equal(rows(csv)[0], 'date,time,mood,Femininity,tags,note');
});

test('values are native units, and an entry that skipped a dimension leaves it empty', () => {
  const csv = journalCsv(
    journalOf([
      entry({ mood: 4, dims: { femininity: 60, voice: 7 } }),
      entry({ uuid: 'e2', epochDay: JAN_16, timestamp: at(JAN_16, 21, 40), dims: { voice: 3 } })
    ]),
    naming
  );
  assert.deepEqual(rows(csv).slice(1), [
    '2026-01-15,07:15,4,60,7,,',
    '2026-01-16,21:40,,,3,,',
    ''
  ]);
});

test('tags come out as the words the app shows, built-in ones included', () => {
  const csv = journalCsv(journalOf([entry({ tags: ['e-happy', 'tag-uuid'] })]), naming);
  assert.equal(rows(csv)[1], '2026-01-15,07:15,,happy; karaoke,');
});

test('a note with commas, quotes and newlines survives as one field', () => {
  const note = 'Told them my name, out loud.\nShe said "finally".';
  const csv = journalCsv(journalOf([entry({ note })]), naming);
  assert.equal(
    csv,
    ['date,time,mood,tags,note', '2026-01-15,07:15,,,"Told them my name, out loud.', 'She said ""finally""."', ''].join('\n')
  );
});

test('a journal with no entries is still a readable file', () => {
  assert.equal(journalCsv(journalOf([]), naming), 'date,time,mood,tags,note\n');
});

test('the JSON carries the whole journal and the settings that travel with it', () => {
  const journal = journalOf([entry({ mood: 4, note: 'zażółć gęślą jaźń', dims: { voice: 7 } })]);
  const parsed = JSON.parse(journalJson(journal, portablePreferences({ ...PREFERENCE_DEFAULTS, name: 'Alicja' })));

  assert.equal(parsed.formatVersion, 1);
  assert.deepEqual(parsed.journal, journal);
  assert.equal(parsed.preferences.name, 'Alicja');
  // Device-local settings do not leave the device in an archive (ADR-0003),
  // and a file anyone can read is no place to start.
  assert.equal(parsed.preferences.pinHash, undefined);
});

/* The text, not the parse: what someone opens is a file, so the file is
   what this pins - the key order, the indentation and the version at the
   top of it, which a parsed comparison would let change silently. */
test('the JSON reads as a file, indented, version first', () => {
  const empty: ArchiveJournal = {
    dimensions: [],
    presets: [],
    tagGroups: [],
    entries: [],
    milestones: [],
    labResults: [],
    measurements: [],
    reminders: []
  };
  const written = journalJson(empty, portablePreferences({ ...PREFERENCE_DEFAULTS, name: 'Ola', palette: 'lesbian' }));

  assert.equal(
    written.split('\n').slice(0, 13).join('\n'),
    `{
  "formatVersion": 1,
  "journal": {
    "dimensions": [],
    "presets": [],
    "tagGroups": [],
    "entries": [],
    "milestones": [],
    "labResults": [],
    "measurements": [],
    "reminders": []
  },
  "preferences": {`
  );
  assert.match(written, /\n {4}"name": "Ola",\n {4}"activePreset": "p-btw",/);
  assert.match(written, /\n {4}"palette": "lesbian",/);
});
