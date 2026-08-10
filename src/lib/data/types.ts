/* Domain types — mirror the PRD's SQLite schema so the demo store can be
   swapped for the SQLocal / Capacitor drivers without touching the UI. */

export interface Photo {
  id: string;
  /** Demo stand-in: a hue for the placeholder gradient. The real app stores file paths. */
  hue: number;
  label: string;
}

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

export interface Milestone {
  id: string;
  name: string;
  epochDay: number;
  kind: 'countdown' | 'anniversary';
  templateKey: string | null;
  photo: Photo | null;
}

export interface Reminder {
  id: string;
  title: string;
  type: 'med' | 'injection' | 'appointment' | 'other';
  time: string;
  recurrence: string | null;
  onceInDays?: number;
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

export interface Prefs {
  onboarded: boolean;
  name: string;
  activePreset: string;
  colorMetric: string; // 'mood' | dimension key
  theme: 'system' | 'light' | 'dark';
  palette: string;
  language: 'system' | 'en' | 'pl';
  appLock: boolean;
  lockOnLeave: boolean;
  disguise: boolean;
  quickExit: boolean;
  checkIn: { enabled: boolean; time: string };
  autoExport: { enabled: boolean; schedule: 'weekly' | 'monthly' };
  lastBackupAt: number | null;
  backupNoticeDismissed: boolean;
}

export interface DB {
  version: number;
  prefs: Prefs;
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
