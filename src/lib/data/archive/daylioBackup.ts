/* A Daylio `.daylio` backup becomes an archive-shaped merge (phase 7
   ticket 09), the same way daylio.ts does it for the CSV: parse and
   resolve here, hand the resolved journal to the ordinary skip-existing
   merge, and never write on the way to finding a bad record.

   Why a second Daylio source at all, when the CSV importer works. The CSV
   carries a mood as a localised label, so daylio.ts has to guess a mood's
   position from a hardcoded English and Polish table and give up on
   anything it cannot match. In the file this format was learned from, 10
   of 15 moods were user-defined and in Polish - every one of them a mood
   the CSV path mismaps or refuses. The backup carries the mood definition
   table itself, so the position is a stated fact rather than a guess.
   It also carries milestones, the person's own tag groups, custom scales,
   writing templates, and the photos and voice notes a CSV has no room
   for.

   The format is undocumented by its vendor, so the shape it is read at is
   the ticket's own field reference, extracted from a real backup that has
   since been deleted. Two consequences run through this file:

     - **Every field is optional and every unknown key is tolerated.**
       Android stayed at `version: 15` for years while the schema gained
       fields, so the version number cannot gate anything. It is reported
       when it is not the expected one and the import proceeds.
     - **The two month conventions are real.** `dayEntries.month` is
       0-based and `milestones.month` is 1-based, in the same file. Each
       has its own test, because getting one wrong shifts dates
       plausibly and raises nothing.

   The failure split is daylio.ts's, unchanged: a structural problem
   throws with the record named, a semantic gap is listed in the preview
   and confirmed with the person looking at it, and the preview is the
   exact work a commit performs.

   Unzipping goes through fflate rather than the platform's own
   DecompressionStream, for the reason transtracks.ts found first: this
   app's WebView floor is Chrome 87 (capacitor.config.ts) and the
   'deflate-raw' format only arrived in Chrome 103, so the platform
   decoder would fail on the devices this app supports. One zip reader in
   the repo, and it is that one.

   Identity is derived from content (ADR-0002), because Daylio's ids are
   per-collection integers unique only inside one backup. One limit worth
   stating: these uuids are not the CSV path's. A journal that imported
   the CSV and then imports the backup gets both copies, because the two
   files do not carry a shared identifier for the same day and the CSV's
   own mood label cannot be reconstructed from the backup's table. */

import { dateInputValueFromEpochDay, epochDayFromDateInputValue, localDateFromEpochDay } from '../epochDay';
import { foldText } from '../fold';
import { emptyArchiveJournal } from '../journal/archiveSections';
import { photoFileName } from '../photos/names';
import { audioMimeOf } from '../voiceRecordings/mime';
import { htmlToText } from './html';
import type { DaylioNaming } from './daylio';
import type {
  ArchiveDimension,
  ArchiveEntry,
  ArchiveEntryTemplate,
  ArchiveJournal,
  ArchiveMilestone,
  ArchiveTag,
  ArchiveTagGroup
} from './payload';
import { openZip, ZipTooLargeError, type ZipReader } from './zipReader';

/** Why a backup could not be read, for a screen that words its own
    message from it - the same split normalize.ts's UnsupportedImageError
    keeps, where `kind` is what a caller branches on and the message is the
    English diagnostic for the console.

    `platform` earns a kind of its own because it is the one refusal that
    is not a damaged file: an iOS backup is a different schema, and a
    screen calling it unreadable sends somebody looking for a fix that
    does not exist. */
export type DaylioBackupErrorKind = 'unreadable' | 'platform' | 'record';

/** A backup this app will not read, with the record or the reason named.
    The structural half of the failure split: a caller shows a message,
    and nothing has been written. */
export class DaylioBackupError extends Error {
  readonly kind: DaylioBackupErrorKind;

  constructor(kind: DaylioBackupErrorKind, message: string) {
    super(`Daylio backup ${message}`);
    this.name = 'DaylioBackupError';
    this.kind = kind;
  }
}

/** Exported for the source registry: the collections a file has to carry
    to be worth parsing at all. Not a gate on anything else in the file. */
export const REQUIRED_FIELDS = ['metadata', 'customMoods', 'dayEntries'] as const;

/** The version the field reference was extracted at. Reported when a file
    says something else, never enforced - the number did not move when the
    shape changed, so refusing on it would refuse valid files. */
const EXPECTED_VERSION = 15;

const BACKUP_MEMBER = 'backup.daylio';
/** `assets.type`: 1 is a photo, 2 is audio, and the number decides which
    directory the file is under. */
const AUDIO_ASSET = 2;
/** Daylio writes these with a leading slash; `zipName` normalises it. */
const PHOTO_DIRECTORY = 'assets/photos/';
const AUDIO_DIRECTORY = 'assets/audio/';

/** What the backup held that this app has nowhere to put, so the preview
    can say so before anybody confirms. `count` is absent where the thing
    is not a collection with a length. */
export type DaylioSkipKind =
  | 'goals'
  | 'statistics'
  | 'achievements'
  | 'preferences'
  | 'reminders'
  | 'icons'
  | 'anniversaries'
  | 'scales'
  | 'assets'
  | 'unnamed';

export interface DaylioSkip {
  kind: DaylioSkipKind;
  count?: number;
}

/** The collections the ticket puts out of scope, and which of the file's
    own keys each one counts. `statistics` covers both of Daylio's records
    about goals: the weekly success table is derived by construction, and a
    goal completion is a record of doing something this app did not import
    the goal for, so neither has anywhere to land. */
const OUT_OF_SCOPE: readonly (readonly [DaylioSkipKind, readonly string[]])[] = [
  ['goals', ['goals']],
  ['statistics', ['goalSuccessWeeks', 'goalEntries']],
  ['achievements', ['achievements']],
  ['preferences', ['prefs']],
  ['reminders', ['reminders']]
];

/** One mood as the backup defines it: the person's own name where there
    is one, null for a built-in Daylio mood, whose name lives in Daylio's
    translations rather than in the file. */
export interface DaylioMoodResolution {
  name: string | null;
  mood: number | null;
}

/** A photo or voice note the commit has to write, read from the zip on
    demand rather than held in memory: the backup is already one buffer,
    and a journal of 500 photos does not need to be a second one. */
export interface DaylioAsset {
  /** The name the journal row carries, so a caller matches an asset to
      the row that names it. */
  fileName: string;
  kind: 'photo' | 'audio';
  read(): Promise<Uint8Array>;
}

export interface DaylioBackupPreview {
  /** Net additions in every count below, so they are what a commit
      reports rather than what the file happened to contain. */
  entryCount: number;
  matchedTagCount: number;
  newTagCount: number;
  milestoneCount: number;
  dimensionCount: number;
  templateCount: number;
  photoCount: number;
  audioCount: number;
  moods: DaylioMoodResolution[];
  /** Moods whose scale position could not be read. A commit is refused
      while any remain, the way the CSV path refuses an unmapped label. */
  unmappedMoodNames: string[];
  skipped: DaylioSkip[];
  /** The file's own `version` when it is not the expected one. */
  unexpectedVersion: number | null;
  journal: ArchiveJournal;
  assets: DaylioAsset[];
}

/* ---- reading a stranger's JSON ---------------------------------------

   Every accessor below answers "what did this field say, if it said
   anything at all". None of them throws: a missing or wrongly typed
   field is absent, and whether that is fatal is the caller's decision to
   make with the record's own id in hand. */

type Record_ = Record<string, unknown>;

const isRecord = (value: unknown): value is Record_ => typeof value === 'object' && value !== null && !Array.isArray(value);

const list = (value: unknown): Record_[] => (Array.isArray(value) ? value.filter(isRecord) : []);
const ints = (value: unknown): number[] => (Array.isArray(value) ? value.filter((one) => Number.isInteger(one)) : []);
const int = (value: unknown): number | null => (Number.isInteger(value) ? (value as number) : null);
const str = (value: unknown): string => (typeof value === 'string' ? value : '');
const flag = (value: unknown): boolean => value === true;

/* ---- detection ------------------------------------------------------- */

/** Daylio writes its entry names with a leading slash
    (`/assets/photos/...`). Some readers normalise that away and fflate
    does not, so one entry would otherwise be reachable under two names or
    under neither, depending on which form the caller happened to hold. */
const zipName = (name: string): string => name.replace(/^\/+/, '');

/** Every entry name in the archive, normalised, decompressing none of
    them: `names()`'s own filter always says no, which walks the central
    directory and stops there. */
function zipNames(reader: ZipReader): string[] {
  return reader.names().map(zipName);
}

/** One entry's bytes, or null when the archive has no such entry. Named
    after normalisation, so the caller passes the form `zipNames` returned -
    the reader matches names literally, so the raw, possibly leading-slash
    form has to be found first. Decompresses that member alone, and only up
    to the shared reader's ceiling, which is what keeps a preview off the
    500 photos it is not reading, and off a member declaring more than
    this app will hold in memory at once. */
function zipRead(reader: ZipReader, name: string): Uint8Array | null {
  const raw = reader.names().find((candidate) => zipName(candidate) === name);
  return raw ? reader.read(raw) : null;
}

/** Is this a zip carrying a `backup.daylio`? A sniff, not a validation:
    whether the member decodes and what it says is `daylioBackupPreview`'s
    business, which throws by naming what was wrong.

    Non-throwing for any input, per the registry's own contract, and it
    decompresses nothing - only the directory of names is read. */
export function detectDaylioBackup(file: Uint8Array): boolean {
  try {
    return zipNames(openZip(file)).includes(BACKUP_MEMBER);
  } catch {
    return false;
  }
}

/* ---- the container --------------------------------------------------- */

/** The decoded payload, with the app-lock PIN removed before anything
    else in this file can see it. `reader` travels with it: every asset
    read for this same file has to go through the one reader, so the
    ceiling's running total covers the whole backup rather than resetting
    per member. */
function openBackup(file: Uint8Array): { payload: Record_; names: Set<string>; reader: ZipReader } {
  const reader = openZip(file);
  let names: Set<string>;
  let member: Uint8Array | null;
  try {
    names = new Set(zipNames(reader));
    member = names.has(BACKUP_MEMBER) ? zipRead(reader, BACKUP_MEMBER) : null;
  } catch (cause) {
    if (cause instanceof ZipTooLargeError) throw cause;
    throw new DaylioBackupError('unreadable', 'is not a zip file');
  }

  if (!member) throw new DaylioBackupError('unreadable', `has no ${BACKUP_MEMBER} member, so it is not a Daylio backup`);

  let json: string;
  try {
    // Newline-wrapped in the observed file, which atob will not accept.
    const raw = atob(new TextDecoder().decode(member).replace(/\s+/g, ''));
    json = new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(raw, (char) => char.charCodeAt(0)));
  } catch (cause) {
    throw new DaylioBackupError('unreadable', `holds a ${BACKUP_MEMBER} that is not base64-encoded UTF-8`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (cause) {
    throw new DaylioBackupError('unreadable', 'holds a backup.daylio that is not valid JSON');
  }
  if (!isRecord(parsed)) throw new DaylioBackupError('unreadable', 'holds a backup.daylio that is not a JSON object');

  /* The security boundary, and it is here rather than further in for a
     reason: an iOS backup and a documented Android sample both carry the
     app's lock PIN in cleartext at the top level, and nothing downstream
     - no log, no error report, no preview - should be able to reach it.
     The observed Android file had no such key, which is not a guarantee
     about the next one. */
  delete parsed.pin;
  delete parsed.pinMode;

  return { payload: parsed, names, reader };
}

/* ---- identity -------------------------------------------------------- */

/** A uuid derived from what identifies a record, so the same backup
    resolves the same identities every time and a re-import is a no-op
    through the ordinary merge (ADR-0002).

    daylio.ts derives its entry uuids the same way. Not shared with it:
    this ticket leaves that file and its tests untouched, and a helper
    moved out of it would be a change to it. */
async function derivedUuid(parts: readonly unknown[]): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(parts));
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)).slice(0, 16);
  digest[6] = (digest[6] & 0x0f) | 0x50; // name-derived, RFC 4122 variant
  digest[8] = (digest[8] & 0x3f) | 0x80;
  const hex = [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/* ---- dates ----------------------------------------------------------- */

const pad = (value: number) => String(value).padStart(2, '0');

/** A y/m/d triple as an epoch day, or null when the file did not give
    one. `monthBase` is the caller's, because the file uses both: 0 for
    `dayEntries`, 1 for `milestones`. */
function epochDayOf(record: Record_, monthBase: 0 | 1): number | null {
  const year = int(record.year);
  const month = int(record.month);
  const day = int(record.day);
  if (year === null || month === null || day === null) return null;

  const calendarMonth = month + (1 - monthBase);
  // A two-digit year is refused rather than read: `new Date(99, ...)`
  // means 1999, so a file holding a bare year would import a century off
  // with nothing to show it had happened.
  if (year < 100 || calendarMonth < 1 || calendarMonth > 12 || day < 1 || day > 31) return null;

  const value = `${year}-${pad(calendarMonth)}-${pad(day)}`;
  const epochDay = epochDayFromDateInputValue(value);
  // A 31st in a 30-day month rolls over, which is also how a wrong month
  // base shows up: refuse it rather than import a shifted date.
  return epochDay !== null && dateInputValueFromEpochDay(epochDay) === value ? epochDay : null;
}

/** The entry's own local clock, the way the CSV path builds one: the
    file's y/m/d/hour/minute are local wall-clock readings, and its
    `datetime` is the UTC instant behind them. Reading the wall clock is
    what keeps a day where the person put it. */
function timestampOf(epochDay: number, record: Record_): number {
  const date = localDateFromEpochDay(epochDay);
  date.setHours(int(record.hour) ?? 0, int(record.minute) ?? 0, 0, 0);
  return date.getTime();
}

/* ---- asset types ----------------------------------------------------- */

const magic = (bytes: Uint8Array, at: number, text: string): boolean =>
  bytes.length >= at + text.length && [...text].every((char, i) => bytes[at + i] === char.charCodeAt(0));

/** Audio containers Daylio's recorder and its imports produce, by the
    extension this app should store them under. The bytes decide, because
    a backup's asset files carry no extension at all. */
function audioExtension(bytes: Uint8Array): string | null {
  if (magic(bytes, 4, 'ftyp')) return '.m4a';
  if (magic(bytes, 0, 'OggS')) return '.ogg';
  if (magic(bytes, 0, '#!AMR')) return '.amr';
  if (magic(bytes, 0, 'RIFF') && magic(bytes, 8, 'WAVE')) return '.wav';
  if (magic(bytes, 0, 'ID3') || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)) return '.mp3';
  if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return '.webm';
  return null;
}

/** Whether the photo pipeline can be expected to decode these bytes.
    HEIC is checked out by name because Chromium cannot decode it at all
    (photos/bytes.ts), and anything unrecognised is left out rather than
    handed to a commit that would fail partway through a journal. */
function isDecodableImage(bytes: Uint8Array): boolean {
  if (magic(bytes, 4, 'ftyp')) return magic(bytes, 8, 'avif') || magic(bytes, 8, 'avis');
  return (
    (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) ||
    magic(bytes, 1, 'PNG') ||
    magic(bytes, 0, 'GIF8') ||
    (magic(bytes, 0, 'RIFF') && magic(bytes, 8, 'WEBP')) ||
    magic(bytes, 0, 'BM')
  );
}

interface AssetRow {
  checksum: string;
  type: number;
  /** From `android_metadata`, which is a JSON string inside the JSON and
      has to be parsed a second time. Used as the fallback extension for
      audio whose own bytes name no container. */
  sourceName: string;
}

function assetRows(payload: Record_): Map<number, AssetRow> {
  const rows = new Map<number, AssetRow>();
  for (const asset of list(payload.assets)) {
    const id = int(asset.id);
    const checksum = str(asset.checksum);
    if (id === null || !checksum) continue;

    let sourceName = '';
    try {
      const metadata: unknown = JSON.parse(str(asset.android_metadata));
      if (isRecord(metadata)) sourceName = str(metadata.Name);
    } catch {
      // Not present, not a string, or not JSON after all. The bytes are
      // the primary answer about a file's type; this was the fallback.
    }
    rows.set(id, { checksum, type: int(asset.type) ?? 1, sourceName });
  }
  return rows;
}

/* ---- the preview ----------------------------------------------------- */

export async function daylioBackupPreview(
  file: Uint8Array,
  existing: ArchiveJournal,
  naming: DaylioNaming
): Promise<DaylioBackupPreview> {
  const { payload, names: zipEntries, reader } = openBackup(file);

  const platform = str((isRecord(payload.metadata) ? payload.metadata : {}).platform);
  if (platform !== 'android') {
    /* iOS is a different schema rather than a superset of this one - a
       different version number, thirty top-level keys against Android's
       twenty-two, no writing templates, and tags with no group - so it is
       declined by name rather than read as far as it happens to go. */
    throw new DaylioBackupError(
      'platform',
      `came from ${platform || 'an unnamed platform'}, and this app reads Android backups only`
    );
  }

  const version = int(payload.version);
  const assets = assetRows(payload);
  const skipped: DaylioSkip[] = [];
  const journal = emptyArchiveJournal();

  /* Assets, resolved once: a checksum is the file name in the zip, and
     `type` selects which directory it is under. A row whose file is not
     in the archive is left out and counted, rather than becoming a
     journal row pointing at a file that never arrives. */
  const missingAssets = new Set<number>();
  /** Assets a row named that could not be brought across, so the count
      in the preview is of attachments somebody will notice missing
      rather than of rows nothing referenced. */
  const unimported = new Set<number>();
  const plannedAssets = new Map<number, DaylioAsset>();
  const assetPaths = new Map<number, string>();
  for (const [id, asset] of assets) {
    const directory = asset.type === AUDIO_ASSET ? AUDIO_DIRECTORY : PHOTO_DIRECTORY;
    const path = [...zipEntries].find((name) => name.startsWith(directory) && name.endsWith(`/${asset.checksum}`));
    if (!path) {
      missingAssets.add(id);
      continue;
    }
    assetPaths.set(id, path);
  }

  const readAsset = async (id: number): Promise<Uint8Array> => {
    const bytes = zipRead(reader, assetPaths.get(id)!);
    if (!bytes) throw new DaylioBackupError('record', `could not read the file for asset ${id}`);
    return bytes;
  };

  /* Moods: the table this source exists for. A position is
     `mood_group_id`, where 1 is Daylio's best day and 5 its worst, so the
     two scales are inverted with respect to each other - this app's mood
     1 is "awful" and 5 is "great". */
  const moodOf = new Map<number, DaylioMoodResolution>();
  for (const mood of list(payload.customMoods)) {
    const id = int(mood.id);
    if (id === null) continue;
    const group = int(mood.mood_group_id);
    const custom = str(mood.custom_name);
    moodOf.set(id, {
      name: custom || null,
      mood: group !== null && group >= 1 && group <= 5 ? 6 - group : null
    });
  }
  const moods = [...moodOf.values()];
  const unmappedMoodNames = moods
    .filter((mood) => mood.mood === null)
    .map((mood) => mood.name ?? 'a mood with no name of its own');

  /* Tag groups and tags. The person's own groups, unlike the CSV path,
     which has one group to put everything in and no way to know better.
     A tag whose label already names a tag in this journal resolves to
     that one instead: a duplicate tag is worse than a tag sitting in a
     group it did not come from. */
  const matches = tagMatches(existing, naming);
  const groupNames = new Map<number, string>();
  for (const group of list(payload.tag_groups)) {
    const id = int(group.id);
    if (id !== null) groupNames.set(id, str(group.name));
  }

  const groups = new Map<string, ArchiveTagGroup>();
  const tagIds = new Map<number, string>();
  /* Rows the file holds that carry no name of their own. Nothing can be
     imported from a tag or a milestone that is only an id, so they are
     counted for the preview rather than dropped in silence - and the ids
     are remembered, so an entry naming one is not accused of pointing at a
     row that is not there. */
  const nameless = new Set<number>();
  let unnamed = 0;
  let matchedTagCount = 0;
  for (const tag of list(payload.tags)) {
    const id = int(tag.id);
    const label = str(tag.name);
    if (id === null) continue;
    if (!label) {
      nameless.add(id);
      unnamed += 1;
      continue;
    }

    const matched = matches.get(foldText(label));
    if (matched) {
      tagIds.set(id, matched);
      matchedTagCount += 1;
      continue;
    }

    const groupId = int(tag.id_tag_group);
    if (groupId !== null && groupId >= 0 && !groupNames.has(groupId)) {
      throw new DaylioBackupError('record', `tag ${id} names tag group ${groupId}, which the backup has no group for`);
    }

    const named = groupId === null || groupId < 0 ? null : groupNames.get(groupId)!;
    // A tag with no group of its own goes where the CSV path puts every
    // imported tag: the built-in group kept for exactly that, whose name
    // is localised rather than carried in the file.
    const key = named === null ? 'imported' : await derivedUuid(['daylio-tag-group', foldText(named)]);
    let group = groups.get(key);
    if (!group) {
      group = { key, name: named ?? '', enabled: true, builtIn: named === null, tags: [] };
      groups.set(key, group);
    }
    const tagId = await derivedUuid(['daylio-tag', foldText(label)]);
    group.tags.push({ id: tagId, label, builtIn: false, hidden: false } satisfies ArchiveTag);
    tagIds.set(id, tagId);
  }
  journal.tagGroups = [...groups.values()];
  const newTagCount = journal.tagGroups.reduce((count, group) => count + group.tags.length, 0);

  /* Custom scales become custom gender dimensions: one named thing an
     entry logs a number against, between two labelled ends, which is
     what a Daylio scale is too. The entry's own value references a text
     scale value by id, so a scale whose value list this app cannot read
     ids out of is left out and named - a scale imported without its
     values would be an empty dimension nobody logged anything on. */
  const dimensionOf = new Map<number, { key: string; position: Map<number, number> }>();
  const existingDimensions = new Set(existing.dimensions.map((dimension) => dimension.key));
  let unreadableScales = 0;
  for (const scale of list(payload.scales)) {
    const id = int(scale.id);
    const name = str(scale.name);
    const values = list(isRecord(scale.text_scale) ? scale.text_scale.values : null);
    const ids = values.map((value) => int(value.id)).filter((one): one is number => one !== null);
    if (id === null || !name || ids.length < 2 || ids.length !== values.length) {
      if (id !== null) unreadableScales += 1;
      continue;
    }

    const key = await derivedUuid(['daylio-scale', foldText(name)]);
    // Resolved either way: an entry's own value has to name this key even
    // when the dimension itself is already here and travels as nothing.
    dimensionOf.set(id, { key, position: new Map(ids.map((valueId, index) => [valueId, index + 1])) });
    if (existingDimensions.has(key)) continue;
    journal.dimensions.push({
      key,
      name,
      low: str(values[0].value) || String(1),
      high: str(values[values.length - 1].value) || String(values.length),
      min: 1,
      max: values.length,
      builtIn: false,
      hidden: false
    } satisfies ArchiveDimension);
  }
  if (unreadableScales > 0) skipped.push({ kind: 'scales', count: unreadableScales });

  /* Entries. */
  const existingEntries = new Set(existing.entries.map((entry) => entry.uuid));
  const seen = new Set<string>();
  for (const record of list(payload.dayEntries)) {
    const id = int(record.id);
    const named = id === null ? 'an entry with no id' : `entry ${id}`;

    const epochDay = epochDayOf(record, 0);
    if (epochDay === null) throw new DaylioBackupError('record', `${named} has no readable date`);

    const moodId = int(record.mood);
    /* Whether the entry logged a mood at all, which is not the same
       question as whose position could be read. An entry logged against a
       mood this app cannot place is still an entry that carries something,
       so it must not be mistaken below for an empty record: the unreadable
       position is a semantic gap, it is listed in the preview, and it
       blocks the commit until it is resolved. */
    let logged = false;
    let mood: number | null = null;
    if (moodId !== null && moodId > 0) {
      const resolved = moodOf.get(moodId);
      if (!resolved) {
        throw new DaylioBackupError('record', `${named} names mood ${moodId}, which the backup has no mood row for`);
      }
      logged = true;
      mood = resolved.mood;
    }

    const title = htmlToText(str(record.note_title));
    const body = htmlToText(str(record.note));
    const note = [title, body].filter((part) => part.trim().length > 0).join('\n');

    const tags: string[] = [];
    for (const tagId of ints(record.tags)) {
      const resolved = tagIds.get(tagId);
      if (resolved) tags.push(resolved);
      else if (!nameless.has(tagId)) {
        throw new DaylioBackupError('record', `${named} names tag ${tagId}, which the backup has no tag row for`);
      }
    }

    const dims: Record<string, number> = {};
    for (const value of list(record.scaleValues)) {
      const dimension = dimensionOf.get(int(value.id_scale) ?? -1);
      const position = dimension?.position.get(int(value.id_text_scale_value) ?? -1);
      if (dimension && position !== undefined) dims[dimension.key] = position;
    }

    /* Resolved before the attachments are, so an entry this journal
       already holds costs nothing: its assets are neither read out of the
       zip nor counted as work a commit would do. */
    const uuid = await derivedUuid([
      dateInputValueFromEpochDay(epochDay),
      `${pad(int(record.hour) ?? 0)}:${pad(int(record.minute) ?? 0)}`,
      mood,
      note
    ]);
    if (existingEntries.has(uuid) || seen.has(uuid)) continue;
    seen.add(uuid);

    const photos: ArchiveEntry['photos'] = [];
    const recordings: ArchiveEntry['recordings'] = [];
    for (const assetId of ints(record.assets)) {
      const asset = assets.get(assetId);
      if (!asset) {
        throw new DaylioBackupError('record', `${named} names asset ${assetId}, which the backup has no asset row for`);
      }
      if (missingAssets.has(assetId)) {
        unimported.add(assetId);
        continue;
      }

      const planned = await planAsset(assetId, asset, readAsset, missingAssets);
      if (!planned) {
        unimported.add(assetId);
        continue;
      }
      if (planned.kind === 'photo') photos.push({ id: planned.id, fileName: planned.fileName, starred: false });
      else recordings.push({ id: planned.id, fileName: planned.fileName });
      plannedAssets.set(assetId, planned.asset);
    }

    if (!logged && tags.length === 0 && note === '' && photos.length === 0 && recordings.length === 0) {
      throw new DaylioBackupError('record', `${named} has no mood, tags, note or attachment`);
    }

    journal.entries.push({
      uuid,
      epochDay,
      timestamp: timestampOf(epochDay, record),
      mood,
      note,
      dims,
      tags,
      photos,
      recordings,
      videos: [],
      bodyRegions: {},
      starred: flag(record.isFavorite),
      presentationId: null
    } satisfies ArchiveEntry);
  }

  /* Milestones. `month` is 1-based here, `year` reached back to 1999 in
     the observed file, and an anniversary is a yearly recurrence this
     app's milestone cannot hold - so the origin date arrives and the
     recurrence is named as dropped rather than invented somewhere. */
  const existingMilestones = new Set(existing.milestones.map((milestone) => milestone.id));
  let anniversaries = 0;
  for (const record of list(payload.milestones)) {
    const id = int(record.id);
    const named = id === null ? 'a milestone with no id' : `milestone ${id}`;
    const name = str(record.name);
    if (!name) {
      unnamed += 1;
      continue;
    }

    const epochDay = epochDayOf(record, 1);
    if (epochDay === null) throw new DaylioBackupError('record', `${named} has no readable date`);
    if (flag(record.isAnniversary)) anniversaries += 1;

    const uuid = await derivedUuid(['daylio-milestone', name, epochDay]);
    if (existingMilestones.has(uuid)) continue;

    const assetId = int(record.assetId);
    let photo: ArchiveMilestone['photo'] = null;
    if (assetId !== null && assetId > 0) {
      const asset = assets.get(assetId);
      if (!asset) {
        throw new DaylioBackupError('record', `${named} names asset ${assetId}, which the backup has no asset row for`);
      }
      const planned = missingAssets.has(assetId) ? null : await planAsset(assetId, asset, readAsset, missingAssets);
      if (planned && planned.kind === 'photo') {
        photo = { id: planned.id, fileName: planned.fileName, starred: false };
        plannedAssets.set(assetId, planned.asset);
      } else {
        unimported.add(assetId);
      }
    }

    journal.milestones.push({
      id: uuid,
      name,
      epochDay,
      description: str(record.note),
      templateKey: null,
      roadmapGoalKey: null,
      procedureId: null,
      tryoutId: null,
      photo
    } satisfies ArchiveMilestone);
  }
  if (anniversaries > 0) skipped.push({ kind: 'anniversaries', count: anniversaries });

  /* Writing templates: a title and an HTML body, which is what an entry
     template is here once the body is text. */
  const existingTemplates = new Set(existing.entryTemplates.map((template) => template.id));
  for (const record of list(payload.writingTemplates)) {
    const name = str(record.title);
    const noteScaffold = htmlToText(str(record.body));
    if (!name && !noteScaffold) continue;

    const id = await derivedUuid(['daylio-template', name, noteScaffold]);
    if (existingTemplates.has(id)) continue;
    journal.entryTemplates.push({
      id,
      name,
      tags: [],
      dims: {},
      noteScaffold,
      presentationId: null,
      builtIn: false,
      hidden: false
    } satisfies ArchiveEntryTemplate);
  }

  /* Named as skipped, in the order the ticket puts them out of scope.
     Goals carry a repeat that this app has no recurring-goal concept for,
     including a `repeat_value` of 127 that is a seven-bit weekday mask
     rather than a count of anything - nothing here reads it, which is
     the only safe way to not misread it. */
  for (const [kind, fields] of OUT_OF_SCOPE) {
    const count = fields.reduce((total, field) => total + list(payload[field]).length, 0);
    if (count > 0) skipped.push({ kind, count });
  }
  if (int(payload.moodIconsPackId) !== null) skipped.push({ kind: 'icons' });
  if (unnamed > 0) skipped.push({ kind: 'unnamed', count: unnamed });

  if (unimported.size > 0) skipped.push({ kind: 'assets', count: unimported.size });

  const attached = [...plannedAssets.values()];
  return {
    entryCount: journal.entries.length,
    matchedTagCount,
    newTagCount,
    milestoneCount: journal.milestones.length,
    dimensionCount: journal.dimensions.length,
    templateCount: journal.entryTemplates.length,
    photoCount: attached.filter((asset) => asset.kind === 'photo').length,
    audioCount: attached.filter((asset) => asset.kind === 'audio').length,
    moods,
    unmappedMoodNames,
    skipped,
    unexpectedVersion: version === EXPECTED_VERSION ? null : version,
    journal,
    assets: attached
  };
}

/** The row identity and file name for one asset, or null when its bytes
    are a kind this app cannot store - in which case it joins the missing
    set and is counted rather than handed to a commit that would fail on
    it partway through. */
async function planAsset(
  id: number,
  asset: AssetRow,
  readAsset: (id: number) => Promise<Uint8Array>,
  missing: Set<number>
): Promise<{ kind: 'photo' | 'audio'; id: string; fileName: string; asset: DaylioAsset } | null> {
  const bytes = await readAsset(id);
  const uuid = await derivedUuid(['daylio-asset', asset.checksum]);

  if (asset.type === AUDIO_ASSET) {
    const extension = audioExtension(bytes) ?? recordingExtensionOf(asset.sourceName);
    if (!extension) {
      missing.add(id);
      return null;
    }
    const fileName = `${uuid}${extension}`;
    return { kind: 'audio', id: uuid, fileName, asset: { fileName, kind: 'audio', read: () => readAsset(id) } };
  }

  if (!isDecodableImage(bytes)) {
    missing.add(id);
    return null;
  }
  // Always `.jpg`: the photo pipeline re-encodes everything it stores
  // (photos/normalize.ts), and the thumbnail's name is derived from this
  // one (photos/names.ts).
  const fileName = photoFileName(uuid);
  return { kind: 'photo', id: uuid, fileName, asset: { fileName, kind: 'photo', read: () => readAsset(id) } };
}

const extensionOf = (name: string): string | null => {
  const match = /\.[a-z0-9]{2,4}$/i.exec(name);
  return match ? match[0].toLowerCase() : null;
};

/** `extensionOf`'s guess, kept only when the player's own allowlist
    (voiceRecordings/mime.ts) recognises it. `android_metadata.Name` is a
    string the backup's own file chose, not this app's, so anything the regex
    would otherwise admit - `.js`, `.htm` - joins the missing set the way
    undecodable image bytes already do, rather than landing in the recording
    store unplayable. */
const recordingExtensionOf = (name: string): string | null => {
  const extension = extensionOf(name);
  return extension && audioMimeOf(extension) ? extension : null;
};

/** Every label a tag in this journal answers to, folded, so an imported
    activity resolves to a tag that is already here rather than a second
    one beside it. daylio.ts does the same for the CSV path. */
function tagMatches(journal: ArchiveJournal, naming: DaylioNaming): Map<string, string> {
  const matches = new Map<string, string>();
  for (const tag of journal.tagGroups.flatMap((group) => group.tags)) {
    const labels = tag.builtIn ? [...naming.tagLabels(tag.id), tag.label] : [tag.label];
    for (const label of labels.filter((one) => one.trim().length > 0)) {
      const folded = foldText(label);
      if (!matches.has(folded)) matches.set(folded, tag.id);
    }
  }
  return matches;
}
