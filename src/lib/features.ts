/* The feature manifest (functional audit ticket 54).

   One feature is named in up to nine key spaces: its archive sections, its
   tables, its members on the journal handle, its More hub rows, its area
   groups, its unprompted kinds, its Today tile kinds, its routes and the
   prefixes of its strings. Each of those has its own registry, and nothing
   tied them together, so removing a feature meant finding its keys by grep
   and the audit kept finding counts and lists in the docs that had drifted.

   This file is the list per feature, so a removal is a checklist: delete
   what the entry names, then delete the entry. It is held to the code from
   both sides.

     typecheck  every key is typed by its own registry, so a key the code no
                longer has is a compile error here. Tables are typed by
                sqlite/tableNames.ts, which is generated from the migrated
                schema (`npm run features:tables`) and checked against it.
                The Every*Claimed lines at the bottom refuse a section,
                table, journal member, hub row, area group, unprompted kind
                or tile kind that no feature claims.
     tests      features.test.ts does what a type cannot: routes against the
                `+page.svelte` files, string prefixes against
                messages/en.json, every key claimed once, and a feature's
                hub rows, groups and tiles agreeing with its own sections
                and routes.

   The docs read this file too: the route table in SCREENS.md names each
   route's feature from here (tests/doc-blocks.test.ts, `npm run
   docs:blocks`).

   `app` is not a feature anyone could remove. It holds what every feature
   leans on: the journal's own housekeeping members, the preference table
   and the media view. */

import type { RouteId } from '$app/types';
import type { AreaGroupKey } from './data/areaGroups';
import type { HubRowKey } from './data/hubRows';
import type { ArchiveSectionName } from './data/journal/archiveSections';
import type { TableName } from './data/sqlite/tableNames';
import type { Journal } from './data/journal/journal';
import type { LiveTileKind } from './data/liveTiles';
import type { UnpromptedKind } from './unprompted/registry';

type MessageKey = keyof typeof import('./paraglide/messages/_index.js');

/** A string prefix: the first one or two `_`-separated words of a message
    key, or a whole key. A prefix no key starts with any more is a compile
    error. */
type PrefixOf<Key extends string> = Key extends `${infer A}_${infer B}_${string}`
  ? A | `${A}_${B}`
  : Key extends `${infer A}_${string}`
    ? A
    : never;
type MessagePrefix = MessageKey | PrefixOf<MessageKey>;

/** One feature's keys. Every list may be empty; none may be left out, so an
    entry says "none" on purpose. */
export interface Feature {
  sections: readonly ArchiveSectionName[];
  /** SQLite tables and views, as the migrated schema names them. */
  tables: readonly TableName[];
  journal: readonly (keyof Journal)[];
  hubRows: readonly HubRowKey[];
  areaGroups: readonly AreaGroupKey[];
  unprompted: readonly UnpromptedKind[];
  /** Today tile kinds. Each is also one of this feature's unprompted kinds. */
  tiles: readonly LiveTileKind[];
  /** Routes that render a page (a `+page.svelte`). */
  routes: readonly RouteId[];
  /** Where this feature's strings sit in messages/*.json. Not every string:
      shared words (Save, Cancel) and strings named for a screen rather than
      a feature stay with whoever reads them. */
  messages: readonly MessagePrefix[];
}

const none = [] as const;

export const FEATURES = {
  app: {
    sections: ['deletions'],
    tables: ['pref', 'media_file', 'deletion'],
    journal: ['reconcileBuiltIns', 'discardEverything', 'undoable'],
    hubRows: none,
    areaGroups: none,
    unprompted: none,
    tiles: none,
    routes: none,
    messages: ['boot', 'nav', 'error', 'update', 'storage']
  },
  today: {
    sections: none,
    tables: none,
    journal: ['dayAhead'],
    hubRows: none,
    areaGroups: none,
    unprompted: none,
    tiles: none,
    routes: ['/'],
    messages: ['home', 'agenda', 'quick']
  },
  entries: {
    sections: ['entries', 'marginNotes', 'presentations'],
    tables: [
      'entry',
      'entry_tag',
      'entry_dimension_value',
      'entry_body_region',
      'entry_fts',
      'entry_fts_config',
      'entry_fts_data',
      'entry_fts_docsize',
      'entry_fts_idx',
      'voice_recording',
      'video_note',
      'margin_note',
      'presentation'
    ],
    journal: ['entries', 'marginNotes', 'presentations', 'voice', 'videos', 'day', 'textSearch'],
    hubRows: ['recordings'],
    areaGroups: none,
    unprompted: none,
    tiles: none,
    routes: ['/calendar', '/day/[day]', '/entry/[id]', '/entry/new/[day]', '/search', '/media/recordings'],
    messages: ['entry', 'tpl', 'margin', 'presentation', 'presentations', 'search', 'cal', 'heat', 'mood', 'vm', 'video', 'recording']
  },
  'gender-scales': {
    sections: ['dimensions', 'presets'],
    tables: ['gender_dimension', 'gender_preset', 'preset_dimension'],
    journal: ['dimensions'],
    hubRows: none,
    areaGroups: none,
    unprompted: none,
    tiles: none,
    routes: ['/settings/dimension'],
    messages: ['dim', 'cd', 'scales']
  },
  tags: {
    sections: ['tagGroups'],
    tables: ['tag', 'tag_group'],
    journal: ['tags'],
    hubRows: none,
    areaGroups: none,
    unprompted: none,
    tiles: none,
    routes: ['/settings/tags'],
    messages: ['tag', 'tags', 'taggroup', 'tagdesc']
  },
  'body-map': {
    sections: ['bodyRegions'],
    tables: ['body_region'],
    journal: ['bodyRegions'],
    hubRows: none,
    areaGroups: none,
    unprompted: none,
    tiles: none,
    routes: ['/body-map', '/settings/body-regions'],
    messages: ['body_map', 'region']
  },
  'look-back': {
    sections: none,
    tables: none,
    journal: ['stats', 'correlationCards', 'chartAnnotations', 'costs'],
    hubRows: none,
    areaGroups: none,
    unprompted: none,
    tiles: none,
    routes: ['/stats', '/stats/[reading]', '/compare'],
    messages: ['lookback', 'stats', 'compare', 'constellation', 'chart', 'correlation', 'cost']
  },
  'on-this-day': {
    sections: none,
    tables: none,
    journal: none,
    hubRows: none,
    areaGroups: none,
    unprompted: ['on-this-day'],
    tiles: none,
    routes: ['/on-this-day'],
    messages: ['on_this']
  },
  wrapped: {
    sections: none,
    tables: none,
    journal: none,
    hubRows: none,
    areaGroups: none,
    unprompted: ['wrapped'],
    tiles: none,
    routes: ['/wrapped/[cadence]'],
    messages: ['wrapped']
  },
  eras: {
    sections: ['eras', 'eraMutes'],
    tables: ['era', 'era_mute'],
    journal: ['eras', 'eraMutes'],
    hubRows: none,
    areaGroups: none,
    unprompted: none,
    tiles: none,
    routes: ['/settings/eras'],
    messages: ['era', 'eras']
  },
  care: {
    sections: ['regimenEpisodes', 'doseEvents', 'doseSchedules', 'dosePauses', 'medicationStock', 'labResults'],
    tables: [
      'regimen_episode',
      'dose_event',
      'dose_schedule',
      'dose_schedule_weekday',
      'dose_schedule_dose_amount',
      'dose_pause',
      'medication_stock',
      'lab_result'
    ],
    journal: ['regimen', 'doses', 'stock', 'labs', 'exposure'],
    hubRows: ['care'],
    areaGroups: none,
    unprompted: ['dose-panel', 'stock-notice'],
    tiles: ['dose-panel'],
    routes: ['/care', '/care/regimen', '/care/labs', '/care/doses'],
    messages: ['care', 'regimen', 'dose', 'doses', 'labs', 'stock', 'adherence', 'exposure', 'tile_dose', 'tile_stock']
  },
  effects: {
    sections: ['personalEffects', 'personalEffectTypes', 'effectCategories', 'sideEffects'],
    tables: ['personal_effect', 'personal_effect_type', 'effect_category', 'side_effect'],
    journal: ['personalEffects', 'effectCategories', 'sideEffects'],
    hubRows: ['effects'],
    areaGroups: ['effects'],
    unprompted: none,
    tiles: none,
    routes: ['/care/changes'],
    messages: ['effect', 'effects', 'side_effect']
  },
  'cycle-events': {
    sections: ['cycleEvents'],
    tables: ['cycle_event'],
    journal: ['cycleEvents'],
    hubRows: ['cycle-events'],
    areaGroups: none,
    unprompted: none,
    tiles: none,
    routes: ['/health/cycle-events'],
    messages: ['cycle']
  },
  surgery: {
    sections: ['procedures'],
    tables: ['procedure', 'procedure_photo'],
    journal: ['procedures'],
    hubRows: ['surgery'],
    areaGroups: none,
    unprompted: ['surgery-countdown'],
    tiles: ['surgery-countdown'],
    routes: ['/health/surgery', '/health/surgery/[id]'],
    messages: ['surgery', 'procedure', 'tile_surgery']
  },
  dilation: {
    sections: ['taper', 'taperSessions'],
    tables: ['taper', 'taper_session'],
    journal: ['taper'],
    hubRows: ['dilation'],
    areaGroups: ['dilation'],
    unprompted: none,
    tiles: none,
    routes: ['/health/dilation'],
    messages: ['dilation']
  },
  appointments: {
    sections: ['providers', 'appointments'],
    tables: ['provider', 'appointment', 'appointment_debrief', 'appointment_status'],
    journal: ['appointments'],
    hubRows: ['appointments'],
    areaGroups: none,
    unprompted: none,
    tiles: none,
    routes: ['/health/appointments', '/health/appointments/in-the-room', '/health/appointments/[id]'],
    messages: ['appointments', 'appointment', 'provider', 'in_the', 'debrief']
  },
  checklists: {
    sections: ['checklists'],
    tables: ['checklist', 'checklist_item'],
    journal: ['checklists'],
    hubRows: none,
    areaGroups: none,
    unprompted: none,
    tiles: none,
    routes: none,
    messages: none
  },
  'clinician-summary': {
    sections: none,
    tables: none,
    journal: ['clinicianSummary'],
    hubRows: none,
    areaGroups: none,
    unprompted: none,
    tiles: none,
    routes: ['/health/clinician-summary'],
    messages: ['clinician']
  },
  milestones: {
    sections: ['milestones'],
    tables: ['milestone'],
    journal: ['milestones'],
    hubRows: ['milestones'],
    areaGroups: none,
    unprompted: none,
    tiles: none,
    routes: ['/transition/milestones'],
    messages: ['ms', 'milestones']
  },
  'progress-photos': {
    sections: ['progressPhotos', 'progressPoses'],
    tables: ['progress_photo', 'progress_pose'],
    journal: ['progressPhotos'],
    hubRows: ['progress-photos'],
    areaGroups: none,
    unprompted: none,
    tiles: none,
    routes: ['/transition/progress-photos'],
    messages: ['pph']
  },
  tryouts: {
    sections: ['tryouts', 'feltSenseEntries'],
    tables: ['tryout', 'tryout_photo', 'felt_sense'],
    journal: ['tryouts', 'feltSense'],
    hubRows: ['tryouts'],
    areaGroups: none,
    unprompted: none,
    tiles: none,
    routes: ['/transition/tryouts', '/transition/tryouts/[id]'],
    messages: ['tryout']
  },
  voice: {
    sections: ['voiceBenchmarks', 'voicePracticeTakes'],
    tables: ['voice_benchmark', 'voice_practice_take'],
    journal: ['voiceBenchmarks', 'voicePracticeTakes'],
    hubRows: ['voice-benchmark'],
    areaGroups: ['voice'],
    unprompted: none,
    tiles: none,
    routes: ['/voice'],
    messages: ['vb', 'vc']
  },
  wear: {
    sections: ['wearSessions'],
    tables: ['wear_session'],
    journal: ['wearSessions'],
    hubRows: ['wear'],
    areaGroups: ['wear'],
    unprompted: ['wear-timer', 'wear-elapsed'],
    tiles: ['wear-timer'],
    routes: ['/body/wear'],
    messages: ['wear', 'tile_wear']
  },
  'hair-removal': {
    sections: ['hairRemovalSessions'],
    tables: ['hair_removal_session', 'hair_removal_photo'],
    journal: ['hairRemoval'],
    hubRows: ['hair-removal'],
    areaGroups: ['hair-removal'],
    unprompted: none,
    tiles: none,
    routes: ['/body/hair-removal'],
    messages: ['hair_removal']
  },
  roadmap: {
    sections: ['roadmapChecks', 'roadmapCategories', 'roadmapGoals', 'roadmapInstitutions', 'roadmapInstitutionChanges'],
    tables: ['roadmap_check', 'roadmap_category', 'roadmap_goal', 'roadmap_institution', 'roadmap_institution_change'],
    journal: ['roadmap'],
    hubRows: ['roadmap'],
    areaGroups: none,
    unprompted: none,
    tiles: none,
    routes: ['/transition/roadmap'],
    messages: ['roadmap']
  },
  letters: {
    sections: ['letters'],
    tables: ['letter'],
    journal: ['letters'],
    hubRows: ['letters'],
    areaGroups: none,
    unprompted: ['ready-letter'],
    tiles: ['ready-letter'],
    routes: ['/transition/letters', '/transition/letters/[id]'],
    messages: ['letters', 'tile_letter']
  },
  'safe-space': {
    sections: ['comfortItems'],
    tables: ['comfort_item'],
    journal: ['comfortItems'],
    hubRows: ['doubt'],
    areaGroups: none,
    unprompted: ['safe-space-nudge'],
    tiles: ['safe-space-nudge'],
    routes: ['/doubt', '/doubt/comfort', '/doubt/evidence'],
    messages: ['comfort', 'safe_space', 'tile_safe']
  },
  resources: {
    sections: none,
    tables: none,
    journal: none,
    hubRows: ['resources'],
    areaGroups: none,
    unprompted: none,
    tiles: none,
    routes: ['/support/resources'],
    messages: ['resources']
  },
  photos: {
    sections: none,
    tables: ['photo'],
    journal: ['photos', 'photoLibrary'],
    hubRows: ['photos'],
    areaGroups: none,
    unprompted: none,
    tiles: none,
    routes: ['/media/photos', '/media/photos/export'],
    messages: ['ph', 'photo', 'pj']
  },
  documents: {
    sections: ['documents'],
    tables: ['document'],
    journal: ['documents'],
    hubRows: ['documents'],
    areaGroups: none,
    unprompted: none,
    tiles: none,
    routes: ['/media/documents', '/media/documents/[id]'],
    messages: ['document', 'documents']
  },
  reminders: {
    sections: ['reminders'],
    tables: ['reminder'],
    journal: ['reminders'],
    hubRows: none,
    areaGroups: none,
    unprompted: ['reminders', 'check-in'],
    tiles: none,
    routes: ['/settings/reminders', '/settings/reminders/[id]'],
    messages: ['rem', 'reminder', 'checkin']
  },
  'coming-back': {
    sections: none,
    tables: none,
    journal: none,
    hubRows: none,
    areaGroups: none,
    unprompted: none,
    tiles: none,
    routes: ['/coming-back'],
    messages: ['coming_back']
  },
  setup: {
    sections: none,
    tables: none,
    journal: none,
    hubRows: none,
    areaGroups: none,
    unprompted: none,
    tiles: none,
    routes: ['/onboarding'],
    messages: ['ob']
  },
  hub: {
    sections: ['areaStates'],
    tables: ['area_state'],
    journal: ['areaStates', 'lastWrite'],
    hubRows: none,
    areaGroups: none,
    unprompted: none,
    tiles: none,
    routes: ['/more'],
    messages: ['hub', 'area']
  },
  settings: {
    sections: none,
    tables: none,
    journal: none,
    hubRows: none,
    areaGroups: none,
    unprompted: none,
    tiles: none,
    routes: ['/settings', '/settings/notifications', '/settings/permissions', '/settings/licences'],
    messages: ['settings', 'notif', 'perm', 'perms', 'licences', 'about', 'a11y', 'palette', 'theme']
  },
  security: {
    sections: none,
    tables: none,
    journal: none,
    hubRows: none,
    areaGroups: none,
    unprompted: none,
    tiles: none,
    routes: ['/settings/security', '/settings/access-mode', '/settings/passphrase', '/settings/recovery-key'],
    messages: ['am', 'ak', 'pin', 'pp', 'lock', 'rk', 'rke', 'protection', 'su', 'bm', 'dbr']
  },
  backup: {
    sections: ['importLog'],
    tables: ['import_log'],
    journal: ['archive'],
    hubRows: none,
    areaGroups: none,
    unprompted: ['export-failure'],
    tiles: none,
    routes: ['/settings/export'],
    messages: ['exp', 'imp', 'verify', 'plain', 'daylio', 'dlb', 'backup']
  },
  'journal-book': {
    sections: none,
    tables: none,
    journal: ['journalBook'],
    hubRows: none,
    areaGroups: none,
    unprompted: none,
    tiles: none,
    routes: ['/settings/journal-book'],
    messages: ['journal_book']
  },
  trash: {
    sections: none,
    tables: none,
    journal: none,
    hubRows: none,
    areaGroups: none,
    unprompted: none,
    tiles: none,
    routes: ['/settings/trash'],
    messages: ['trash']
  }
} as const satisfies Record<string, Feature>;

export type FeatureName = keyof typeof FEATURES;

/** Every feature, in the order this file declares them. */
export const FEATURE_NAMES = Object.keys(FEATURES) as readonly FeatureName[];

type Claimed<Space extends keyof Feature> = (typeof FEATURES)[FeatureName][Space][number];
type AssertNoneUnclaimed<Missing extends never> = Missing;

/* A key in one of these registries that no feature claims is a compile
   error, so a new area, table, row or kind cannot land without its feature
   saying so. Demonstrated by deleting `'wear'` from the wear feature's
   `hubRows`: the hub row line below stops compiling. */
type EverySectionClaimed = AssertNoneUnclaimed<Exclude<ArchiveSectionName, Claimed<'sections'>>>;
type EveryTableClaimed = AssertNoneUnclaimed<Exclude<TableName, Claimed<'tables'>>>;
type EveryJournalMemberClaimed = AssertNoneUnclaimed<Exclude<keyof Journal, Claimed<'journal'>>>;
type EveryHubRowClaimed = AssertNoneUnclaimed<Exclude<HubRowKey, Claimed<'hubRows'>>>;
type EveryAreaGroupClaimed = AssertNoneUnclaimed<Exclude<AreaGroupKey, Claimed<'areaGroups'>>>;
type EveryUnpromptedKindClaimed = AssertNoneUnclaimed<Exclude<UnpromptedKind, Claimed<'unprompted'>>>;
type EveryTileKindClaimed = AssertNoneUnclaimed<Exclude<LiveTileKind, Claimed<'tiles'>>>;

/** The feature that claims a route, for the generated route table. */
export function featureOfRoute(route: string): FeatureName | undefined {
  return FEATURE_NAMES.find((name) => (FEATURES[name].routes as readonly string[]).includes(route));
}

/** The feature that claims an archive section. */
export function featureOfSection(section: string): FeatureName | undefined {
  return FEATURE_NAMES.find((name) => (FEATURES[name].sections as readonly string[]).includes(section));
}

/** The feature that claims an unprompted kind. */
export function featureOfKind(kind: string): FeatureName | undefined {
  return FEATURE_NAMES.find((name) => (FEATURES[name].unprompted as readonly string[]).includes(kind));
}
