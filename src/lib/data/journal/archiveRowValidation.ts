import type { ArchiveJournal } from '../archive/payload';
import { CorruptArchiveError } from '../archive/container';
import { BODY_REGION_INTENSITY_MAX, BODY_REGION_INTENSITY_MIN, BODY_REGION_MIDPOINT } from '../bodyMap';
import {
  CYCLE_EVENT_KINDS, DOCUMENT_TARGET_KINDS, DOSE_RECURRENCE_KINDS,
  EFFECT_DIRECTIONS_STORED, HAIR_REMOVAL_AREAS, HAIR_REMOVAL_METHODS, REMINDER_RECURRENCES,
  DROPPED_TRYOUT_KINDS, TRYOUT_KINDS, INSTITUTION_STATUSES
} from '../rowValues';
import {
  BUILT_IN_DIMENSIONS, BUILT_IN_EFFECT_CATEGORIES, BUILT_IN_TAG_GROUPS
} from '../vocabulary/builtins';
import { columnsOf, identityFieldOf, type FlatTable } from './archiveTable';
import { isCurrencyCode, isValidAmount } from '../cost';
import { FIRST_EPOCH_DAY, MAX_FUTURE_EPOCH_DAYS, todayEpochDay } from '../epochDay';
import { MAX_DOSES_PER_DAY } from '../doseSchedule';
import { MAX_TAPER_DAYS, MAX_TAPER_STAGES, MAX_TIMES_PER_DAY } from '../taperSchedule';
import { isStoredPitchTrack } from '../../audio/track';

type Check = (value: unknown) => boolean;
const text: Check = (value) => typeof value === 'string';
// A lone surrogate is not text SQLite can round-trip, so an id holding one is
// unreadable. Nor is a NUL: the driver reads the stored text back cut short
// at it, so the next Merge could not match the row (re-check carpet 11, F4).
const NUL = String.fromCharCode(0);
const identity: Check = (value) => typeof value === 'string' && value.trim().length > 0 && value.isWellFormed() &&
  !value.includes(NUL);
const bool: Check = (value) => typeof value === 'boolean';
const numeric: Check = (value) => typeof value === 'number' && Number.isFinite(value) &&
  (!Number.isInteger(value) || Number.isSafeInteger(value));
const nullable = (check: Check): Check => (value) => value === null || check(value);
const optional = (check: Check): Check => (value) => value === undefined || check(value);
const oneOf = (values: readonly string[]): Check => (value) => typeof value === 'string' && values.includes(value);
const integerBetween = (min: number, max: number): Check => (value) =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;
/* Screens trust a stored day to be human-scale (a rail of years, an axis of
   months, a schedule walked day by day), so a day outside
   [FIRST_EPOCH_DAY, today + MAX_FUTURE_EPOCH_DAYS] is not an archive this app
   wrote: the date picker stops at the same two ends. */
/** An epoch day of a dated row (`numeric` stays for every other number). Read
    at check time, so the future bound moves with the clock. */
const calendarDay: Check = (value) =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= FIRST_EPOCH_DAY &&
  value <= todayEpochDay() + MAX_FUTURE_EPOCH_DAYS;
// A wall-clock time in milliseconds, as `updated_at` and Trash hold one.
const instant = integerBetween(0, Number.MAX_SAFE_INTEGER);
// When the row was last written (functional audit ticket 48), on every row
// and every nested child that has a table of its own; absent on an archive
// written before it.
const STAMP = { updatedAt: optional(instant) };
// `HH:MM` on a 24-hour clock, appointments.ts's own rule for a stored time.
const clockTime: Check = (value) => typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
// A cost (functional audit ticket 30) is three fields on each costed row,
// absent on an archive written before it; cost.ts's assertValidCost is the
// rule, and the amount-and-currency pairing is checked per row below.
const COST_FIELDS = {
  costAmount: optional(nullable(isValidAmount)),
  costCurrency: optional(nullable(isCurrencyCode)),
  costRefunded: optional(bool)
};
const COSTED_SECTIONS: readonly string[] = ['hairRemovalSessions', 'appointments', 'procedures', 'labResults', 'medicationStock'];
const list = (check: Check): Check => (value) => Array.isArray(value) && value.every(check);
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const numericRecord: Check = (value) => record(value) && Object.values(value).every(numeric);
const bodyRegionValue = integerBetween(BODY_REGION_INTENSITY_MIN, BODY_REGION_INTENSITY_MAX);
const bodyRegionValues: Check = (value) => record(value) && Object.values(value).every((v) =>
  bodyRegionValue(v) && v !== BODY_REGION_MIDPOINT);
const finiteBetween = (min: number, max: number): Check => (value) =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
/** A taper's stages (taperSchedule.ts): a list of at most MAX_TAPER_STAGES
    stages whose days add up to at most MAX_TAPER_DAYS. Fractions pass: the
    editor has always let a person type them. The column is JSON text, so
    it is read here rather than trusted. Days only need to be above zero
    (`Number.MIN_VALUE` is the smallest positive number). */
const taperStages: Check = (value) => {
  if (typeof value !== 'string') return false;
  let stages: unknown;
  try { stages = JSON.parse(value); } catch { return false; }
  if (!Array.isArray(stages) || stages.length < 1 || stages.length > MAX_TAPER_STAGES) return false;
  let total = 0;
  for (const stage of stages) {
    if (!record(stage) || !finiteBetween(Number.MIN_VALUE, MAX_TAPER_DAYS)(stage.days) ||
        !finiteBetween(0, MAX_TAPER_DAYS)(stage.everyNDays) ||
        !(stage.timesPerDay === undefined || integerBetween(1, MAX_TIMES_PER_DAY)(stage.timesPerDay))) return false;
    total += stage.days as number;
  }
  return total <= MAX_TAPER_DAYS;
};
const object = (fields: Record<string, Check>): Check => (value) =>
  record(value) && Object.entries(fields).every(([field, check]) => check(value[field]));

// These contracts follow the wire rows, not SQLite's permissive coercions.
// Missing booleans keep the existing false default; legacy fields keep their apply defaults.
const tag = object({
  ...STAMP,
  id: identity,
  label: text,
  builtIn: optional(bool),
  hidden: optional(bool)
});

const photo = object({
  ...STAMP,
  id: identity,
  fileName: text,
  starred: optional(bool),
  epochDayOverride: optional(nullable(calendarDay))
});

const voiceRecording = object({
  ...STAMP,
  id: identity,
  fileName: text
});

const videoNote = object({
  ...STAMP,
  id: identity,
  fileName: text
});

const hairRemovalPhoto = object({
  ...STAMP,
  id: identity,
  fileName: text
});

const procedurePhoto = object({
  ...STAMP,
  id: identity,
  epochDay: calendarDay,
  fileName: text
});

const appointmentStatus = object({
  ...STAMP,
  id: identity,
  epochDay: calendarDay,
  status: text
});

const tryoutPhoto = object({
  ...STAMP,
  id: identity,
  epochDay: calendarDay,
  fileName: text
});

const checklistItem = object({
  ...STAMP,
  id: identity,
  content: text,
  checked: optional(bool),
  carriedForward: optional(bool)
});

const ROWS = {
  dimensions: {
    ...STAMP,
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
    ...STAMP,
    id: identity,
    name: text,
    builtIn: optional(bool),
    dims: optional(list(text))
  },
  tagGroups: {
    ...STAMP,
    key: identity,
    name: text,
    enabled: optional(bool),
    builtIn: optional(bool),
    tags: optional(list(tag))
  },
  bodyRegions: {
    ...STAMP,
    id: identity,
    name: text,
    builtIn: optional(bool),
    hidden: optional(bool)
  },
  entries: {
    ...STAMP,
    uuid: identity,
    epochDay: calendarDay,
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
    presentationId: optional(nullable(text)),
    trashedAt: optional(nullable(instant))
  },
  milestones: {
    ...STAMP,
    id: identity,
    name: text,
    epochDay: calendarDay,
    description: optional(text),
    templateKey: nullable(text),
    roadmapGoalKey: optional(nullable(text)),
    procedureId: optional(nullable(text)),
    tryoutId: optional(nullable(text)),
    celebrate: optional((value) => value === false),
    photo: optional(nullable(photo))
  },
  labResults: {
    ...STAMP,
    id: identity,
    epochDay: calendarDay,
    analyte: text,
    value: numeric,
    unit: text,
    note: text,
    drawTime: nullable(text),
    provider: text,
    timingRoute: nullable(text),
    timingHours: nullable(numeric),
    timingDayOfInterval: nullable(numeric),
    ...COST_FIELDS
  },
  taper: {
    ...STAMP,
    id: identity,
    procedureId: text,
    startEpochDay: calendarDay,
    stagesJson: taperStages
  },
  taperSessions: {
    ...STAMP,
    id: identity,
    epochDay: calendarDay,
    note: text
  },
  sideEffects: {
    ...STAMP,
    id: identity,
    name: text,
    severity: nullable(integerBetween(1, 5)),
    epochDay: calendarDay,
    resolvedEpochDay: optional(nullable(calendarDay))
  },
  cycleEvents: {
    ...STAMP,
    id: identity,
    kind: oneOf(CYCLE_EVENT_KINDS),
    epochDay: calendarDay
  },
  eras: {
    ...STAMP,
    id: identity,
    name: text,
    startEpochDay: nullable(calendarDay),
    endEpochDay: nullable(calendarDay)
  },
  eraMutes: {
    ...STAMP,
    eraUuid: text
  },
  personalEffects: {
    ...STAMP,
    id: identity,
    effect: text,
    firstNoticedEpochDay: calendarDay
  },
  effectCategories: {
    ...STAMP,
    key: identity,
    name: text,
    enabled: optional(bool)
  },
  personalEffectTypes: {
    ...STAMP,
    key: identity,
    name: text,
    builtIn: optional(bool),
    hidden: optional(bool),
    categoryKey: nullable(text),
    direction: nullable(oneOf(EFFECT_DIRECTIONS_STORED))
  },
  progressPoses: {
    ...STAMP,
    id: identity,
    name: text,
    builtIn: optional(bool),
    hidden: optional(bool)
  },
  progressPhotos: {
    ...STAMP,
    id: identity,
    epochDay: calendarDay,
    pose: text,
    fileName: text
  },
  hairRemovalSessions: {
    ...STAMP,
    id: identity,
    epochDay: calendarDay,
    area: oneOf(HAIR_REMOVAL_AREAS),
    method: oneOf(HAIR_REMOVAL_METHODS),
    painRating: nullable(integerBetween(1, 5)),
    minutes: optional(nullable(integerBetween(1, 1440))),
    // The free text before ticket 30; restore reads it by cost.ts's rule.
    cost: optional(text),
    provider: text,
    photos: list(hairRemovalPhoto),
    note: optional(nullable(text)),
    ...COST_FIELDS
  },
  procedures: {
    ...STAMP,
    id: identity,
    name: text,
    surgeryEpochDay: nullable(calendarDay),
    notes: text,
    photos: list(procedurePhoto),
    kind: optional(text),
    dilationOptIn: optional(bool),
    archived: optional(bool),
    ...COST_FIELDS
  },
  appointments: {
    ...STAMP,
    id: identity,
    epochDay: nullable(calendarDay),
    procedureId: nullable(text),
    kind: nullable(text),
    place: nullable(text),
    note: nullable(text),
    referredEpochDay: optional(nullable(calendarDay)),
    statuses: optional(list(appointmentStatus)),
    time: optional(nullable(clockTime)),
    providerId: optional(nullable(text)),
    ...COST_FIELDS
  },
  providers: {
    ...STAMP,
    id: identity,
    // Not blank, the rule upsertProvider keeps: a nameless provider has
    // nothing to be picked by.
    name: identity,
    contact: nullable(text),
    competence: nullable(text),
    impressions: nullable(text)
  },
  reminders: {
    ...STAMP,
    id: identity,
    title: text,
    time: text,
    recurrence: nullable(oneOf(REMINDER_RECURRENCES)),
    interval: nullable(numeric),
    anchorEpochDay: nullable(calendarDay),
    epochDay: nullable(calendarDay),
    enabled: optional(bool),
    autoSource: nullable(text),
    drug: optional(nullable(text))
  },
  letters: {
    ...STAMP,
    id: identity,
    epochDay: calendarDay,
    text: text,
    unlockEpochDay: calendarDay
  },
  voicePracticeTakes: {
    ...STAMP,
    id: identity,
    epochDay: calendarDay,
    minHz: numeric,
    maxHz: numeric,
    medianHz: numeric,
    feltSense: nullable(numeric)
  },
  roadmapChecks: {
    ...STAMP,
    packKey: identity,
    goalKey: identity,
    status: text,
    hidden: optional(bool)
  },
  roadmapCategories: {
    ...STAMP,
    id: identity,
    name: text
  },
  roadmapInstitutions: {
    ...STAMP,
    id: identity,
    // Not blank, the rule addInstitution keeps.
    name: identity
  },
  roadmapInstitutionChanges: {
    ...STAMP,
    id: identity,
    institution: identity,
    status: oneOf(INSTITUTION_STATUSES),
    epochDay: calendarDay,
    note: nullable(text)
  },
  roadmapGoals: {
    ...STAMP,
    id: identity,
    track: text,
    text: text,
    status: text
  },
  regimenEpisodes: {
    ...STAMP,
    id: identity,
    drug: text,
    drugClass: text,
    ester: nullable(text),
    dose: numeric,
    doseUnit: text,
    route: text,
    interval: text,
    startEpochDay: calendarDay,
    endEpochDay: nullable(calendarDay),
    endReason: nullable(text),
    hidden: optional(bool)
  },
  doseEvents: {
    ...STAMP,
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
    autoLogEpochDay: optional(nullable(calendarDay)),
    autoLogIndex: optional(nullable(numeric))
  },
  doseSchedules: {
    ...STAMP,
    id: identity,
    episodeId: text,
    recurrenceKind: oneOf(DOSE_RECURRENCE_KINDS),
    everyNDays: nullable(numeric),
    weekdays: nullable(list(integerBetween(0, 6))),
    dosesPerDay: integerBetween(1, MAX_DOSES_PER_DAY),
    doseAmounts: nullable(list(object({ dose: numeric, doseUnit: text }))),
    autoLogFromEpochDay: optional(nullable(calendarDay))
  },
  dosePauses: {
    ...STAMP,
    id: identity,
    episodeId: text,
    startEpochDay: calendarDay,
    endEpochDay: nullable(calendarDay),
    reason: text
  },
  medicationStock: {
    ...STAMP,
    id: identity,
    drug: text,
    quantity: numeric,
    unit: text,
    recordedEpochDay: calendarDay,
    reminderEverCreated: optional(bool),
    reminderDismissed: optional(bool),
    openedEpochDay: nullable(calendarDay),
    inUseWindowDays: nullable(numeric),
    inUseEndEpochDay: nullable(calendarDay),
    leadTimeDays: nullable(numeric),
    dosesPerUnit: nullable(numeric),
    expiryEpochDay: optional(nullable(calendarDay)),
    pharmacyNote: optional(nullable(text)),
    ...COST_FIELDS
  },
  tryouts: {
    ...STAMP,
    id: identity,
    kind: oneOf([...TRYOUT_KINDS, ...DROPPED_TRYOUT_KINDS]),
    label: text,
    description: nullable(text),
    startEpochDay: calendarDay,
    endEpochDay: nullable(calendarDay),
    photos: list(tryoutPhoto)
  },
  feltSenseEntries: {
    ...STAMP,
    id: identity,
    tryoutId: text,
    epochDay: calendarDay,
    mood: integerBetween(1, 5),
    note: nullable(text)
  },
  checklists: {
    ...STAMP,
    id: identity,
    ownerKind: nullable(text),
    ownerId: nullable(text),
    appointmentEpochDay: optional(nullable(calendarDay)),
    items: list(checklistItem)
  },
  wearSessions: {
    ...STAMP,
    id: identity,
    kind: text,
    startTimestamp: numeric,
    durationMs: nullable(numeric),
    note: nullable(text)
  },
  voiceBenchmarks: {
    ...STAMP,
    id: identity,
    epochDay: calendarDay,
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
    pitchTrack: nullable((value) => typeof value === 'string' && isStoredPitchTrack(value)),
    captureChain: nullable(text),
    resonanceScale: nullable(numeric)
  },
  presentations: {
    ...STAMP,
    id: identity,
    name: text,
    roleIndex: numeric,
    hidden: optional(bool)
  },
  comfortItems: {
    ...STAMP,
    id: identity,
    text: text,
    position: numeric
  },
  importLog: {
    ...STAMP,
    id: identity,
    source: text,
    importedAt: numeric,
    counts: numericRecord
  },
  areaStates: {
    ...STAMP,
    area: text,
    hidden: optional(bool),
    finishedEpochDay: nullable(calendarDay),
    suspendedEpochDay: nullable(calendarDay)
  },
  marginNotes: {
    ...STAMP,
    id: identity,
    entryId: text,
    epochDay: calendarDay,
    text: text
  },
  documents: {
    ...STAMP,
    id: identity,
    epochDay: calendarDay,
    title: text,
    fileName: text,
    targetKind: nullable(oneOf(DOCUMENT_TARGET_KINDS)),
    targetId: nullable(text)
  },
  deletions: {
    table: identity,
    id: identity,
    deletedAt: instant
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
    const identityFields = name === 'roadmapChecks' ? ['packKey', 'goalKey'] : name === 'deletions' ? ['table', 'id'] :
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
    if (COSTED_SECTIONS.includes(name) && (row.costAmount == null) !== (row.costCurrency == null)) {
      throw new CorruptArchiveError(`the archive's ${name} row ${index + 1} is not readable`);
    }
    if (name === 'sideEffects' && typeof row.resolvedEpochDay === 'number' && row.resolvedEpochDay < (row.epochDay as number)) {
      throw new CorruptArchiveError(`the archive's ${name} row ${index + 1} is not readable`);
    }
    if (name === 'reminders') {
      const oneOff = row.recurrence === null && row.epochDay !== null && row.interval === null && row.anchorEpochDay === null;
      const everyN = row.recurrence === 'EVERY_N_DAYS' && row.interval !== null && row.anchorEpochDay !== null && row.epochDay === null;
      const plain = row.recurrence === 'DAILY' &&
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
    /* Loose `== null` on purpose: undefined counts as absent, so a link with
       one half missing entirely (what the strict fuzz produces) is refused
       the same as one with a null half. */
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
  for (const entry of journal.entries) {
    for (const key of Object.keys(entry.dims ?? {})) referenced(key, dimensions, 'entry dimension');
    // External previews reuse tags already on the destination, outside their row-only payload.
    if (!externalImport) for (const id of entry.tags ?? []) referenced(id, tags, 'entry tag');
    // An empty string is a reference too (it would fail the foreign key at insert), so only absent and null mean none.
    if (entry.presentationId !== undefined && entry.presentationId !== null) referenced(entry.presentationId, presentations, 'entry presentation');
  }
  for (const type of journal.personalEffectTypes) {
    if (type.categoryKey !== null) referenced(type.categoryKey, categories, 'effect category');
  }
  for (const milestone of journal.milestones) {
    if (milestone.procedureId) referenced(milestone.procedureId, procedures, 'milestone procedure');
    if (milestone.tryoutId) referenced(milestone.tryoutId, tryouts, 'milestone tryout');
  }
}
