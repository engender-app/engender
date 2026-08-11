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
  /** Demo stand-in: a hue for the placeholder gradient. The real app stores file paths. */
  hue: number;
  label: string;
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
      delete - a delete would take every value ever logged on the axis. */
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

/* Preferences are not here: they live in SQLite's `pref` table and are
   described by prefs/catalogue.ts (ticket 06). */
export interface DB {
  version: number;
  dimensions: GenderDimension[];
  customPresets: GenderPreset[];
  tagGroups: TagGroup[];
  entries: Entry[];
  milestones: Milestone[];
  reminders: Reminder[];
  labResults: LabResult[];
}

export interface MilestoneTemplate {
  key: string;
  name: string;
}
