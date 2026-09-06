/* The `.daylio` fixture pair (phase 7 ticket 09).

   Built here rather than checked in as two binaries, for one reason: the
   source file this format was learned from was a real personal journal and
   has been deleted, so the fixture is the only written record of the shape
   besides the ticket. A JSON literal a reviewer can read and edit is worth
   more than an opaque 4KB zip, and it still produces a real zip, written
   by the same library that reads one (fflate) - a real base64 member, real
   deflate on one entry, real leading-slash asset paths.

   Nothing here came from the real file. Every name, note and checksum is
   invented, in the shapes the ticket documents:

     - `dayEntries.month` 0-based, `milestones.month` 1-based
     - `note` and `note_title` absent rather than empty
     - `note` bodies as HTML
     - `mood` a foreign key into `customMoods`, whose `mood_group_id` is
       the 1-is-best scale position
     - `assets.checksum` as the file name, under `assets/photos/` for type
       1 and `assets/audio/` for type 2
     - `android_metadata` as JSON inside JSON
     - a `pin` at the top level, which the parser has to strip */

import { zipSync } from 'fflate';

/** One member of the fixture zip. `deflate` picks the compression per
    entry, because stored and deflated members are not the same path
    through the reader and a fixture that only exercised one would leave
    the other untested. */
interface ZipSource {
  /** Written verbatim, so a test can give the leading-slash form Daylio
      itself uses. */
  name: string;
  bytes: Uint8Array;
  deflate?: boolean;
}

export const PHOTO_CHECKSUM = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1';
export const AUDIO_CHECKSUM = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb2';
const MILESTONE_CHECKSUM = 'ccccccccccccccccccccccccccccccc3';

/* Real image bytes, not just a plausible magic number: the photo half of
   the import runs each one through a decoder and a canvas, so a fixture
   that only looked like a JPEG would pass every Node test here and fail
   the moment a browser opened it. Two distinct 1x1 PNGs, one per photo
   asset, so the two never resolve to the same identity by accident. */
const png = (base64: string) => Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));

export const PHOTO_BYTES = png(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGO40bPlPwAHcAMYkRQ28AAAAABJRU5ErkJggg=='
);
export const MILESTONE_PHOTO_BYTES = png(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGPw6bnxHwAFiAKwXKVCNQAAAABJRU5ErkJggg=='
);
/** An ISO base media header, which is what the type sniff reads: nothing
    plays a fixture, so the bytes past it are not the point. */
export const AUDIO_BYTES = new Uint8Array([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70]);

/** A well-formed Android v15 payload, fresh on every call so a test can
    bend one collection without reaching the next test. */
export function daylioPayload(): Record<string, unknown> {
  return {
    version: 15,
    isReminderOn: true,
    daysInRowLongestChain: 41,
    moodIconsPackId: 2,
    moodIconsDefaultFreePackId: 1,
    preferredMoodIconsIdsForMoodIdsForIconsPack: { '2': [1, 2, 3] },
    /* Cleartext, and the reason the parse boundary strips it. Absent from
       the observed Android file; found in an iOS one and documented in an
       Android sample, so the fixture carries it and the parser must not. */
    pin: '1234',
    pinMode: 1,
    metadata: {
      android_version: 34,
      backup_version: 15,
      created_at: 1_756_000_000_000,
      is_auto_backup: false,
      number_of_entries: 3,
      number_of_photos: 2,
      photos_size: 4096,
      platform: 'android'
    },
    customMoods: [
      // A built-in: no name of its own, localised by Daylio at runtime,
      // which is why the CSV export has a label and this table does not.
      { id: 1, custom_name: '', predefined_name_id: 1, mood_group_id: 1, mood_group_order: 0, icon_id: 1, state: 0, createdAt: 1_600_000_000_000 },
      // User-defined, in Polish, absent from daylio.ts's MOODS table -
      // the mood the CSV path cannot read and this one resolves.
      { id: 7, custom_name: 'spokojnie', predefined_name_id: -1, mood_group_id: 3, mood_group_order: 1, icon_id: 24, state: 0, createdAt: 1_600_000_000_000 },
      { id: 9, custom_name: 'nie dało się', predefined_name_id: -1, mood_group_id: 5, mood_group_order: 2, icon_id: 31, state: 0, createdAt: 1_600_000_000_000 }
    ],
    tags: [
      { id: 14, name: 'praca', id_tag_group: 6, icon: 3, order: 0, state: 0, createdAt: 1_600_000_000_000 },
      { id: 83, name: 'terapia', id_tag_group: 22, icon: 9, order: 1, state: 0, createdAt: 1_600_000_000_000 }
    ],
    tag_groups: [
      { id: 6, name: 'Codziennie', id_predefined: 6, order: 0, is_expanded: true },
      { id: 22, name: 'Zdrowie', id_predefined: -1, order: 1, is_expanded: false }
    ],
    tag_colors: [],
    dayEntries: [
      {
        id: 1,
        datetime: 1_768_465_800_000,
        year: 2026,
        // 0-based: January. A 1-based read lands in February.
        month: 0,
        day: 15,
        hour: 8,
        minute: 30,
        timeZoneOffset: 3_600_000,
        mood: 7,
        tags: [14, 83],
        assets: [101, 102],
        scaleValues: [{ id_scale: 1, id_text_scale_value: 12 }],
        isFavorite: true,
        note: 'a <b>good</b> morning<br>then a walk',
        note_title: 'Piątek'
      },
      {
        // No `note` and no `note_title` key at all, which is how Daylio
        // writes an entry with no note rather than as "".
        id: 2,
        datetime: 1_768_550_000_000,
        year: 2026,
        month: 0,
        day: 16,
        hour: 21,
        minute: 5,
        timeZoneOffset: 3_600_000,
        mood: 1,
        tags: [14],
        assets: [],
        scaleValues: [],
        isFavorite: false
      },
      {
        id: 3,
        datetime: 1_772_000_000_000,
        year: 2026,
        month: 1,
        day: 25,
        hour: 12,
        minute: 0,
        timeZoneOffset: 7_200_000,
        mood: 9,
        tags: [],
        assets: [],
        scaleValues: [],
        isFavorite: false,
        note: '<ul><li>bloods</li><li>call the clinic</li></ul>'
      }
    ],
    milestones: [
      {
        id: 1,
        name: 'came out to my sister',
        note: 'in the car, parked outside hers',
        // 1-based, in the same file where dayEntries.month is 0-based, and
        // decades before the earliest entry.
        year: 1999,
        month: 12,
        day: 31,
        createdAt: 1_700_000_000_000,
        createdAtOffset: 3_600_000,
        assetId: 103,
        hasCustomPhoto: true,
        isAnniversary: true,
        categoryId: 2,
        predefinedMilestoneId: 0,
        remindersValue: '2,4',
        stateValue: 0
      },
      {
        id: 2,
        name: 'first appointment',
        note: '',
        year: 2026,
        month: 3,
        day: 4,
        createdAt: 1_700_000_000_000,
        createdAtOffset: 3_600_000,
        assetId: -1,
        hasCustomPhoto: false,
        isAnniversary: false,
        categoryId: 0,
        predefinedMilestoneId: 4,
        remindersValue: '',
        stateValue: 0
      }
    ],
    goals: [
      {
        id: 1,
        goal_id: 1,
        // No `name`: a challenge-sourced goal, as 2 of 16 observed were.
        id_tag: 14,
        id_icon: 1,
        id_avatar: 2,
        id_challenge: 4,
        order: 0,
        repeat_type: 1,
        // A 7-bit weekday bitmask, not a count of 127.
        repeat_value: 127,
        end_date: -1,
        created_at: 1_700_000_000_000,
        state: 0,
        reminder_enabled: true,
        reminder_hour: 9,
        reminder_minute: 0
      },
      {
        id: 2,
        goal_id: 2,
        name: 'therapy',
        id_tag: -1,
        id_icon: 3,
        id_avatar: 1,
        id_challenge: -1,
        order: 1,
        repeat_type: 2,
        repeat_value: 3,
        end_date: 1_800_000_000_000,
        created_at: 1_700_000_000_000,
        state: 1,
        reminder_enabled: false,
        reminder_hour: 0,
        reminder_minute: 0
      }
    ],
    goalEntries: [{ id: 1, goalId: 1, year: 2026, month: 1, day: 15, hour: 9, minute: 0, second: 0, createdAt: 1_768_000_000_000 }],
    goalSuccessWeeks: [{ goal_id: 1, week: 3, year: 2026, create_at_day: 20, create_at_month: 1, create_at_year: 2026 }],
    assets: [
      {
        id: 101,
        checksum: PHOTO_CHECKSUM,
        type: 1,
        createdAt: 1_768_465_800_000,
        createdAtOffset: 3_600_000,
        // JSON inside JSON: it has to be parsed a second time.
        android_metadata: JSON.stringify({ Name: 'IMG_0001.jpg', LastModified: 1_768_465_800_000 })
      },
      {
        id: 102,
        checksum: AUDIO_CHECKSUM,
        type: 2,
        createdAt: 1_768_465_900_000,
        createdAtOffset: 3_600_000,
        android_metadata: JSON.stringify({ Name: 'AUD_0001', LastModified: 1_768_465_900_000, Duration: 7400 })
      },
      {
        id: 103,
        checksum: MILESTONE_CHECKSUM,
        type: 1,
        createdAt: 1_700_000_000_000,
        createdAtOffset: 3_600_000,
        android_metadata: JSON.stringify({ Name: 'IMG_0002.jpg', LastModified: 1_700_000_000_000 })
      }
    ],
    scales: [
      {
        id: 1,
        name: 'Sen',
        type: 0,
        predefined: 1,
        number_scale: { id: 1, id_scale: 1, min: 1, max: 5, metric: '', predefined_unit: 0 },
        text_scale: {
          id: 1,
          id_scale: 1,
          metric: '',
          values: [
            { id: 10, id_text_scale: 1, value: 'zle', order: 0 },
            { id: 11, id_text_scale: 1, value: 'tak sobie', order: 1 },
            { id: 12, id_text_scale: 1, value: 'dobrze', order: 2 }
          ]
        },
        color: 3,
        icon_id: 7,
        trend: 1,
        state: 0,
        order: 0,
        created_at: 1_700_000_000_000,
        created_at_offset: 3_600_000,
        is_expanded_in_form: true,
        is_expanded_in_stats: true,
        is_expanded_in_stats_detail: false
      }
    ],
    writingTemplates: [
      { id: 1, title: 'Evening', body: '<p>What happened today?</p><p>How did it feel?</p>', order: 0, predefined_template_id: -1 }
    ],
    reminders: [{ id: 1, hour: 21, minute: 30, state: 0, custom_text_enabled: false }],
    achievements: [{ name: 'AC_ENTRIES', AC_ENTRIES_LEVEL: 3, AC_ENTRIES_COUNT: 1456 }],
    prefs: [{ key: 'MOOD_ORDER', pref_name: 'default', value: 1 }]
  };
}

/** The asset members of a well-formed backup, in Daylio's own
    leading-slash form, with a 1-based month directory. */
export function daylioAssetFiles(): ZipSource[] {
  return [
    { name: `/assets/photos/2026/1/${PHOTO_CHECKSUM}`, bytes: PHOTO_BYTES },
    { name: `/assets/audio/2026/1/${AUDIO_CHECKSUM}`, bytes: AUDIO_BYTES },
    { name: `/assets/photos/1999/12/${MILESTONE_CHECKSUM}`, bytes: MILESTONE_PHOTO_BYTES, deflate: true }
  ];
}

/** The payload wrapped the way a real backup wraps it: base64 of the
    UTF-8 JSON, newline-wrapped as the observed file was, as
    `backup.daylio` inside a zip.

    Async only because every caller awaits it and the builder it replaced
    had to be - keeping the signature saves rewriting every test for a
    difference that is not theirs. */
export async function makeDaylioBackup(
  payload: unknown = daylioPayload(),
  assets: readonly ZipSource[] = daylioAssetFiles()
): Promise<Uint8Array> {
  return makeDaylioBackupFrom(base64(new TextEncoder().encode(JSON.stringify(payload))), assets);
}

/** The members as one zip. Exported so a test can build an archive that
    is a zip and nothing else - one with no `backup.daylio` in it. */
export function makeZip(sources: readonly ZipSource[]): Uint8Array {
  const members: Record<string, [Uint8Array, { level: 0 | 6 }]> = {};
  for (const source of sources) members[source.name] = [source.bytes, { level: source.deflate ? 6 : 0 }];
  return zipSync(members);
}

/** The malformed half of the fixture pair the spec asks every source for
    (`daylio-malformed.csv` is the CSV's). One file that is a real zip with
    a real base64 member and a real JSON object inside it - so it gets past
    every container check - and is then wrong in the way that matters: an
    entry pointing at a mood the file has no row for.

    Kept as one named file rather than only as the per-case payloads the
    tests bend inline, because "what does this source do with a broken
    file" should have one answer somebody can run. */
export async function makeMalformedDaylioBackup(): Promise<Uint8Array> {
  const payload = daylioPayload();
  const entries = (payload.dayEntries as Record<string, unknown>[]).map((entry) => ({ ...entry, mood: 404 }));
  return makeDaylioBackup({ ...payload, dayEntries: entries });
}

/** A backup whose `backup.daylio` member holds exactly `member`, for the
    tests about a container that is not readable at all. */
export async function makeDaylioBackupFrom(member: string, assets: readonly ZipSource[] = []): Promise<Uint8Array> {
  return makeZip([{ name: 'backup.daylio', bytes: new TextEncoder().encode(member), deflate: true }, ...assets]);
}

/** Base64 in 76-character lines: the observed file's own wrapping, which
    is what the parser has to strip before decoding. */
function base64(bytes: Uint8Array): string {
  const raw = btoa(String.fromCharCode(...bytes));
  return (raw.match(/.{1,76}/g) ?? []).join('\n');
}
