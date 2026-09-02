/* Day One JSON export becomes an archive-shaped merge (phase 7 ticket 11).
   Structural problems throw, naming what's wrong; a photo this app cannot
   place is skipped rather than failing the whole import, the same split
   ticket 02 set for every source.

   The container is a real zip - one JSON file plus `photos/`, `videos/`,
   `audios/` and `pdfs/` folders - so this reads it through fflate rather
   than the platform's own DecompressionStream, for the reason
   transtracks.ts found first: this app's WebView floor is Chrome 87
   (capacitor.config.ts) and the 'deflate-raw' format only arrived in
   Chrome 103, so the platform decoder fails on the devices this app
   supports. `zipRead` below decompresses one member at a time, the same
   discipline daylioBackup.ts's own version keeps, so a preview never pays
   to decompress every photo an entry did not ask for.

   The vendor publishes no prose schema - the file they host as their own
   import spec is the schema - and this module was written against a real
   export read once and then deleted (2026-09-01). Where the vendor's own
   published sample disagreed with that real file, the real file won; see
   the ticket for the corrections. Two rules follow from that: only `uuid`,
   `creationDate`, `modifiedDate`, `text` and `timeZone` are ever assumed
   present, and `metadata.version` staying "1.0" across everything else
   that changed means it is checked for the name but never trusted as a
   compatibility gate.

   Four things worth knowing before reading the code below:

   1. There is no title field. Day One's own editor treats the first line
      of `text` as the title when it is a Markdown `# heading`; `richText`
      marks the same line with `attributes.line.header === 1` instead of a
      literal `#`. This app's entries have no title field either, so a
      heading becomes the note's own first line with the `#` marker
      dropped - `noteFromText` below is the whole of that rule. No heading
      is exactly as sensible: the note is the content, unmodified.

   2. Optional keys are omitted, not nulled. Everything but the five named
      above is read with `?.` and a sensible default.

   3. Media needs a two-step join: the file on disk is
      `photos/<md5>.<type>`, and the reference inside `text` or `richText`
      is `dayone-moment://<identifier>` - a different value, resolved
      through the same `photos[]` entry that carries both. Never fold the
      case of one to compare with the other; `identifier` is uppercase,
      `md5` is lowercase, and that is simply what each one is.

   4. `text` usually carries the same content as `richText`, as Markdown
      with punctuation backslash-escaped - but an onboarding entry in the
      real export had `text: ""` with a fully populated `richText`, so the
      richText fallback is load-bearing, not a hypothetical.

   Photo bytes travel raw, not normalized: `normalizePhoto()` needs a
   canvas, and this seam is Node-tested, the same division
   photoPicking.ts already draws for every other photo-writing area and
   transtracks.ts/daylioBackup.ts already draw for this one. */

import { strFromU8, unzipSync } from 'fflate';
import { md5 } from 'hash-wasm';
import { epochDayFromLocalDate } from '../epochDay';
import { photoFileName } from '../photos/names';
import { foldText } from '../fold';
import { emptyArchiveJournal } from '../journal/archiveSections';
import { mintUuid } from '../journal/support';
import type { DaylioNaming } from './daylio';
import type { ArchiveEntry, ArchiveJournal, ArchiveTag, ArchiveTagGroup } from './payload';

export interface DayOnePreview {
  /** Net additions, not the raw entry count - candidates already excluded
      against what the device has (ADR-0002). */
  entryCount: number;
  matchedTagCount: number;
  newTagCount: number;
  photoCount: number;
  /** A photo `photos[]` names but whose file the zip does not carry, or
      whose bytes fail their own md5 - not a failure, since the vendor's
      own `md5Thumbnail` is a documented dangling reference and a full
      photo can go missing from an export the same way. Named so the
      person confirming sees what will not travel. */
  unresolvedPhotoCount: number;
  journal: ArchiveJournal;
  /** Every newly added photo's original bytes, keyed by the
      `ArchivePhoto.fileName` used inside `journal` - not normalized,
      the caller's job (module header). */
  rawPhotos: Map<string, Uint8Array>;
}

export class DayOneImportError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(`Day One export ${message}`, options);
    this.name = 'DayOneImportError';
  }
}

export const REQUIRED_COLUMNS = ['metadata', 'entries'] as const;

interface DayOneRawPhoto {
  identifier?: string;
  md5?: string;
  type?: string;
}

interface DayOneRichTextNode {
  text: string;
}

interface DayOneRichText {
  contents?: unknown[];
}

interface DayOneRawEntry {
  uuid?: string;
  creationDate?: string;
  modifiedDate?: string;
  timeZone?: string;
  text?: string;
  richText?: string;
  tags?: string[];
  photos?: DayOneRawPhoto[];
  starred?: boolean;
}

interface DayOneExportFile {
  metadata?: { version?: string };
  entries?: DayOneRawEntry[];
}

/** Every entry name the zip carries, decompressing none of them: the
    filter is called once per entry and always says no, which walks the
    central directory and stops there (daylioBackup.ts's own idiom). */
function zipNames(file: Uint8Array): string[] {
  const names: string[] = [];
  unzipSync(file, {
    filter: (entry) => {
      names.push(entry.name);
      return false;
    }
  });
  return names;
}

/** One entry's bytes, or null when the zip has no such member.
    Decompresses that member alone, which is what keeps a preview off
    every photo an entry did not ask for. */
function zipRead(file: Uint8Array, name: string): Uint8Array | null {
  const found = unzipSync(file, { filter: (entry) => entry.name === name });
  return Object.values(found)[0] ?? null;
}

/** The one top-level `<journal>.json` a Day One zip carries -
    `photos/`, `videos/`, `audios/` and `pdfs/` are folders, so anything
    with a `/` in its name is never the payload. */
function findJournalEntryName(names: readonly string[]): string | null {
  return names.find((name) => !name.includes('/') && name.endsWith('.json')) ?? null;
}

/** A non-throwing sniff (the registry's own contract, ADR: phase 7 ticket
    02): a zip, carrying one top-level JSON file, whose top level has both
    keys the vendor's own sample and the real export agree never move.
    Never the full structural validation `dayonePreview` does - detecting
    picks a source to try, not a verdict on whether the file is
    well-formed. */
export function detectDayOne(bytes: Uint8Array): boolean {
  try {
    const journalName = findJournalEntryName(zipNames(bytes));
    if (!journalName) return false;
    const raw = zipRead(bytes, journalName);
    if (!raw) return false;
    const parsed = JSON.parse(strFromU8(raw)) as DayOneExportFile;
    return typeof parsed.metadata?.version === 'string' && Array.isArray(parsed.entries);
  } catch {
    return false;
  }
}

/** Backslash-escaped ASCII punctuation, as Day One's own Markdown writes
    it (`the best\.`). */
function unescapeMarkdown(text: string): string {
  return text.replace(/\\([!-/:-@[-`{-~])/g, '$1');
}

/** Day One's own inline embed, `![](dayone-moment://<identifier>)` - never
    rendered by this app's plain-text note field, so it is cosmetic noise
    left over from a link this app cannot follow. The photo itself still
    travels; only the broken-looking markdown is dropped. */
function stripPhotoEmbeds(text: string): string {
  return text
    .replace(/!\[[^\]]*\]\(dayone-moment:\/\/[0-9A-Za-z]+\)/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** `text` is Markdown; the note is that Markdown, unescaped, with a
    leading `# heading` promoted to a plain first line (module header,
    point 1). Only the very first line ever counts as the title, the same
    way Day One's own editor treats it - a `#` further down is body
    content, not a second title. */
function noteFromText(text: string): string {
  const cleaned = unescapeMarkdown(stripPhotoEmbeds(text));
  const headingMatch = /^#[ \t]+(.*)(\n([\s\S]*))?$/.exec(cleaned);
  if (!headingMatch) return cleaned;
  const [, heading, , rest] = headingMatch;
  return rest ? `${heading}\n${rest}` : heading;
}

/** `richText.contents` is a flat list of text runs; a line's heading-ness
    is metadata (`attributes.line.header`), never a literal `#` in the
    text, so flattening it is already the note - nothing to strip (module
    header, point 1). Non-text content (a photo embed) carries no `.text`
    of its own and is skipped rather than joined in as `undefined`. */
function noteFromRichText(richText: string, entryLabel: string): string {
  let parsed: DayOneRichText;
  try {
    parsed = JSON.parse(richText) as DayOneRichText;
  } catch (cause) {
    throw new DayOneImportError(`has richText that is not valid JSON, for entry ${entryLabel}`, { cause });
  }
  const contents = Array.isArray(parsed.contents) ? parsed.contents : [];
  return contents
    .filter((node): node is DayOneRichTextNode => typeof (node as DayOneRichTextNode)?.text === 'string')
    .map((node) => node.text)
    .join('')
    .trim();
}

/** `creationDate`/`modifiedDate` are UTC instants; the app stores entries
    by local calendar day (ADR-0001), and the local day a UTC instant falls
    on depends on the zone it happened in - which this app's own device
    zone is not, since the entry may have been written somewhere else
    entirely. `Intl.DateTimeFormat` reads the calendar date in `timeZone`
    directly, so this never goes through a `Date`'s own (device-zoned)
    getters the way `epochDayFromLocalDate` does. */
export function localDayInZone(instantMs: number, timeZone: string): number {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(
      new Date(instantMs)
    );
  } catch (cause) {
    throw new DayOneImportError(`has an unrecognised time zone: ${timeZone}`, { cause });
  }
  const part = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return epochDayFromLocalDate(new Date(Date.UTC(part('year'), part('month') - 1, part('day'))));
}

/** `uuid` is 32 uppercase hex characters with no dashes - stable, so used
    directly (ADR-0002) rather than derived, only reshaped into this app's
    dashed, lowercase form. Deterministic, so importing the same file twice
    names the same row both times. */
export function normalizeDayOneUuid(raw: string, entryLabel: string): string {
  const hex = raw.toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(hex)) {
    throw new DayOneImportError(`has an invalid uuid for entry ${entryLabel}: ${raw || '(empty)'}`);
  }
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function tagMatches(journal: ArchiveJournal, naming: DaylioNaming): Map<string, string> {
  const matches = new Map<string, string>();
  for (const tag of journal.tagGroups.flatMap((group) => group.tags)) {
    const labels = tag.builtIn ? [...naming.tagLabels(tag.id), tag.label] : [tag.label];
    for (const label of labels.filter((l) => l.trim().length > 0)) {
      const folded = foldText(label);
      if (!matches.has(folded)) matches.set(folded, tag.id);
    }
  }
  return matches;
}

const emptyImportJournal = (tagGroup: ArchiveTagGroup, entries: ArchiveEntry[]): ArchiveJournal => ({
  ...emptyArchiveJournal(),
  tagGroups: [tagGroup],
  entries
});

/** One `photos[]` entry, resolved from `photos/<md5>.<type>` in the zip
    (module header, point 3). A photo whose file is missing, or whose bytes
    do not match its own `md5`, is skipped rather than failing the entire
    import - the same tolerance the vendor's own dangling `md5Thumbnail`
    needs, applied to the full photo too, since either can go missing from
    a real export the same way. */
async function resolveDayOnePhoto(
  zipBytes: Uint8Array,
  photo: DayOneRawPhoto
): Promise<{ id: string; fileName: string; raw: Uint8Array } | null> {
  if (!photo.md5 || !photo.type) return null;
  const raw = zipRead(zipBytes, `photos/${photo.md5}.${photo.type}`);
  if (!raw) return null;

  const digest = await md5(raw);
  if (digest !== photo.md5.toLowerCase()) return null;

  const id = mintUuid();
  return { id, fileName: photoFileName(id), raw };
}

export async function dayonePreview(
  zipBytes: Uint8Array,
  existing: ArchiveJournal,
  naming: DaylioNaming
): Promise<DayOnePreview> {
  const names = zipNames(zipBytes);
  const journalName = findJournalEntryName(names);
  if (!journalName) throw new DayOneImportError('has no top-level journal JSON file');

  let parsed: DayOneExportFile;
  try {
    const raw = zipRead(zipBytes, journalName);
    if (!raw) throw new DayOneImportError('has no top-level journal JSON file');
    parsed = JSON.parse(strFromU8(raw)) as DayOneExportFile;
  } catch (cause) {
    if (cause instanceof DayOneImportError) throw cause;
    throw new DayOneImportError('has a journal file that is not valid JSON', { cause });
  }

  if (parsed.metadata?.version !== '1.0') {
    throw new DayOneImportError(`has metadata.version ${JSON.stringify(parsed.metadata?.version)}, expected "1.0"`);
  }
  if (!Array.isArray(parsed.entries)) throw new DayOneImportError('has no entries array');

  const existingEntries = new Set(existing.entries.map((entry) => entry.uuid));
  const candidates: { entry: ArchiveEntry; tags: string[] }[] = [];
  const rawPhotos = new Map<string, Uint8Array>();
  let unresolvedPhotoCount = 0;

  for (const raw of parsed.entries) {
    if (!raw.uuid || !raw.creationDate || !raw.timeZone) {
      throw new DayOneImportError('has an entry missing uuid, creationDate or timeZone');
    }
    const uuid = normalizeDayOneUuid(raw.uuid, raw.uuid);
    // Skipped before any photo work happens: a device that already has
    // this entry gets nothing new to write, and resolving its photos
    // anyway would leave their bytes in `rawPhotos` with no row left to
    // name them - exactly the orphan a preview handing over "the exact
    // work a commit does" must never produce.
    if (existingEntries.has(uuid)) continue;

    const timestamp = Date.parse(raw.creationDate);
    if (Number.isNaN(timestamp)) {
      throw new DayOneImportError(`has an invalid creationDate for entry ${raw.uuid}: ${raw.creationDate}`);
    }
    const epochDay = localDayInZone(timestamp, raw.timeZone);

    const text = raw.text ?? '';
    const note = text.trim() !== '' ? noteFromText(text) : noteFromRichText(raw.richText ?? '{}', raw.uuid);

    const photoRows: { id: string; fileName: string; starred: boolean }[] = [];
    for (const photo of raw.photos ?? []) {
      const resolved = await resolveDayOnePhoto(zipBytes, photo);
      if (!resolved) {
        unresolvedPhotoCount += 1;
        continue;
      }
      photoRows.push({ id: resolved.id, fileName: resolved.fileName, starred: false });
      rawPhotos.set(resolved.fileName, resolved.raw);
    }

    const entry: ArchiveEntry = {
      uuid,
      epochDay,
      timestamp,
      mood: null,
      note,
      dims: {},
      tags: [],
      photos: photoRows,
      recordings: [],
      videos: [],
      bodyRegions: {},
      starred: raw.starred === true,
      presentationId: null
    };
    candidates.push({ entry, tags: raw.tags ?? [] });
  }

  const matches = tagMatches(existing, naming);
  const matchedTags = new Set<string>();
  const newTags = new Map<string, ArchiveTag>();
  for (const candidate of candidates) {
    for (const label of candidate.tags.filter((t) => t.trim().length > 0)) {
      const folded = foldText(label);
      const matched = matches.get(folded);
      if (matched) {
        candidate.entry.tags.push(matched);
        matchedTags.add(folded);
        continue;
      }
      let tag = newTags.get(folded);
      if (!tag) {
        tag = { id: mintUuid(), label, builtIn: false, hidden: false };
        newTags.set(folded, tag);
      }
      candidate.entry.tags.push(tag.id);
    }
  }

  const imported: ArchiveTagGroup = {
    key: 'imported',
    name: '',
    enabled: true,
    builtIn: true,
    tags: [...newTags.values()]
  };
  const entries = candidates.map((c) => c.entry);
  return {
    entryCount: entries.length,
    matchedTagCount: matchedTags.size,
    newTagCount: newTags.size,
    photoCount: entries.reduce((n, e) => n + e.photos.length, 0),
    unresolvedPhotoCount,
    journal: emptyImportJournal(imported, entries),
    rawPhotos
  };
}
