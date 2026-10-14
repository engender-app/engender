import type { ArchiveJournal } from '../archive/payload';
import { CorruptArchiveError } from '../archive/container';
import { columnsOf, identityFieldOf, type FlatTable } from './archiveTable';

type Check = (value: unknown) => boolean;
const text: Check = (value) => typeof value === 'string';
const identity: Check = (value) => typeof value === 'string' && value.trim().length > 0;
const bool: Check = (value) => typeof value === 'boolean';
const numeric: Check = (value) => typeof value === 'number' && Number.isFinite(value) &&
  (!Number.isInteger(value) || Number.isSafeInteger(value));
const nullable = (check: Check): Check => (value) => value === null || check(value);
const optional = (check: Check): Check => (value) => value === undefined || check(value);
const list = (check: Check): Check => (value) => Array.isArray(value) && value.every(check);
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const numericRecord: Check = (value) => record(value) && Object.values(value).every(numeric);
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

const procedureConsult = object({
  id: identity,
  epochDay: numeric
});

const procedurePhoto = object({
  id: identity,
  epochDay: numeric,
  fileName: text
});

const counterevidenceEntry = object({
  epochDay: numeric,
  mood: nullable(numeric),
  note: text
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
  affirmations: {
    id: identity,
    language: nullable(text),
    text: text,
    builtIn: optional(bool),
    hidden: optional(bool)
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
    bodyRegions: optional(numericRecord),
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
  measurementTypes: {
    key: identity,
    name: text,
    builtIn: optional(bool),
    hidden: optional(bool)
  },
  measurements: {
    id: identity,
    type: text,
    epochDay: numeric,
    value: numeric,
    unit: text
  },
  sizeRecords: {
    id: identity,
    epochDay: numeric,
    category: text,
    size: text,
    brand: text,
    fitNote: text
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
    severity: nullable(numeric),
    epochDay: numeric
  },
  cycleEvents: {
    id: identity,
    kind: text,
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
    direction: nullable(text)
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
    area: text,
    method: text,
    painRating: numeric,
    cost: text,
    provider: text,
    photos: list(hairRemovalPhoto)
  },
  procedures: {
    id: identity,
    name: text,
    surgeryEpochDay: nullable(numeric),
    consults: optional(list(procedureConsult)),
    notes: text,
    photos: list(procedurePhoto),
    kind: optional(text),
    dilationOptIn: optional(bool),
    archived: optional(bool)
  },
  appointments: {
    id: identity,
    epochDay: numeric,
    procedureId: nullable(text),
    kind: nullable(text),
    place: nullable(text),
    note: nullable(text)
  },
  reminders: {
    id: identity,
    title: text,
    type: text,
    time: text,
    recurrence: nullable(text),
    interval: nullable(numeric),
    anchorEpochDay: nullable(numeric),
    epochDay: nullable(numeric),
    enabled: optional(bool),
    autoSource: nullable(text)
  },
  tallyEvents: {
    id: identity,
    epochDay: numeric,
    kind: text
  },
  counterevidenceSnapshots: {
    id: identity,
    epochDay: numeric,
    timestamp: numeric,
    items: optional(list(counterevidenceEntry))
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
    recurrenceKind: text,
    everyNDays: nullable(numeric),
    weekdays: nullable(list(numeric)),
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
    dosesPerUnit: nullable(numeric)
  },
  tryouts: {
    id: identity,
    kind: text,
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
    mood: numeric,
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
  savedQuestions: {
    id: identity,
    name: text,
    queryText: text,
    tagIds: text,
    moods: text,
    startEpochDay: nullable(numeric),
    endEpochDay: nullable(numeric),
    hasNote: optional(bool),
    hasPhoto: optional(bool),
    starred: optional(bool)
  },
  revisits: {
    id: identity,
    entryId: text,
    entryEpochDay: numeric,
    createdEpochDay: numeric,
    targetEpochDay: numeric
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
    targetKind: nullable(text),
    targetId: nullable(text)
  }
} satisfies { [Name in keyof ArchiveJournal]: { [Field in keyof ArchiveJournal[Name][number]]-?: Check } };

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
  for (const [index, row] of rows.entries()) {
    if (!record(row) || (naturalIdentity && !identity(row[naturalIdentity])) ||
        !Object.entries(fields).every(([field, check]) =>
          row[field] === undefined && defaults.has(field) || check(row[field]))) {
      throw new CorruptArchiveError(`the archive's ${name} row ${index + 1} is not readable`);
    }
  }
}
