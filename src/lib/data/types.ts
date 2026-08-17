/* Domain types (ticket 07): the shape the journal speaks, not the demo
   store's and not the schema's. Storage details stay behind the journal
   seam - uuid columns, updated_at, the join tables. Built-ins are
   addressed by their seeded key and user rows by a minted uuid
   (ADR-0002), arriving here as the string `id`/`key` - except entries,
   which keep their integer rowid as the id: they are addressed locally
   only, and ADR-0002 keeps the FTS link and the join-heavy queries on
   integer rowids. An entry's uuid travels in archives, not here. */

export interface Photo {
  id: string;
  /** The opaque `<uuid>.jpg` the file store holds, resolved against a root
      the platform picks (photos/names.ts). Null means no stored file: the
      demo persona's placeholders, which render as the gradient PhotoThumb
      otherwise uses while loading. A photo row always has one. */
  fileName: string | null;
}

/** A photo the editor drafted but nothing has saved yet: identity is
    minted on write, by the repository, never in a screen. */
export type DraftPhoto = Omit<Photo, 'id'>;

export interface Entry {
  id: number;
  epochDay: number;
  timestamp: number;
  mood: number | null;
  note: string;
  dims: Record<string, number>;
  tags: string[];
  photos: Photo[];
}

export interface GenderDimension {
  key: string;
  name: string;
  low: string;
  high: string;
  min: number;
  max: number;
  builtIn: boolean;
  /** Hidden dimensions leave presets, the editor and the charts; their
      logged values survive (CONTEXT: "Hidden"). Dimensions hide, never
      delete - a delete would take every value ever logged on it. */
  hidden: boolean;
}

export interface GenderPreset {
  id: string;
  name: string;
  builtIn: boolean;
  dims: string[];
}

export interface Tag {
  id: string;
  label: string;
  builtIn: boolean;
  hidden: boolean;
}

export interface TagGroup {
  key: string;
  name: string;
  enabled: boolean;
  builtIn: boolean;
  tags: Tag[];
}

/* No `kind`: whether a milestone reads as a countdown or an anniversary
   follows from its date and today (ADR-0010), so milestoneStatus()
   computes it and nothing stores it. */
export interface Milestone {
  id: string;
  name: string;
  epochDay: number;
  templateKey: string | null;
  photo: Photo | null;
}

/* Carries the rule from reminderRule.ts, never a next-fire instant
   (ADR-0010). The old demo vocabulary ('EVERY_3_DAYS', onceInDays) does
   not survive contact with the schema's recurrence CHECK. */
export interface Reminder {
  id: string;
  title: string;
  type: 'med' | 'injection' | 'appointment' | 'other';
  time: string;
  recurrence: 'DAILY' | 'WEEKLY' | 'EVERY_N_DAYS' | null;
  /** EVERY_N_DAYS only. */
  interval: number | null;
  /** EVERY_N_DAYS only: a day the reminder fires on, fixing the progression. */
  anchorEpochDay: number | null;
  /** One-off only (recurrence null): the concrete day. */
  epochDay: number | null;
  enabled: boolean;
}

export interface LabResult {
  id: string;
  epochDay: number;
  analyte: string;
  value: number;
  unit: string;
  note: string;
}

/* No stored end: an episode runs until the next one starts, or is ongoing
   if it is the latest (ADR-0010, regimenEpisode.ts computes it). Not a
   preference (ADR-0003) and not a Reminder: it is attributed data every
   other record resolves against by timestamp, not a device setting and
   not a prompt to log something. */
export interface RegimenEpisode {
  id: string;
  drug: string;
  /** Nullable: antiandrogens and some routes have none. */
  ester: string | null;
  dose: number;
  doseUnit: string;
  route: string;
  interval: string;
  startEpochDay: number;
  /** Hidden episodes leave the picker downstream tickets offer for new
      records; records already attributed to one keep resolving to it
      (CONTEXT: "Hidden"). */
  hidden: boolean;
}

/* The routes a dose can be taken by (phase 4 ticket 02). A closed set,
   unlike a regimen episode's free-text `route`: what fields a dose carries
   depends on which route it was, so the app has to know the answer rather
   than carry whatever was typed. */
export type DoseRoute = 'oral' | 'sublingual' | 'im' | 'sc' | 'patch' | 'gel';

/** Oil suspends an ester for slow release; an aqueous suspension does not.
    Injections only - nothing else has a vehicle to record. */
export type InjectionVehicle = 'oil' | 'aqueous';

/** Taken is the default. Skipped means the slot was expected and nothing
    was taken - the dose is still logged, so an adherence view can show the
    gap rather than infer it from an absence. Changed means it was taken,
    but not as scheduled. */
export type DoseStatus = 'taken' | 'skipped' | 'changed';

/** What a `changed` dose was supposed to be, kept beside what it actually
    was. Null on every other status: there is nothing to compare against
    when the dose went as planned. */
export interface ScheduledDose {
  dose: number;
  route: DoseRoute;
  timestamp: number;
}

interface DoseEventFields {
  id: string;
  /** Epoch milliseconds, and load-bearing - unlike an Entry's Timestamp,
      which only orders same-day entries (CONTEXT: "Timestamp"). Ticket 03
      derives hours-since-last-dose from this, and sublingual estradiol
      peaks in one to two hours, so a day would not be precise enough to
      derive anything from. */
  timestamp: number;
  dose: number;
  doseUnit: string;
  status: DoseStatus;
  scheduled: ScheduledDose | null;
}

/* A dose event is its own record type, not an Entry: it carries no mood, no
   dimension values, no tags and no note, and CONTEXT.md's Entry is closed
   over exactly those five fields.

   Nor does it store which regimen episode it belongs to. Attribution is
   resolveEpisodeAt(episodes, dose.timestamp) at read time (regimenEpisode.ts),
   so backdating a dose - or inserting a corrective episode underneath it -
   changes the answer with no stored link to rewrite (ADR-0010).

   A union rather than one interface with nullable fields, because which
   fields a dose has is decided by its route and nothing else: an oral dose
   has no site to be null, and no screen should have to remember that. */
export type DoseEvent =
  | (DoseEventFields & { route: 'oral' | 'sublingual' })
  | (DoseEventFields & {
      route: 'im' | 'sc';
      /** A key from INJECTION_SITES (doseSchedule.ts): the rotation body
          map's regions, which is a different vocabulary from where a patch
          goes. */
      injectionSite: string;
      vehicle: InjectionVehicle;
    })
  | (DoseEventFields & {
      route: 'patch' | 'gel';
      /** A key from APPLICATION_SITES (doseSchedule.ts). A patch or gel
          site is not rotated on an injection site's schedule, so the two
          are not one field. */
      applicationSite: string;
    });

/** How often an episode expects a dose, structured enough to generate
    slots from - which the episode's own free-text `interval` is not.
    Anchored to the episode's start day, so the progression is fixed by the
    episode rather than by when the schedule was written. One per episode. */
export interface DoseSchedule {
  id: string;
  /** A RegimenEpisode id. */
  episodeId: string;
  everyNDays: number;
  /** Twice-daily oral is 2. */
  dosesPerDay: number;
}

/** Planned is a break someone chose or a clinician directed; accidental is
    a gap that happened and is being recorded honestly. Both suppress
    expected slots - neither is judged. */
export type PauseReason = 'planned' | 'accidental';

/** A dated range on one episode during which no dose is expected, so a gap
    that was a break does not read as a missed dose - in the adherence view
    or in ticket 04's consumption-rate projection. */
export interface DosePause {
  id: string;
  /** A RegimenEpisode id. */
  episodeId: string;
  startEpochDay: number;
  /** Null while the pause is still running: a break you are in the middle
      of has no end day yet, and waiting for one would mean the adherence
      view counts missed doses through it. */
  endEpochDay: number | null;
  reason: PauseReason;
}

/* Preferences are not here: they live in SQLite's `pref` table and are
   described by prefs/catalogue.ts (ticket 06). Neither is a whole-journal
   type: the `DB` object the demo store held went with it in ticket 08, and
   what an archive carries is the archive module's own shape. */

export interface MilestoneTemplate {
  key: string;
  name: string;
}
