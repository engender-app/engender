import type { ArchiveJournal } from '../archive/payload';
import { CorruptArchiveError } from '../archive/container';
import { isHairStaging } from '../hairStageScales';
import {
  CYCLE_EVENT_KINDS, DOCUMENT_TARGET_KINDS, DOSE_RECURRENCE_KINDS,
  EFFECT_DIRECTIONS_STORED, HAIR_REMOVAL_AREAS, HAIR_REMOVAL_METHODS, REMINDER_RECURRENCES,
  REMINDER_TYPES, TALLY_KINDS, TRYOUT_KINDS
} from '../rowValues';
import {
  BUILT_IN_DIMENSIONS, BUILT_IN_EFFECT_CATEGORIES, BUILT_IN_TAG_GROUPS
} from '../vocabulary/builtins';
import { columnsOf, identityFieldOf, type FlatTable } from './archiveTable';

type Check = (value: unknown) => boolean;
const text: Check = (value) => typeof value === 'string';
// A lone surrogate is not text SQLite can round-trip, so an id holding one is unreadable.
const identity: Check = (value) => typeof value === 'string' && value.trim().length > 0 && value.isWellFormed();
const bool: Check = (value) => typeof value === 'boolean';
const numeric: Check = (value) => typeof value === 'number' && Number.isFinite(value) &&
  (!Number.isInteger(value) || Number.isSafeInteger(value));
const nullable = (check: Check): Check => (value) => value === null || check(value);
const optional = (check: Check): Check => (value) => value === undefined || check(value);
const oneOf = (values: readonly string[]): Check => (value) => typeof value === 'string' && values.includes(value);
const integerBetween = (min: number, max: number): Check => (value) =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;
const list = (check: Check): Check => (value) => Array.isArray(value) && value.every(check);
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const numericRecord: Check = (value) => record(value) && Object.values(value).every(numeric);
const bodyRegionValue = integerBetween(0, 100);
const bodyRegionValues: Check = (value) => record(value) && Object.values(value).every((v) =>
  bodyRegionValue(v) && v !== 50);
const object = (fields: Record<string, Check>): Check => (value) =>
  record(value) && Object.entries(fields).every(([field, check]) => check(value[field]));

// These contracts follow the wire rows, not SQLite's permissive coercions.
// Missing booleans keep the existing false default; legacy fields keep their apply defaults.
const tag = object({
  id: identity,
  label: text,
  builtIn: optional(bool),
  hidden: optional(bool)
});

const photo = object({
  id: identity,
  fileName: text,
  starred: optional(bool),
  epochDayOverride: optional(nullable(numeric))
});

const voiceRecording = object({
  id: identity,
  fileName: text
});

const videoNote = object({
  id: identity,
  fileName: text
});

const hairRemovalPhoto = object({
  id: identity,
  fileName: text
});

const procedurePhoto = object({
  id: identity,
  epochDay: numeric,
  fileName: text
});

const appointmentStatus = object({
  id: identity,
  epochDay: numeric,
  status: text
});

const tryoutPhoto = object({
  id: identity,
  epochDay: numeric,
  fileName: text
});

const checklistItem = object({
  id: identity,
  content: text,
  checked: optional(bool),
  carriedForward: optional(bool)
});

const ROWS = {
  dimensions: {
    key: identity,
    name: text,
    low: text,
    high: text,
    min: numeric,
    max: numeric,
    builtIn: optional(bool),
    hidden: optional(bool)
  },
  presets: {
    id: identity,
    name: text,
    builtIn: optional(bool),
    dims: optional(list(text))
  },
  tagGroups: {
    key: identity,
    name: text,
    enabled: optional(bool),
    builtIn: optional(bool),
    tags: optional(list(tag))
  },
  bodyRegions: {
    id: identity,
    name: text,
    builtIn: optional(bool),
    hidden: optional(bool)
  },
  entries: {
    uuid: identity,
    epochDay: numeric,
    timestamp: numeric,
    mood: nullable(numeric),
    note: text,
    dims: optional(numericRecord),
    tags: optional(list(text)),
    photos: list(photo),
    recordings: optional(list(voiceRecording)),
    videos: optional(list(videoNote)),
    bodyRegions: optional(bodyRegionValues),
    starred: optional(bool),
    presentationId: optional(nullable(text))
  },
  milestones: {
    id: identity,
    name: text,
    epochDay: numeric,
    description: optional(text),
    templateKey: nullable(text),
    roadmapGoalKey: optional(nullable(text)),
    procedureId: optional(nullable(text)),
    tryoutId: optional(nullable(text)),
    photo: optional(nullable(photo))
  },
  labResults: {
    id: identity,
    epochDay: numeric,
    analyte: text,
    value: numeric,
    unit: text,
    note: text,
    drawTime: nullable(text),
    provider: text,
    timingRoute: nullable(text),
    timingHours: nullable(numeric),
    timingDayOfInterval: nullable(numeric)
  },
  taper: {
    id: identity,
    procedureId: text,
    startEpochDay: numeric,
    stagesJson: text
  },
  taperSessions: {
    id: identity,
    epochDay: numeric,
    note: text
  },
  sideEffects: {
    id: identity,
    name: text,
    severity: nullable(integerBetween(1, 5)),
    epochDay: numeric
  },
  cycleEvents: {
    id: identity,
    kind: oneOf(CYCLE_EVENT_KINDS),
    epochDay: numeric
  },
  journalingPauses: {
    id: identity,
    startEpochDay: numeric,
    endEpochDay: nullable(numeric)
  },
  eras: {
    id: identity,
    name: text,
    startEpochDay: nullable(numeric),
    endEpochDay: nullable(numeric)
  },
  eraMutes: {
    eraUuid: text
  },
  personalEffects: {
    id: identity,
    effect: text,
    firstNoticedEpochDay: numeric
  },
  effectCategories: {
    key: identity,
    name: text,
    enabled: optional(bool)
  },
  personalEffectTypes: {
    key: identity,
    name: text,
    builtIn: optional(bool),
    hidden: optional(bool),
    categoryKey: nullable(text),
    direction: nullable(oneOf(EFFECT_DIRECTIONS_STORED))
  },
  hairStages: {
    id: identity,
    epochDay: numeric,
    scale: optional(text),
    stage: text,
    description: optional(text)
  },
  hairPhotos: {
    id: identity,
    epochDay: numeric,
    fileName: text
  },
  hairRemovalSessions: {
    id: identity,
    epochDay: numeric,
    area: oneOf(HAIR_REMOVAL_AREAS),
    method: oneOf(HAIR_REMOVAL_METHODS),
    painRating: nullable(integerBetween(1, 5)),
    cost: text,
    provider: text,
    photos: list(hairRemovalPhoto)
  },
  procedures: {
    id: identity,
    name: text,
    surgeryEpochDay: nullable(numeric),
    notes: text,
    photos: list(procedurePhoto),
    kind: optional(text),
    dilationOptIn: optional(bool),
    archived: optional(bool)
  },
  appointments: {
    id: identity,
    epochDay: nullable(numeric),
    procedureId: nullable(text),
    kind: nullable(text),
    place: nullable(text),
    note: nullable(text),
    referredEpochDay: optional(nullable(numeric)),
    statuses: optional(list(appointmentStatus))
  },
  reminders: {
    id: identity,
    title: text,
    type: oneOf(REMINDER_TYPES),
    time: text,
    recurrence: nullable(oneOf(REMINDER_RECURRENCES)),
    interval: nullable(numeric),
    anchorEpochDay: nullable(numeric),
    epochDay: nullable(numeric),
    enabled: optional(bool),
    autoSource: nullable(text)
  },
  tallyEvents: {
    id: identity,
    epochDay: numeric,
    kind: oneOf(TALLY_KINDS)
  },
  letters: {
    id: identity,
    epochDay: numeric,
    text: text,
    unlockEpochDay: numeric
  },
  voicePracticeTakes: {
    id: identity,
    epochDay: numeric,
    minHz: numeric,
    maxHz: numeric,
    medianHz: numeric,
    feltSense: nullable(numeric)
  },
  roadmapChecks: {
    packKey: identity,
    goalKey: identity,
    status: text,
    hidden: optional(bool)
  },
  roadmapTracks: {
    track: text
  },
  roadmapGoals: {
    id: identity,
    track: text,
    text: text,
    status: text
  },
  regimenEpisodes: {
    id: identity,
    drug: text,
    drugClass: text,
    ester: nullable(text),
    dose: numeric,
    doseUnit: text,
    route: text,
    interval: text,
    startEpochDay: numeric,
    endEpochDay: nullable(numeric),
    endReason: nullable(text),
    hidden: optional(bool)
  },
  doseEvents: {
    id: identity,
    timestamp: numeric,
    route: text,
    dose: numeric,
    doseUnit: text,
    injectionSite: nullable(text),
    vehicle: nullable(text),
    applicationSite: nullable(text),
    status: text,
    scheduledDose: nullable(numeric),
    scheduledRoute: nullable(text),
    scheduledTimestamp: nullable(numeric),
    drug: nullable(text),
    source: text,
    autoLogEpisodeId: optional(nullable(text)),
    autoLogEpochDay: optional(nullable(numeric)),
    autoLogIndex: optional(nullable(numeric))
  },
  doseSchedules: {
    id: identity,
    episodeId: text,
    recurrenceKind: oneOf(DOSE_RECURRENCE_KINDS),
    everyNDays: nullable(numeric),
    weekdays: nullable(list(integerBetween(0, 6))),
    dosesPerDay: numeric,
    doseAmounts: nullable(list(object({ dose: numeric, doseUnit: text }))),
    autoLogFromEpochDay: optional(nullable(numeric))
  },
  dosePauses: {
    id: identity,
    episodeId: text,
    startEpochDay: numeric,
    endEpochDay: nullable(numeric),
    reason: text
  },
  medicationStock: {
    id: identity,
    drug: text,
    quantity: numeric,
    unit: text,
    recordedEpochDay: numeric,
    reminderEverCreated: optional(bool),
    reminderDismissed: optional(bool),
    openedEpochDay: nullable(numeric),
    inUseWindowDays: nullable(numeric),
    inUseEndEpochDay: nullable(numeric),
    leadTimeDays: nullable(numeric),
    dosesPerUnit: nullable(numeric),
    expiryEpochDay: optional(nullable(numeric)),
    pharmacyNote: optional(nullable(text))
  },
  tryouts: {
    id: identity,
    kind: oneOf(TRYOUT_KINDS),
    label: text,
    description: nullable(text),
    startEpochDay: numeric,
    endEpochDay: nullable(numeric),
    photos: list(tryoutPhoto)
  },
  feltSenseEntries: {
    id: identity,
    tryoutId: nullable(text),
    milestoneId: nullable(text),
    epochDay: numeric,
    mood: integerBetween(1, 5),
    note: nullable(text)
  },
  checklists: {
    id: identity,
    ownerKind: nullable(text),
    ownerId: nullable(text),
    appointmentEpochDay: optional(nullable(numeric)),
    items: list(checklistItem)
  },
  wearSessions: {
    id: identity,
    kind: text,
    startTimestamp: numeric,
    durationMs: nullable(numeric),
    note: nullable(text)
  },
  voiceBenchmarks: {
    id: identity,
    epochDay: numeric,
    timestamp: numeric,
    passageKey: text,
    passageFileName: text,
    vowelFileName: nullable(text),
    f0MedianHz: numeric,
    f0P10Hz: numeric,
    f0P90Hz: numeric,
    semitoneSd: numeric,
    wordsPerMinute: numeric,
    f1Hz: nullable(numeric),
    f2Hz: nullable(numeric),
    snrDb: nullable(numeric),
    note: nullable(text),
    pitchTrack: nullable(text),
    captureChain: nullable(text),
    resonanceScale: nullable(numeric)
  },
  presentations: {
    id: identity,
    name: text,
    roleIndex: numeric,
    hidden: optional(bool)
  },
  entryTemplates: {
    id: identity,
    name: text,
    tags: optional(list(text)),
    dims: optional(numericRecord),
    noteScaffold: text,
    presentationId: optional(nullable(text)),
    builtIn: optional(bool),
    hidden: optional(bool)
  },
  comfortItems: {
    id: identity,
    text: text,
    position: numeric
  },
  importLog: {
    id: identity,
    source: text,
    importedAt: numeric,
    counts: numericRecord
  },
  areaStates: {
    area: text,
    hidden: optional(bool),
    finishedEpochDay: nullable(numeric),
    suspendedEpochDay: nullable(numeric)
  },
  marginNotes: {
    id: identity,
    entryId: text,
    epochDay: numeric,
    text: text
  },
  wordIgnore: {
    word: text
  },
  documents: {
    id: identity,
    epochDay: numeric,
    title: text,
    fileName: text,
    targetKind: nullable(oneOf(DOCUMENT_TARGET_KINDS)),
    targetId: nullable(text)
  }
} satisfies { [Name in keyof ArchiveJournal]: { [Field in keyof ArchiveJournal[Name][number]]-?: Check } };

const NON_FLAT_IDENTITY: Partial<Record<keyof ArchiveJournal, string>> = {
  dimensions: 'key',
  tagGroups: 'key',
  entries: 'uuid',
  effectCategories: 'key',
  personalEffectTypes: 'key'
};

/** Refuse unreadable rows before restore touches a file store or admits a transaction.
 * Flat descriptors remain the authority for natural identity and absent-field defaults. */
export function assertArchiveRows(
  name: keyof ArchiveJournal,
  rows: unknown[],
  flatTable?: FlatTable<unknown>
): void {
  const fields: Record<string, Check> = ROWS[name];
  const defaults = new Set(flatTable ? columnsOf(flatTable)
    .filter((column) => column.bool || column.whenAbsent !== undefined).map((column) => column.field) : []);
  const naturalIdentity = flatTable ? identityFieldOf(flatTable) : undefined;
  const identities = new Set<string>();
  for (const [index, row] of rows.entries()) {
    if (!record(row) || (naturalIdentity && !identity(row[naturalIdentity])) ||
        !Object.entries(fields).every(([field, check]) =>
          row[field] === undefined && defaults.has(field) || check(row[field]))) {
      throw new CorruptArchiveError(`the archive's ${name} row ${index + 1} is not readable`);
    }
    // Stock folds legacy duplicate drug names, but its UUID must still be unique.
    const identityFields = name === 'roadmapChecks' ? ['packKey', 'goalKey'] :
      [name === 'medicationStock' ? 'id' : naturalIdentity ?? NON_FLAT_IDENTITY[name] ?? 'id'];
    const rowIdentity = JSON.stringify(identityFields.map((field) => row[field]));
    if (identities.has(rowIdentity)) {
      throw new CorruptArchiveError(`the archive's ${name} has a repeated identity`);
    }
    identities.add(rowIdentity);
    if (name === 'presets' && new Set((row.dims as string[] | undefined) ?? []).size !==
        ((row.dims as string[] | undefined) ?? []).length) {
      throw new CorruptArchiveError('the archive has a repeated preset dimension');
    }
    if (name === 'hairStages') {
      const scale = (row.scale as string | undefined) ?? 'norwood_hamilton';
      if (!isHairStaging(scale, row.stage as string) ||
          (scale !== 'other' && row.description !== undefined && row.description !== '')) {
        throw new CorruptArchiveError(`the archive's ${name} row ${index + 1} is not readable`);
      }
    }
    if (name === 'reminders') {
      const oneOff = row.recurrence === null && row.epochDay !== null && row.interval === null && row.anchorEpochDay === null;
      const everyN = row.recurrence === 'EVERY_N_DAYS' && row.interval !== null && row.anchorEpochDay !== null && row.epochDay === null;
      const plain = (row.recurrence === 'DAILY' || row.recurrence === 'WEEKLY') &&
        row.interval === null && row.anchorEpochDay === null && row.epochDay === null;
      if (!oneOff && !everyN && !plain) throw new CorruptArchiveError(`the archive's ${name} row ${index + 1} is not readable`);
    }
    if (name === 'doseSchedules' && (row.recurrenceKind === 'everyNDays') !== (row.everyNDays !== null)) {
      throw new CorruptArchiveError(`the archive's ${name} row ${index + 1} is not readable`);
    }
    if (name === 'doseEvents') {
      // Mirrors the dose_event auto-log CHECK: all three absent, or a schedule row with all three set.
      const { autoLogEpisodeId: episode, autoLogEpochDay: day, autoLogIndex: slot } = row;
      const none = episode == null && day == null && slot == null;
      const slotted = row.source === 'schedule' && typeof episode === 'string' && episode.trim().length > 0 &&
        typeof day === 'number' && Number.isInteger(day) && typeof slot === 'number' &&
        Number.isInteger(slot) && slot >= 0;
      if (!none && !slotted) throw new CorruptArchiveError(`the archive's ${name} row ${index + 1} is not readable`);
    }
    if (name === 'documents' && (row.targetKind == null) !== (row.targetId == null)) {
      throw new CorruptArchiveError(`the archive's ${name} row ${index + 1} is not readable`);
    }
    if (name === 'checklists' && (row.ownerKind === null) !== (row.ownerId === null)) {
      throw new CorruptArchiveError(`the archive's ${name} row ${index + 1} is not readable`);
    }
  }
}

/** Resolve references from Archive rows and built-ins before SQLite or template lookup. */
export function assertArchiveReferences(journal: ArchiveJournal, externalImport = false): void {
  const unique = (ids: string[], section: string) => {
    if (new Set(ids).size !== ids.length) {
      throw new CorruptArchiveError(`the archive's ${section} has a repeated identity`);
    }
  };
  unique(journal.tagGroups.flatMap((group) => (group.tags ?? []).map((tag) => tag.id)), 'tags');
  unique([...journal.entries.flatMap((entry) => entry.photos.map((photo) => photo.id)),
    ...journal.milestones.flatMap((milestone) => milestone.photo ? [milestone.photo.id] : [])], 'photos');
  unique(journal.entries.flatMap((entry) => (entry.recordings ?? []).map((row) => row.id)), 'recordings');
  unique(journal.entries.flatMap((entry) => (entry.videos ?? []).map((row) => row.id)), 'videos');
  unique(journal.tryouts.flatMap((row) => row.photos.map((photo) => photo.id)), 'tryout photos');
  unique(journal.procedures.flatMap((row) => row.photos.map((photo) => photo.id)), 'procedure photos');
  unique(journal.hairRemovalSessions.flatMap((row) => row.photos.map((photo) => photo.id)), 'hair removal photos');
  unique(journal.checklists.flatMap((row) => row.items.map((item) => item.id)), 'checklist items');
  for (const template of journal.entryTemplates) unique(template.tags ?? [], 'template tags');
  for (const schedule of journal.doseSchedules) {
    const weekdays = schedule.weekdays ?? [];
    if (new Set(weekdays).size !== weekdays.length) {
      throw new CorruptArchiveError('the archive has a repeated schedule weekday');
    }
  }
  const dimensions = new Set([...BUILT_IN_DIMENSIONS.map((row) => row.key), ...journal.dimensions.map((row) => row.key)]);
  const tags = new Set([...BUILT_IN_TAG_GROUPS.flatMap((group) => group.tags),
    ...journal.tagGroups.flatMap((group) => (group.tags ?? []).map((tag) => tag.id))]);
  const categories = new Set([...BUILT_IN_EFFECT_CATEGORIES.map((row) => row.key),
    ...journal.effectCategories.map((row) => row.key)]);
  const procedures = new Set(journal.procedures.map((row) => row.id));
  const tryouts = new Set(journal.tryouts.map((row) => row.id));
  const presentations = new Set(journal.presentations.map((row) => row.id));
  const referenced = (value: string, known: Set<string>, section: string) => {
    if (!known.has(value)) throw new CorruptArchiveError(`the archive's ${section} reference is not readable`);
  };
  for (const preset of journal.presets) for (const key of preset.dims ?? []) referenced(key, dimensions, 'preset dimension');
  for (const template of journal.entryTemplates) {
    for (const key of Object.keys(template.dims ?? {})) referenced(key, dimensions, 'template dimension');
    for (const id of template.tags ?? []) referenced(id, tags, 'template tag');
  }
  for (const entry of journal.entries) {
    for (const key of Object.keys(entry.dims ?? {})) referenced(key, dimensions, 'entry dimension');
    // External previews reuse tags already on the destination, outside their row-only payload.
    if (!externalImport) for (const id of entry.tags ?? []) referenced(id, tags, 'entry tag');
    if (entry.presentationId) referenced(entry.presentationId, presentations, 'entry presentation');
  }
  for (const type of journal.personalEffectTypes) {
    if (type.categoryKey !== null) referenced(type.categoryKey, categories, 'effect category');
  }
  for (const milestone of journal.milestones) {
    if (milestone.procedureId) referenced(milestone.procedureId, procedures, 'milestone procedure');
    if (milestone.tryoutId) referenced(milestone.tryoutId, tryouts, 'milestone tryout');
  }
}
