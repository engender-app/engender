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
  read(reading: SectionRead): Promise<unknown[]>;
  apply(restoring: Restoring): Promise<void>;
}

/** Keeps the row type honest at the declaration site: `read` has to return
    what `ArchiveJournal` says the section holds. */
function section<Name extends ArchiveSectionName>(declared: {
  name: Name;
  after?: readonly ArchiveSectionName[];
  read(reading: SectionRead): Promise<ArchiveJournal[Name]>;
  apply(restoring: Restoring): Promise<void>;
}) {
  return { after: [], ...declared };
}

const SECTIONS = [
  section({ name: 'dimensions', read: read.readDimensions, apply: apply.applyDimensions }),
  // Resolves each dimension key it offers against the row applyDimensions
  // wrote.
  section({ name: 'presets', after: ['dimensions'], read: read.readPresets, apply: apply.applyPresets }),
  section({ name: 'tagGroups', read: read.readTagGroups, apply: apply.applyTagGroups }),
  /* Reference data first: an entry's dims and tags are resolved to rowids,
     and an archive's entry must find the archive's own vocabulary rather
     than whatever this device happened to have. */
  section({ name: 'entries', after: ['dimensions', 'tagGroups'], read: read.readEntries, apply: apply.applyEntries }),
  section({ name: 'milestones', read: read.readMilestones, apply: apply.applyMilestones }),
  section({ name: 'labResults', read: read.readLabResults, apply: apply.applyLabResults }),
  section({ name: 'measurements', read: read.readMeasurements, apply: apply.applyMeasurements }),
  section({ name: 'sideEffects', read: read.readSideEffects, apply: apply.applySideEffects }),
  section({ name: 'cycleEvents', read: read.readCycleEvents, apply: apply.applyCycleEvents }),
  section({ name: 'personalEffects', read: read.readPersonalEffects, apply: apply.applyPersonalEffects }),
  section({ name: 'hairStages', read: read.readHairStages, apply: apply.applyHairStages }),
  section({ name: 'hairPhotos', read: read.readHairPhotos, apply: apply.applyHairPhotos }),
  // Inserts its own photo children, the same reasoning `hairPhotos` and
  // `counterevidenceSnapshots` give - it depends on no other section.
  section({
    name: 'hairRemovalSessions',
    read: read.readHairRemovalSessions,
    apply: apply.applyHairRemovalSessions
  }),
  section({ name: 'reminders', read: read.readReminders, apply: apply.applyReminders }),
  section({ name: 'tallyEvents', read: read.readTallyEvents, apply: apply.applyTallyEvents }),
  section({ name: 'doubtEntries', read: read.readDoubtEntries, apply: apply.applyDoubtEntries }),
  section({
    name: 'counterevidenceSnapshots',
    read: read.readCounterevidenceSnapshots,
    apply: apply.applyCounterevidenceSnapshots
  }),
  section({ name: 'letters', read: read.readLetters, apply: apply.applyLetters }),
  section({ name: 'roadmapChecks', read: read.readRoadmapChecks, apply: apply.applyRoadmapChecks }),
  section({ name: 'regimenEpisodes', read: read.readRegimenEpisodes, apply: apply.applyRegimenEpisodes }),
  section({ name: 'doseEvents', read: read.readDoseEvents, apply: apply.applyDoseEvents }),
  // Both hang off an episode rowid, and the rows applyRegimenEpisodes just
  // inserted are where those rowids come from.
  section({
    name: 'doseSchedules',
    after: ['regimenEpisodes'],
    read: read.readDoseSchedules,
    apply: apply.applyDoseSchedules
  }),
  section({ name: 'dosePauses', after: ['regimenEpisodes'], read: read.readDosePauses, apply: apply.applyDosePauses }),
  section({ name: 'medicationStock', read: read.readMedicationStock, apply: apply.applyMedicationStock }),
  section({ name: 'tryouts', read: read.readTryouts, apply: apply.applyTryouts }),
  // A felt-sense row hangs off a tryout rowid, the same way a dose schedule
  // hangs off an episode's.
  section({
    name: 'feltSenseEntries',
    after: ['tryouts'],
    read: read.readFeltSenseEntries,
    apply: apply.applyFeltSenseEntries
  }),
  section({ name: 'checklists', read: read.readChecklists, apply: apply.applyChecklists }),
  // No `after`: its optional reminder travels as an ordinary reminder row,
  // matched back up by an auto_source marker rather than a rowid this
  // section would have to resolve.
  section({ name: 'wearSessions', read: read.readWearSessions, apply: apply.applyWearSessions })
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
