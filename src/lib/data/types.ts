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
  /** By body-region key (bodyMap.ts), independent of dims and tags -
      ticket 09 does not require ticket 02's "physical" dysphoria tag to be
      present to log a region. */
  bodyRegions: Record<string, number>;
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
  /** Built-in only: what this category means, for tags whose name alone
      does not say (CONTEXT: Dysphoria type). Surfaced via an info
      affordance rather than shown inline. */
  description?: string;
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

/* No episode reference (ticket 08 scope): a measurement stands alone and
   has to work whether or not a regimen episode exists. */
export interface Measurement {
  id: string;
  type: 'waist' | 'hips' | 'chest' | 'underbust';
  epochDay: number;
  value: number;
  unit: string;
}

/** The two counters ticket 10 tracks. Fixed rather than user-defined, so it
    is a plain union rather than a keyed reference-data row. */
export type TallyKind = 'misgendered' | 'correctly_gendered';

export interface TallyEvent {
  id: string;
  epochDay: number;
  kind: TallyKind;
  context: string;
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

/* Preferences are not here: they live in SQLite's `pref` table and are
   described by prefs/catalogue.ts (ticket 06). Neither is a whole-journal
   type: the `DB` object the demo store held went with it in ticket 08, and
   what an archive carries is the archive module's own shape. */

export interface MilestoneTemplate {
  key: string;
  name: string;
}
