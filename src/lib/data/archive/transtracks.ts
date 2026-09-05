/* TransTracks becomes an archive-shaped merge, the same division of labour
   daylio.ts already set: parsing and resolving happen here, writing stays
   in the journal's archive area, and this module never touches disk (PRD
   F28's preview-first rule, extended from CSV to a zip).

   TransTracks carries real identity - Photo and Milestone are both keyed by
   a stable `UUID.randomUUID()` that round-trips through the app's own
   export/import - so a well-formed id is reused as-is (ADR-0002), which is
   what makes a repeated import a no-op. A hostile or corrupt file's id is
   not trusted with that shape unchecked, though: resolvePhotoId falls back
   to a uuid derived from the id string itself, the same guarantee a
   derived hash gives Daylio for different reasons.

   The container is a real zip: `data.json` at the root, JPEGs under
   `photos/`, deflate-compressed by Android's ZipOutputStream default. This
   app's WebView floor is 87 (capacitor.config.ts); native
   DecompressionStream only gained the 'deflate-raw' format in Chrome 103,
   so unzipping goes through fflate rather than the platform decoder. */

import { strFromU8 } from 'fflate';
import { startOfDayTimestamp } from '../epochDay';
import { emptyArchiveJournal } from '../journal/archiveSections';
import { photoFileName } from '../photos/names';
import { contentUuid } from '../journal/support';
import type { ArchiveEntry, ArchiveJournal, ArchiveMilestone, ArchivePhoto } from './payload';
import { openZip, type ZipReader } from './zipReader';

const KNOWN_TOP_LEVEL_KEYS = ['settings', 'photos', 'milestones'] as const;

export class TransTracksBackupError extends Error {
  constructor(message: string) {
    super(`TransTracks backup ${message}`);
    this.name = 'TransTracksBackupError';
  }
}

export interface TransTracksPreview {
  /** Net additions, not raw file totals - what commit reports. */
  milestoneCount: number;
  photoCount: number;
  /** Files under `photos/` that no photo record in `data.json` names -
      TransTracks' own exporter copies the whole directory wholesale, so a
      deleted-but-not-purged image rides along. Ignored, and named here so
      the preview says so rather than importing them as loose photos. */
  orphanedPhotoCount: number;
  /** Fields this build read and dropped, named for the preview rather than
      silently discarded. TransTracks' own face/body flag has no home in
      ArchivePhoto - the only field this source ever drops. */
  ignoredFields: string[];
  /** Any key in `data.json` beside settings/photos/milestones - skipped
      rather than fatal, mirroring TransTracks' own forward-tolerant reader
      (`skipValue()` on the unknown top-level key). */
  unknownTopLevelKeys: string[];
  /** The resolved merge payload. A preview is the exact work committed,
      never an instruction to re-read a file that may have changed by then. */
  journal: ArchiveJournal;
  /** Every newly added photo's original JPEG bytes, keyed by the
      `ArchivePhoto.fileName` used inside `journal`. Not normalized:
      normalize() needs a canvas and stays a caller's job, the same
      division photoPicking.ts already draws for every other photo-writing
      area (photos.ts's attach, hairProgress.ts, tryouts.ts, ...). */
  rawPhotos: Map<string, Uint8Array>;
}

interface RawPhoto {
  id: unknown;
  epochDay: unknown;
  timestamp: unknown;
  fileName: unknown;
  type: unknown;
}

interface RawMilestone {
  id: unknown;
  epochDay: unknown;
  timestamp: unknown;
  title: unknown;
  description: unknown;
}

interface RawPayload {
  settings?: unknown;
  photos?: unknown;
  milestones?: unknown;
}

/** A non-throwing sniff (sources.ts's own contract): a real zip, holding a
    `data.json` whose parsed shape has both arrays a TransTracks export
    always carries. Never the full structural validation - that stays in
    `transTracksPreview`, which throws by naming the record. */
export function detectTransTracks(bytes: Uint8Array): boolean {
  try {
    const raw = openZip(bytes).read('data.json');
    if (!raw) return false;
    const parsed = JSON.parse(strFromU8(raw)) as RawPayload;
    return Array.isArray(parsed.photos) && Array.isArray(parsed.milestones);
  } catch {
    return false;
  }
}

function readDataJson(reader: ZipReader): RawPayload {
  const raw = reader.read('data.json');
  if (!raw) throw new TransTracksBackupError('does not contain a data.json');
  let parsed: unknown;
  try {
    parsed = JSON.parse(strFromU8(raw));
  } catch {
    throw new TransTracksBackupError('data.json is not valid JSON');
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new TransTracksBackupError('data.json is not an object');
  }
  return parsed as RawPayload;
}

function requireString(value: unknown, field: string, index: number, kind: string): string {
  if (typeof value !== 'string' || value === '') {
    throw new TransTracksBackupError(`${kind} ${index} is missing its ${field}`);
  }
  return value;
}

function requireEpochDay(value: unknown, index: number, kind: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new TransTracksBackupError(`${kind} ${index} has an invalid epochDay`);
  }
  return value;
}

const PHOTO_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** TransTracks' own uuid when `raw.id` actually is one - the real identity this
    format normally carries (ADR-0002) - or a uuid derived from that same string
    otherwise, so a hostile or corrupt id can neither choose the stored photo
    file's name (photos/names.ts's photoFileName is an opaque `${uuid}.jpg`) nor
    land unvalidated in the uuid column. Derived rather than minted: minting
    would break "importing the same file twice is a no-op", since a second
    import's `existingEntries.has(id)` check has to land on the same id the
    first import used. */
async function resolvePhotoId(rawId: string): Promise<string> {
  return PHOTO_UUID_PATTERN.test(rawId) ? rawId.toLowerCase() : contentUuid(['transtracks-photo', rawId]);
}

export async function transTracksPreview(bytes: Uint8Array, existing: ArchiveJournal): Promise<TransTracksPreview> {
  const reader = openZip(bytes);
  const payload = readDataJson(reader);

  const unknownTopLevelKeys = Object.keys(payload).filter(
    (key) => !(KNOWN_TOP_LEVEL_KEYS as readonly string[]).includes(key)
  );

  const rawMilestones = Array.isArray(payload.milestones) ? (payload.milestones as RawMilestone[]) : [];
  const rawPhotos = Array.isArray(payload.photos) ? (payload.photos as RawPhoto[]) : [];

  const existingMilestones = new Set(existing.milestones.map((milestone) => milestone.id));
  const existingEntries = new Set(existing.entries.map((entry) => entry.uuid));

  const milestones: ArchiveMilestone[] = [];
  rawMilestones.forEach((raw, index) => {
    const id = requireString(raw.id, 'id', index, 'milestone');
    const epochDay = requireEpochDay(raw.epochDay, index, 'milestone');
    const title = requireString(raw.title, 'title', index, 'milestone');
    const description = typeof raw.description === 'string' ? raw.description : '';
    if (existingMilestones.has(id)) return;

    milestones.push({
      id,
      name: title,
      epochDay,
      description,
      templateKey: null,
      roadmapGoalKey: null,
      procedureId: null,
      tryoutId: null,
      photo: null
    });
  });

  // TransTracks photos are a standalone dated array with a face/body flag;
  // ArchiveMilestone.photo holds at most one photo nested under a
  // milestone, so a photo becomes its own dated entry instead (spec's
  // "likely answer"). The entry's uuid is the photo's own uuid - one
  // TransTracks photo, one synthetic entry, one identity - which is what
  // makes a repeated import skip it in both tables at once.
  const entries: ArchiveEntry[] = [];
  const newRawPhotos = new Map<string, Uint8Array>();
  let referencedFileNames = 0;

  for (const [index, raw] of rawPhotos.entries()) {
    const rawId = requireString(raw.id, 'id', index, 'photo');
    const epochDay = requireEpochDay(raw.epochDay, index, 'photo');
    const sourceFileName = requireString(raw.fileName, 'fileName', index, 'photo');
    referencedFileNames += 1;

    const zipBytes = reader.read(`photos/${sourceFileName}`);
    if (!zipBytes || zipBytes.length === 0) {
      throw new TransTracksBackupError(`photo ${index} names ${sourceFileName}, which is missing from the zip`);
    }

    const id = await resolvePhotoId(rawId);
    if (existingEntries.has(id)) continue;

    const fileName = photoFileName(id);
    const photo: ArchivePhoto = { id, fileName, starred: false, epochDayOverride: null };
    entries.push({
      uuid: id,
      epochDay,
      timestamp: startOfDayTimestamp(epochDay),
      mood: null,
      note: '',
      dims: {},
      tags: [],
      photos: [photo],
      recordings: [],
      videos: [],
      bodyRegions: {},
      starred: false,
      presentationId: null
    });
    newRawPhotos.set(fileName, zipBytes);
  }

  const orphanedPhotoCount = reader.names().filter((name) => {
    if (!name.startsWith('photos/') || name.endsWith('/')) return false;
    const fileName = name.slice('photos/'.length);
    return !rawPhotos.some((raw) => raw.fileName === fileName);
  }).length;

  const journal: ArchiveJournal = { ...emptyArchiveJournal(), milestones, entries };

  return {
    milestoneCount: milestones.length,
    photoCount: entries.length,
    orphanedPhotoCount,
    ignoredFields: referencedFileNames > 0 ? ['type (face or body)'] : [],
    unknownTopLevelKeys,
    journal,
    rawPhotos: newRawPhotos
  };
}
