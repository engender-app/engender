/* Which areas travel in an archive, and in what order they are inserted back
   (ADR-0027).

   Before this registry the answer was spelled out three times - once in the
   wire type (archive/payload.ts), once in the snapshot that reads the rows
   out (archive.ts) and once in the restore that writes them back
   (restore.ts) - plus once more in every test that builds an empty journal.
   Nothing checked the four against each other, so a new area that got three
   of them and missed the fourth simply did not travel, and no test failed:
   the archive was short an area and every expectation was built from the
   same code that had just forgotten it.

   One entry here is now what makes an area travel. What it declares:

     name      the section's key in ArchiveJournal, which is also its key on
               the wire
     after     the sections whose rows must already be in the tables before
               this one's can be written, because this one resolves a rowid
               against them. Not "children go last" as a general rule -
               a hair photo and a counterevidence snapshot both own child
               rows and depend on no other section, because they insert
               those children themselves
     read      how the area's rows come out of the journal (archiveRead.ts)
     apply     how they go back in, mode and all (archiveApply.ts)

   A flat area declares none of the last two. It declares its table instead -
   the columns, the column a present row is matched by, and the read's order
   (archiveTable.ts) - and both directions are derived from that one
   declaration. `flat` below is that form, `section` the hand-written one.

   The order sections are declared in is the order they travel in and the
   order they are read in. `after` is what re-orders them for the restore,
   so a section can be declared next to the area it belongs with rather than
   wherever the insert happens to have to go.

   Merge semantics stay inside each apply function. They genuinely differ per
   area, the reasoning is recorded where the differences are, and a policy
   language expressive enough to state all of them would be a wider interface
   over less behaviour. The registry decides which areas exist and in what
   order they insert, never what merging one of them means. */

import type { ArchiveJournal } from '../archive/payload';
import * as read from './archiveRead';
import * as apply from './archiveApply';
import type { SectionRead } from './archiveRead';
import type { Restoring } from './archiveApply';
import type { FlatColumn, FlatTable } from './archiveTable';

export type { SectionRead } from './archiveRead';
export type { Restoring } from './archiveApply';

export type ArchiveSectionName = keyof ArchiveJournal;

/** One area's declaration that it travels. Erased over the row type, because
    the list holds every section at once and because a test registers
    sections `ArchiveJournal` has never heard of. */
export interface ArchiveSection {
  name: string;
  /** Sections that must be applied before this one. Empty for most. */
  after: readonly string[];
  /** What emptying the journal of this area's rows is, children first. Empty
      only where a section holds nothing a Replace may remove, and required
      rather than optional so a new area cannot be left out of it silently. */
  discard: readonly string[];
  read(reading: SectionRead): Promise<unknown[]>;
  apply(restoring: Restoring): Promise<void>;
}

/** Keeps the row type honest at the declaration site: `read` has to return
    what `ArchiveJournal` says the section holds. */
function section<Name extends ArchiveSectionName>(declared: {
  name: Name;
  after?: readonly ArchiveSectionName[];
  discard: readonly string[];
  read(reading: SectionRead): Promise<ArchiveJournal[Name]>;
  apply(restoring: Restoring): Promise<void>;
}) {
  return { after: [], ...declared };
}

/** One flat area's row, as the wire type declares it. */
type FlatRow<Name extends ArchiveSectionName> = ArchiveJournal[Name][number];

/** A flat area: its table declared once (archiveTable.ts), and both
    directions derived from that declaration rather than written out again.
    Which areas qualify is the descriptor's own doc comment; the ones that do
    not keep the hand-written pair `section` above wires up. */
function flat<
  Name extends ArchiveSectionName,
  const Columns extends Readonly<Record<string, FlatColumn<FlatRow<Name>>>>
>(declared: {
  name: Name;
  after?: readonly ArchiveSectionName[];
  table: string;
  columns: Columns;
  identity: keyof Columns & string;
  orderBy: string;
}) {
  const table: FlatTable<FlatRow<Name>> = declared;
  return {
    name: declared.name,
    after: declared.after ?? [],
    // A flat area is one table and no children, which is the same thing that
    // makes it flat - so emptying it needs nothing declared here either.
    discard: [`DELETE FROM ${declared.table}`],
    read: (reading: SectionRead) => read.readFlatTable(table, reading),
    apply: (restoring: Restoring) => apply.applyFlatTable(table, restoring.journal[declared.name], restoring)
  };
}

const SECTIONS = [
  section({
    name: 'dimensions',
    // Only the customs. A built-in dimension the archive does not carry keeps
    // the row reconciling gave it: an archive's entries reference dimensions
    // by key, and deleting them would leave those references nothing to
    // resolve against. What the user put on a built-in is overwritten by
    // `apply` afterwards, row by row.
    discard: ['DELETE FROM gender_dimension WHERE is_built_in = 0'],
    read: read.readDimensions,
    apply: apply.applyDimensions
  }),
  // Resolves each dimension key it offers against the row applyDimensions
  // wrote.
  section({
    name: 'presets',
    after: ['dimensions'],
    discard: [
      /* Only the custom presets' links. A built-in preset the archive does
         not carry keeps the dimensions reconciling gave it: emptying the
         table wholesale left one with none at all, permanently, because
         reconciling writes a preset's links only when it writes the preset
         row. The subselect reads gender_preset, so it has to run before the
         statement below empties it. */
      'DELETE FROM preset_dimension WHERE preset_id IN (SELECT id FROM gender_preset WHERE key IS NULL)',
      'DELETE FROM gender_preset WHERE key IS NULL'
    ],
    read: read.readPresets,
    apply: apply.applyPresets
  }),
  section({
    name: 'tagGroups',
    discard: [
      'DELETE FROM tag WHERE key IS NULL',
      // A custom tag group carries a uuid and a built-in one does not; its key
      // is that same uuid, so the uuid is what tells them apart (tags.ts).
      'DELETE FROM tag_group WHERE uuid IS NOT NULL'
    ],
    read: read.readTagGroups,
    apply: apply.applyTagGroups
  }),
  section({
    name: 'affirmations',
    // Only the customs, the same reasoning dimensions' own statement gives: a
    // built-in line the archive does not carry keeps the wording reconciling
    // gave it rather than losing its row entirely.
    discard: ['DELETE FROM affirmation WHERE key IS NULL'],
    read: read.readAffirmations,
    apply: apply.applyAffirmations
  }),
  // No `after`: entry_body_region.region stores a region's domain id
  // directly (a plain string, not a rowid FK), so applyEntries never
  // resolves a body region against this section's rows the way it does
  // dimensions and tags.
  section({
    name: 'bodyRegions',
    // Same reasoning as affirmations' own statement: only the customs.
    discard: ['DELETE FROM body_region WHERE key IS NULL'],
    read: read.readBodyRegions,
    apply: apply.applyBodyRegions
  }),
  /* Reference data first: an entry's dims and tags are resolved to rowids,
     and an archive's entry must find the archive's own vocabulary rather
     than whatever this device happened to have. */
  section({
    name: 'entries',
    after: ['dimensions', 'tagGroups'],
    discard: [
      /* A photo row names exactly one owner, entry or milestone, and the
         schema's own CHECK enforces it - so this statement and the
         milestones section's cover the table between them, with neither
         reaching into the other's rows. */
      'DELETE FROM photo WHERE entry_id IS NOT NULL',
      'DELETE FROM voice_recording',
      'DELETE FROM video_note',
      'DELETE FROM entry_dimension_value',
      'DELETE FROM entry_tag',
      'DELETE FROM entry_body_region',
      /* entry_fts needs no statement of its own: migration v3's trigger drops
         an index row with its entry, which is what lets this delete entries
         without knowing the index exists. */
      'DELETE FROM entry'
    ],
    read: read.readEntries,
    apply: apply.applyEntries
  }),
  section({
    name: 'milestones',
    // The other half of the photo table, per entries' own note above.
    discard: ['DELETE FROM photo WHERE milestone_id IS NOT NULL', 'DELETE FROM milestone'],
    read: read.readMilestones,
    apply: apply.applyMilestones
  }),
  /* The dosing context comes across as it was written, never re-derived
     against this device's dose log: the log it was measured on is not the
     one being imported into (ticket 03, and the argument at migrations.ts
     v6).

     Its last five columns declare what they are written from when the field
     is absent, unlike every other column here, because they arrived after
     lab results did. An archive is JSON.parse output cast to ArchivePayload
     - the type is a claim about the file, not a guarantee - so a lab row
     written by a build from before ticket 03 reaches the insert with the
     fields simply missing, and `provider` is NOT NULL besides. An older
     archive restores with an empty context instead, which is the same thing
     a result logged before the feature carries. */
  flat({
    name: 'labResults',
    table: 'lab_result',
    identity: 'uuid',
    orderBy: 'epoch_day, id',
    columns: {
      uuid: 'id',
      epoch_day: 'epochDay',
      analyte: 'analyte',
      value: 'value',
      unit: 'unit',
      note: { field: 'note', whenNull: '' },
      draw_time: { field: 'drawTime', whenAbsent: null },
      provider: { field: 'provider', whenAbsent: '' },
      timing_route: { field: 'timingRoute', whenAbsent: null },
      timing_hours: { field: 'timingHours', whenAbsent: null },
      timing_day_of_interval: { field: 'timingDayOfInterval', whenAbsent: null }
    }
  }),
  section({
    name: 'measurementTypes',
    /* Only the customs. A measurement references its type by key
       (measurements.ts), not by rowid, so unlike a child table this needs no
       companion statement for rows that named a custom type just removed
       here - they simply keep a key nothing resolves any more, the same
       forward-compatible treatment lab_result.analyte already gets. */
    discard: ['DELETE FROM measurement_type WHERE is_built_in = 0'],
    read: read.readMeasurementTypes,
    apply: apply.applyMeasurementTypes
  }),
  // `type` names a measurement type by key rather than by rowid
  // (measurements.ts), so there is nothing here to resolve against the
  // section above and no `after` to declare.
  flat({
    name: 'measurements',
    table: 'measurement',
    identity: 'uuid',
    orderBy: 'epoch_day, id',
    columns: { uuid: 'id', type: 'type', epoch_day: 'epochDay', value: 'value', unit: 'unit' }
  }),
  flat({
    name: 'sizeRecords',
    table: 'size_record',
    identity: 'uuid',
    orderBy: 'epoch_day, id',
    columns: {
      uuid: 'id',
      epoch_day: 'epochDay',
      category: 'category',
      size: 'size',
      brand: 'brand',
      fit_note: 'fitNote'
    }
  }),
  flat({
    name: 'sideEffects',
    table: 'side_effect',
    identity: 'uuid',
    orderBy: 'epoch_day, id',
    columns: { uuid: 'id', name: 'name', severity: 'severity', epoch_day: 'epochDay' }
  }),
  flat({
    name: 'cycleEvents',
    table: 'cycle_event',
    identity: 'uuid',
    orderBy: 'epoch_day, id',
    columns: { uuid: 'id', kind: 'kind', epoch_day: 'epochDay' }
  }),
  flat({
    name: 'journalingPauses',
    table: 'journaling_pause',
    identity: 'uuid',
    orderBy: 'start_epoch_day, id',
    columns: { uuid: 'id', start_epoch_day: 'startEpochDay', end_epoch_day: 'endEpochDay' }
  }),
  section({
    name: 'effectCategories',
    /* The one section with nothing to discard, and not by omission: the
       table is built-in only - no custom-category creation is asked for,
       ticket 41's own scope - so there is never a custom row to remove, and
       a built-in row keeps what reconciling gave it the same way every other
       reference row does. */
    discard: [],
    read: read.readEffectCategories,
    apply: apply.applyEffectCategories
  }),
  section({
    name: 'personalEffectTypes',
    // Only the customs, the same reasoning measurementTypes' own statement
    // gives: a marker naming a custom effect just removed here simply keeps a
    // key nothing resolves any more.
    discard: ['DELETE FROM personal_effect_type WHERE is_built_in = 0'],
    read: read.readPersonalEffectTypes,
    apply: apply.applyPersonalEffectTypes
  }),
  /* Identified by `effect`, not by uuid: personal_effect is UNIQUE per
     effect (migrations.ts v12), one row that a fresh date replaces in place
     rather than a log of past dates - the same shape medicationStock has for
     a drug. A device that already has its own marker for an effect keeps it
     (Merge's own rule), which a Replace gets for free once the journal's
     rows have been discarded first.

     `after` here is a convention, not a requirement the insert enforces:
     personal_effect.effect stores an effect's domain key directly with no FK
     (migrations.ts v37 dropped its CHECK), so nothing breaks if this ran
     first. Declared after personalEffectTypes anyway - reference data before
     the rows that name it - matching the convention entries/dimensions/
     tagGroups set. */
  flat({
    name: 'personalEffects',
    after: ['personalEffectTypes'],
    table: 'personal_effect',
    identity: 'effect',
    orderBy: 'effect',
    columns: { uuid: 'id', effect: 'effect', first_noticed_epoch_day: 'firstNoticedEpochDay' }
  }),
  /* A row with no `scale` came out of an archive written before phase 5
     ticket 33, when Norwood-Hamilton was the only vocabulary there was, so
     it is one - the same reading migrations.ts v37 gives the rows it carried
     across. Defaulting rather than dropping is what keeps an old backup
     whole; a scale this build does not know is left as it is and the
     schema's CHECK refuses it, which is the honest failure for an archive
     from a future build. */
  flat({
    name: 'hairStages',
    table: 'hair_stage',
    identity: 'uuid',
    orderBy: 'epoch_day, id',
    columns: {
      uuid: 'id',
      epoch_day: 'epochDay',
      scale: { field: 'scale', whenAbsent: 'norwood_hamilton' },
      stage: 'stage',
      description: { field: 'description', whenAbsent: '' }
    }
  }),
  section({
    name: 'hairPhotos',
    discard: ['DELETE FROM hair_photo'],
    read: read.readHairPhotos,
    apply: apply.applyHairPhotos
  }),
  // Inserts its own photo children, the same reasoning `hairPhotos` and
  // `counterevidenceSnapshots` give - it depends on no other section.
  section({
    name: 'hairRemovalSessions',
    discard: ['DELETE FROM hair_removal_photo', 'DELETE FROM hair_removal_session'],
    read: read.readHairRemovalSessions,
    apply: apply.applyHairRemovalSessions
  }),
  // Inserts its own consult and photo children, the same reasoning
  // `hairRemovalSessions` above gives. Its recovery checklist travels in
  // `checklists` and is matched there by owner uuid, so the two sections
  // need no order between them.
  section({
    name: 'procedures',
    discard: ['DELETE FROM procedure_photo', 'DELETE FROM procedure_consult', 'DELETE FROM procedure'],
    read: read.readProcedures,
    apply: apply.applyProcedures
  }),
  // No rule validation of its own: the schema's recurrence CHECK is the same
  // rule reminderRule.ts states, and the insert is inside the transaction.
  // `auto_source` declares what it is written from when absent, the way lab
  // results' dosing columns do - an archive written before ticket 04 has no
  // such field at all.
  flat({
    name: 'reminders',
    table: 'reminder',
    identity: 'uuid',
    orderBy: 'id',
    columns: {
      uuid: 'id',
      title: 'title',
      type: 'type',
      time: 'time',
      recurrence: 'recurrence',
      interval: 'interval',
      anchor_epoch_day: 'anchorEpochDay',
      epoch_day: 'epochDay',
      enabled: { field: 'enabled', bool: true },
      auto_source: { field: 'autoSource', whenAbsent: null }
    }
  }),
  flat({
    name: 'tallyEvents',
    table: 'tally_event',
    identity: 'uuid',
    orderBy: 'epoch_day, id',
    columns: { uuid: 'id', epoch_day: 'epochDay', kind: 'kind' }
  }),
  section({
    name: 'counterevidenceSnapshots',
    discard: ['DELETE FROM doubt_snapshot_entry', 'DELETE FROM doubt_snapshot'],
    read: read.readCounterevidenceSnapshots,
    apply: apply.applyCounterevidenceSnapshots
  }),

  flat({
    name: 'letters',
    table: 'letter',
    identity: 'uuid',
    orderBy: 'epoch_day, id',
    columns: { uuid: 'id', epoch_day: 'epochDay', text: 'text', unlock_epoch_day: 'unlockEpochDay' }
  }),
  section({
    name: 'roadmapChecks',
    discard: ['DELETE FROM roadmap_check'],
    read: read.readRoadmapChecks,
    apply: apply.applyRoadmapChecks
  }),
  /* Uuid-identified like a checklist, so unlike roadmapChecks a goal already
     present locally is simply skipped rather than compared column by column:
     a custom goal's text and track are fixed at creation (roadmap.ts has no
     rename or move-track setter), so the only thing two devices could
     disagree on is the status, and skipping it here for the same reason
     applyRoadmapChecks does - a merge must not overwrite a status this
     device recorded itself. */
  flat({
    name: 'roadmapGoals',
    table: 'roadmap_goal',
    identity: 'uuid',
    orderBy: 'id',
    columns: { uuid: 'id', track: 'track', text: 'text', status: 'status' }
  }),
  // `end_epoch_day` is absent on an archive from before ticket 38 - read as
  // still ongoing, the same as every pre-existing episode's backfill (v40).
  flat({
    name: 'regimenEpisodes',
    table: 'regimen_episode',
    identity: 'uuid',
    orderBy: 'start_epoch_day, id',
    columns: {
      uuid: 'id',
      drug: 'drug',
      ester: 'ester',
      dose: 'dose',
      dose_unit: 'doseUnit',
      route: 'route',
      interval: 'interval',
      start_epoch_day: 'startEpochDay',
      end_epoch_day: { field: 'endEpochDay', whenAbsent: null }
    }
  }),
  // Carries no episode link: which episode a dose belongs to is resolved
  // from its own timestamp above the seam (regimenEpisode.ts), so unlike the
  // schedules and pauses below this needs no `after`. `drug` is absent on an
  // archive from before ticket 38 - null, same as every dose ever logged
  // without one.
  flat({
    name: 'doseEvents',
    table: 'dose_event',
    identity: 'uuid',
    orderBy: 'timestamp, id',
    columns: {
      uuid: 'id',
      timestamp: 'timestamp',
      route: 'route',
      dose: 'dose',
      dose_unit: 'doseUnit',
      injection_site: 'injectionSite',
      vehicle: 'vehicle',
      application_site: 'applicationSite',
      status: 'status',
      scheduled_dose: 'scheduledDose',
      scheduled_route: 'scheduledRoute',
      scheduled_timestamp: 'scheduledTimestamp',
      drug: { field: 'drug', whenAbsent: null }
    }
  }),
  // Both hang off an episode rowid, and the rows applyRegimenEpisodes just
  // inserted are where those rowids come from.
  section({
    name: 'doseSchedules',
    after: ['regimenEpisodes'],
    /* The weekdays and dose amounts hang off the schedule, so they clear
       first. That the schedule itself clears before the episodes it hangs off
       is `after` doing the work: the discard order is the insert order
       reversed. The foreign keys would cascade, but only with
       `PRAGMA foreign_keys` on, which is the driver's business and not
       something this ordering should depend on. */
    discard: [
      'DELETE FROM dose_schedule_weekday',
      'DELETE FROM dose_schedule_dose_amount',
      'DELETE FROM dose_schedule'
    ],
    read: read.readDoseSchedules,
    apply: apply.applyDoseSchedules
  }),
  section({
    name: 'dosePauses',
    after: ['regimenEpisodes'],
    discard: ['DELETE FROM dose_pause'],
    read: read.readDosePauses,
    apply: apply.applyDosePauses
  }),
  /* Identified by `drug`, not by uuid: medication_stock is UNIQUE per drug
     (migrations.ts v7), one row that a fresh count replaces in place rather
     than a log of past ones - the same shape personalEffects has for an
     effect. The reminder bookkeeping travels as recorded: restoring a
     device's own backup should restore its own hand-off state, not a blank
     one (see ArchiveMedicationStock's own comment). */
  flat({
    name: 'medicationStock',
    table: 'medication_stock',
    identity: 'drug',
    orderBy: 'drug',
    columns: {
      uuid: 'id',
      drug: 'drug',
      quantity: 'quantity',
      unit: 'unit',
      recorded_epoch_day: 'recordedEpochDay',
      reminder_ever_created: { field: 'reminderEverCreated', bool: true },
      reminder_dismissed: { field: 'reminderDismissed', bool: true }
    }
  }),
  // Inserts its own photo children, the same reasoning `hairRemovalSessions`
  // and `procedures` above give.
  section({
    name: 'tryouts',
    discard: ['DELETE FROM tryout_photo', 'DELETE FROM tryout'],
    read: read.readTryouts,
    apply: apply.applyTryouts
  }),
  // A felt-sense row hangs off a tryout or a milestone rowid (phase 5
  // ticket 24), the same way a dose schedule hangs off an episode's.
  section({
    name: 'feltSenseEntries',
    after: ['tryouts', 'milestones'],
    // Clears before both tryout and milestone, which is `after` reversed
    // again rather than anything stated here.
    discard: ['DELETE FROM felt_sense'],
    read: read.readFeltSenseEntries,
    apply: apply.applyFeltSenseEntries
  }),
  section({
    name: 'checklists',
    discard: ['DELETE FROM checklist_item', 'DELETE FROM checklist'],
    read: read.readChecklists,
    apply: apply.applyChecklists
  }),
  /* No episode or reminder rowid to resolve, unlike dose events and stock -
     a wear session's own optional reminder travels as an ordinary
     ArchiveReminder, matched back up by its auto_source marker rather than a
     link this section would have to carry. */
  flat({
    name: 'wearSessions',
    table: 'wear_session',
    identity: 'uuid',
    orderBy: 'start_timestamp, id',
    columns: { uuid: 'id', start_timestamp: 'startTimestamp', duration_ms: 'durationMs', note: 'note' }
  }),
  /* Voice benchmarks (phase 5 deepening ticket 15). Flat: one row per take,
     no children, no rowid resolved against another section. Its two audio
     files travel in the body the way a recording's does - archive.ts's
     manifest reads their names off this table - and the file names in these
     columns are what pairs a row back up with the bytes on the way in.

     `passage_key` has a `whenAbsent`: no archive written before this ticket
     carries the field at all, and there are none to migrate, but the flat
     writer binds undefined as a raw driver error rather than as a null. */
  flat({
    name: 'voiceBenchmarks',
    table: 'voice_benchmark',
    identity: 'uuid',
    orderBy: 'epoch_day, id',
    columns: {
      uuid: 'id',
      epoch_day: 'epochDay',
      timestamp: 'timestamp',
      passage_key: { field: 'passageKey', whenAbsent: 'builtin' },
      passage_file_path: 'passageFileName',
      vowel_file_path: 'vowelFileName',
      f0_median_hz: 'f0MedianHz',
      f0_p10_hz: 'f0P10Hz',
      f0_p90_hz: 'f0P90Hz',
      semitone_sd: 'semitoneSd',
      words_per_minute: 'wordsPerMinute',
      f1_hz: 'f1Hz',
      f2_hz: 'f2Hz',
      snr_db: 'snrDb',
      note: 'note'
    }
  })
] as const;

/* A section on the wire type with no entry above would be written into every
   archive as an absent key and read back as nothing, silently. This line
   makes that a compile error instead. */
type Unregistered = Exclude<ArchiveSectionName, (typeof SECTIONS)[number]['name']>;
type AssertNoneUnregistered<Missing extends never> = Missing;
export type EverySectionRegistered = AssertNoneUnregistered<Unregistered>;

export const ARCHIVE_SECTIONS: readonly ArchiveSection[] = SECTIONS;

/** Every section's key, in wire order. */
export const ARCHIVE_SECTION_NAMES: readonly ArchiveSectionName[] = SECTIONS.map((s) => s.name);

/** A journal with every section present and empty - what an importer builds
    on and what a test that cares about one section starts from. */
export function emptyArchiveJournal(): ArchiveJournal {
  const journal: Record<string, unknown[]> = {};
  for (const { name } of ARCHIVE_SECTIONS) journal[name] = [];
  return journal as unknown as ArchiveJournal;
}

/** The declared order, with every section moved after the ones it says it
    depends on. Declaration order is the tiebreak, so a section with no
    constraint stays where it was written and the wire order is what a reader
    sees.

    Throws rather than guessing: a section naming a dependency that is not in
    the list, or a cycle between two, is a registry that cannot be satisfied,
    and the only alternative is inserting rows against rowids that are not
    there yet. */
export function orderedSections(sections: readonly ArchiveSection[] = ARCHIVE_SECTIONS): ArchiveSection[] {
  const byName = new Map(sections.map((s) => [s.name, s]));
  const ordered: ArchiveSection[] = [];
  const placed = new Set<string>();
  const visiting = new Set<string>();

  const place = (s: ArchiveSection): void => {
    if (placed.has(s.name)) return;
    if (visiting.has(s.name)) throw new Error(`archive sections depend on each other in a cycle: ${s.name}`);
    visiting.add(s.name);
    for (const dependency of s.after) {
      const parent = byName.get(dependency);
      if (!parent) throw new Error(`archive section ${s.name} is declared after ${dependency}, which is not registered`);
      place(parent);
    }
    visiting.delete(s.name);
    placed.add(s.name);
    ordered.push(s);
  };

  for (const s of sections) place(s);
  return ordered;
}

/** Everything an archive is about to install, gone: every section's own
    statements, sections in the reverse of the order they insert in.

    What makes this derived rather than maintained is that each section owns
    its own statements - the 51 that used to be hand-ordered in restore.ts
    named tables no section admitted to, and the demo kept a second copy of
    the list that reached only seven of the thirty-six sections. The registry
    now supplies both the statements and their order, and its oracle checks
    them against the schema table by table (archiveSections.test.ts).

    The reverse of the insert order, specifically, because that is the order
    that stays correct as statements get more particular. A section that
    resolves a rowid against another's rows says so with `after`, so it
    inserts second and therefore clears first, before the rows it points at
    are gone; children inside one section are that section's own business and
    are declared children-first. Today no statement across two sections
    actually needs it - every child table is emptied wholesale, and every
    foreign key in the schema cascades - so this is the rule holding the shape
    open rather than a bug being avoided. The one ordering a statement does
    depend on is inside a section: `presets` filters preset_dimension by a
    subselect over gender_preset, and has to run before it empties that.

    Not a caller's list to compose: restore.ts runs it inside its Replace
    transaction and `Journal.discardEverything` runs it on its own (journal.ts,
    for the demo bar's state jumps), and both mean the same thing by emptying
    the journal.

    Built-in reference rows survive, per the statements themselves: an
    archive's entries reference dimensions and tags by key, and deleting those
    rows would leave the references nothing to resolve against. */
export function discardStatements(sections: readonly ArchiveSection[] = ARCHIVE_SECTIONS): string[] {
  return orderedSections(sections)
    .reverse()
    .flatMap((s) => s.discard);
}

/** Every section's rows, in wire order. */
export async function readArchiveJournal(
  reading: SectionRead,
  sections: readonly ArchiveSection[] = ARCHIVE_SECTIONS
): Promise<ArchiveJournal> {
  const journal: Record<string, unknown[]> = {};
  for (const s of sections) journal[s.name] = await s.read(reading);
  return journal as unknown as ArchiveJournal;
}

/** Every section written back, each one after whatever it depends on.
    Sequential and inside the caller's transaction: the later sections
    resolve rowids the earlier ones produced. */
export async function applyArchiveJournal(
  restoring: Restoring,
  sections: readonly ArchiveSection[] = ARCHIVE_SECTIONS
): Promise<void> {
  for (const s of orderedSections(sections)) await s.apply(restoring);
}
