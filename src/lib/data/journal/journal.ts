/* The journal (ADR-0017, CONTEXT: "Journal"): everything this device holds
   about the user's transition, reached through one handle bound to a
   database driver. A factory takes a SqliteDriver and a photo file store
   and composes eleven area modules behind that handle. The interface is
   uniformly async and free of Svelte runes, so the whole thing runs under
   the Node tier's real SQLite; it mints every row's identity itself
   (ADR-0002), so no screen ever needs a Date.now() scheme again.

   One thin app-level module constructs the instance at boot
   (stores/boot.svelte.ts); tests construct their own over
   test-support's node:sqlite driver. */

import type { SqliteDriver } from '../sqlite/driver';
import { makeArchiveArea, type ArchiveArea } from './archive';
import { makeClinicianSummaryArea, type ClinicianSummaryArea } from './clinicianSummary';
import { makeDimensionsArea, type DimensionsArea } from './dimensions';
import { makeDoubtJournalArea, type DoubtJournalArea } from './doubtJournal';
import { makeDosesArea, type DosesArea } from './doses';
import { makeEntriesArea, type EntriesArea } from './entries';
import { makeExposureArea, type ExposureArea } from './exposure';
import { makeHormoneCurveArea, type HormoneCurveArea } from './hormoneCurve';
import { makeQualitativeCurveArea, type QualitativeCurveArea } from './hormoneCurveQualitative';
import { makeHairProgressArea, type HairProgressArea } from './hairProgress';
import { makeLabsArea, type LabsArea } from './labs';
import { makeLettersArea, type LettersArea } from './letters';
import { makeMeasurementsArea, type MeasurementsArea } from './measurements';
import { makeMilestonesArea, type MilestonesArea } from './milestones';
import { makePersonalEffectsArea, type PersonalEffectsArea } from './personalEffects';
import { makePhotosArea, type PhotosArea } from './photos';
import { makeRegimenArea, type RegimenArea } from './regimen';
import { makeRemindersArea, type RemindersArea } from './reminders';
import { makeRoadmapArea, type RoadmapArea } from './roadmap';
import { makeSideEffectsArea, type SideEffectsArea } from './sideEffects';
import { makeStatsArea, type StatsArea } from './stats';
import { makeStockArea, type StockArea } from './stock';
import { makeTagsArea, type TagsArea } from './tags';
import { makeTallyArea, type TallyArea } from './tally';
import { makeTryoutsArea, type TryoutsArea } from './tryouts';
import { reconcileBuiltIns } from './reconcile';

/** Where photo files live. The journal owns the rows; whoever owns the
    bytes implements this, so the rules about files - a delete takes them
    along, the boot sweep reclaims what no row references - are testable
    against a fake in the Node tier (ADR-0017).

    Every argument is an opaque file name, never a path: OPFS on web and
    the app-private directory on Android are different roots, and an
    archive written on one has to import on the other (names.ts). */
export interface PhotoFileStore {
  write(name: string, bytes: Uint8Array): Promise<void>;
  read(name: string): Promise<Uint8Array | null>;
  /** Optional batched read. Results align with `names`; null means missing. */
  readMany?(names: string[]): Promise<(Uint8Array | null)[]>;
  /** How many bytes the file holds, or null if it is not there. An
      archive's chunk count has to be settled before its first chunk is
      encrypted (ADR-0007), so packing needs every photo's length up front
      - and reading each photo twice to find out is the thing the format
      exists to avoid. */
  size(name: string): Promise<number | null>;
  /** Optional batched size. Results align with `names`; null means missing. */
  sizeMany?(names: string[]): Promise<(number | null)[]>;
  remove(name: string): Promise<void>;
  /** Every file in the store, for the orphan sweep. */
  list(): Promise<string[]>;
}

export interface Journal {
  entries: EntriesArea;
  tags: TagsArea;
  dimensions: DimensionsArea;
  milestones: MilestonesArea;
  photos: PhotosArea;
  labs: LabsArea;
  measurements: MeasurementsArea;
  reminders: RemindersArea;
  /** Misgendering and correct-gendering events (CONTEXT: "Tally event").
      Its own record type, never an Entry or a quick log. */
  tally: TallyArea;
  regimen: RegimenArea;
  /** The dose log, plus the schedules and pauses read alongside it. Stores
      no episode link: which episode a dose belongs to is resolved from its
      timestamp above this seam (regimenEpisode.ts). */
  doses: DosesArea;
  /** What a person last reported having of each drug, and the run-out
      projection and reminder reconciliation built over it and the dose log
      (phase 4 ticket 04). A view over rows `doses`, `regimen` and
      `reminders` own, not a fourth owner for any of them. */
  stock: StockArea;
  /** Cumulative dose totals, days-on-each-route and time-on-each-regimen,
      purely descriptive (phase 4 ticket 05). A view over rows `doses` and
      `regimen` own, not a third owner for either one. */
  exposure: ExposureArea;
  /** Estradiol level bands per injectable ester, with the user's own lab
      results overlaid (phase 4 ticket 10). A view over rows `doses`,
      `regimen` and `labs` own, computed on every read - the bands are the
      published posterior's, not a stored estimate. */
  hormoneCurve: HormoneCurveArea;
  /** Illustrative rise/plateau/fall shapes for oral, sublingual, patch and
      gel estradiol (phase 4 ticket 11) - the routes hormoneCurve has no
      published fit for. Same view shape and the same read-only-derived
      rule, over the same dose log and lab results. */
  qualitativeCurve: QualitativeCurveArea;
  sideEffects: SideEffectsArea;
  /** A one-shot, printable assembly of labs, doses, regimen history, side
      effects and exposure counters for a chosen range (phase 4 ticket 12).
      A view over rows regimen, doses, labs, exposure and sideEffects own,
      not a sixth owner for any of them - every figure on it already comes
      from one of those areas' own read paths. */
  clinicianSummary: ClinicianSummaryArea;
  /** The four fixed "first noticed" markers (phase 4 ticket 07), read
      against the earliest regimen episode's start day above this seam
      (regimenEpisode.ts's earliestEpisodeStartEpochDay). No episode
      reference of its own, the same reason sideEffects has none. */
  personalEffects: PersonalEffectsArea;
  /** Norwood-Hamilton self-staging and scheduled fixed-position photos
      (phase 4 ticket 09), read against the earliest
      finasteride/dutasteride/minoxidil dose above this seam
      (hairTreatmentAnchor.ts's earliestHairTreatmentDoseEpochDay). Distinct
      from personalEffects' single "hair changes" marker - the two are not
      merged. */
  hairProgress: HairProgressArea;
  /** Free-write doubt entries and their saved counterevidence snapshots
      (phase 4 ticket 11). Reads the counterevidence itself through
      entries.entriesWithTag('g-euphoria', …), the same tag query the stats
      screen already uses - this area owns only what it alone writes. */
  doubtJournal: DoubtJournalArea;
  /** Name and pronoun tryouts and their felt-sense history (phase 4 ticket
      16). Reads the entries in a tryout's date range through
      entries.searchEntries('', [], { startEpochDay, endEpochDay }) rather
      than owning a link of its own (ADR-0010) - this area owns only what
      it alone writes. */
  tryouts: TryoutsArea;
  /** Free-write letters to the person's future self, sealed until a
      chosen unlock day (phase 4 ticket 19). Stores the text and the
      unlock day and nothing else - letterStatus.ts derives sealed/
      unlocked against today (ADR-0010) above this seam. */
  letters: LettersArea;
  /** Which goals of which country pack someone has ticked off on the
      transition roadmap (phase 4 ticket 23). Holds ticks only: what the
      goals say is a bundled content module, not a table, so this area
      never validates a pack key it was handed. */
  roadmap: RoadmapArea;
  /** Read-only aggregates over everything above (ADR-0012). Nothing here
      is stored; a stat is recomputed whenever it is asked for. */
  stats: StatsArea;
  /** Everything above at once, in the shape an export carries it
      (ADR-0007), and one archive read back in - Replace or Merge, each a
      single operation whose order of writes is nobody else's business
      (ADR-0011). */
  archive: ArchiveArea;
  /** Adds whatever built-in vocabulary is missing, by key, and touches
      nothing else - safe on every boot and again before ticket 14's
      Replace import applies. */
  reconcileBuiltIns(): Promise<void>;
}

export function openJournal(driver: SqliteDriver, files: PhotoFileStore): Journal {
  const reminders = makeRemindersArea(driver);
  const regimen = makeRegimenArea(driver);
  const doses = makeDosesArea(driver);
  const labs = makeLabsArea(driver);
  const exposure = makeExposureArea(doses, regimen);
  const sideEffects = makeSideEffectsArea(driver);

  return {
    entries: makeEntriesArea(driver, files),
    tags: makeTagsArea(driver),
    dimensions: makeDimensionsArea(driver),
    milestones: makeMilestonesArea(driver, files),
    photos: makePhotosArea(driver, files),
    labs,
    measurements: makeMeasurementsArea(driver),
    reminders,
    tally: makeTallyArea(driver),
    regimen,
    doses,
    stock: makeStockArea(driver, doses, regimen, reminders),
    exposure,
    hormoneCurve: makeHormoneCurveArea(doses, regimen, labs),
    qualitativeCurve: makeQualitativeCurveArea(doses, regimen, labs),
    sideEffects,
    clinicianSummary: makeClinicianSummaryArea(regimen, doses, labs, exposure, sideEffects),
    personalEffects: makePersonalEffectsArea(driver),
    hairProgress: makeHairProgressArea(driver, files),
    doubtJournal: makeDoubtJournalArea(driver),
    tryouts: makeTryoutsArea(driver),
    letters: makeLettersArea(driver),
    roadmap: makeRoadmapArea(driver),
    stats: makeStatsArea(driver),
    archive: makeArchiveArea(driver, files),
    reconcileBuiltIns: () => reconcileBuiltIns(driver)
  };
}
