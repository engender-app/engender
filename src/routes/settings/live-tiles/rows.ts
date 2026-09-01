/* Every kind the app may show or fire unprompted (phase 6 ticket 02's
   prefactor): a live tile (CONTEXT.md), the stock notice, and wrapped and
   on-this-day, whose toggles moved here from the Tracking card they used to
   sit in. Reminders, the daily check-in, wear-elapsed and the auto-export
   failure notice fold in at ticket 04; era mutes at 05; insight rows at 06 -
   each of those becomes one array entry below rather than a fourth place
   deciding for itself.

   The list is the point: the screen draws one row per entry and nothing
   else, so a later ticket adds its kind here - one array entry, no new
   markup - the same way archiveSections.ts is a registry rather than a
   hand-maintained list. Titles and subtitles are keyless functions over the
   message catalogue for the same reason the More hub's HubRow is: the
   swatch names translate with everything else.

   A row switches its kind off for good, never one true instance (a running
   session cannot be hidden while it runs) - ADR-0039's amendment holds the
   line, and the tile tickets read these keys as one gate on top of their
   own data trigger. */
   /* Relative rather than $lib: rows.test.ts imports this file on the node
      tier, where no $lib alias exists - the one svelte-kit-ism the tests
      can't follow (see vitest.config.ts). */
import { m } from '../../../lib/paraglide/messages';
import type { PreferenceKey, PreferenceValues } from '../../../lib/data/prefs/catalogue';

/** A preference that is a plain on/off, so the screen's switch wiring can
    index the store directly instead of narrowing each entry by hand. */
export type BooleanPrefKey = {
  [K in PreferenceKey]: PreferenceValues[K] extends boolean ? K : never;
}[PreferenceKey];

/** Every kind this registry knows about, independent of what `ROWS` below
    actually lists - the same relationship archiveSections.ts's
    `ArchiveSectionName` has to `SECTIONS`. A kind dropped from `ROWS` without
    being dropped here is what `EveryKindRegistered` catches at compile time. */
export type UnpromptedKind =
  | 'wear-timer'
  | 'dose-panel'
  | 'ready-letter'
  | 'surgery-countdown'
  | 'safe-space-nudge'
  | 'stock-notice'
  | 'active-tryout-tile'
  | 'patch-schedule-tile'
  | 'voice-benchmark-nudge'
  | 'pause-active-banner'
  | 'hair-removal-recovery'
  | 'measurements-nudge'
  | 'wrapped'
  | 'on-this-day';

/** `UnpromptedKind` as a value: the type erases at compile time, and
    `unregisteredKinds` below needs the list to actually iterate. */
export const UNPROMPTED_KINDS: readonly UnpromptedKind[] = [
  'wear-timer',
  'dose-panel',
  'ready-letter',
  'surgery-countdown',
  'safe-space-nudge',
  'stock-notice',
  'active-tryout-tile',
  'patch-schedule-tile',
  'voice-benchmark-nudge',
  'pause-active-banner',
  'hair-removal-recovery',
  'measurements-nudge',
  'wrapped',
  'on-this-day'
];

/** Which Android notification channel a firing kind uses. Reminders and the
    daily check-in share the two fixed channels android-bridge.ts already
    declares; wrapped and on-this-day each name a channel after their own
    title instead (retrospective-notifications-scheduler.ts) - `retrospective`
    covers both here, since what varies between them is the channel's display
    name, not its category. */
export type NotificationChannel = 'reminders' | 'checkIn' | 'retrospective';

export interface LiveTileRow {
  /** Stable handle for the walkthrough (ADR-0029) - never the title, which
      is copy. */
  key: UnpromptedKind;
  title: () => string;
  subtitle: () => string;
  prefKey: BooleanPrefKey;
  /** Whether this kind has a row on the surfaces view (`/settings/live-tiles`
      today). True for everything registered so far; declared rather than
      assumed because a later kind can fire with no surface of its own -
      CONTEXT.md's auto-export failure notice has no settings home at all
      yet. */
  surfaces: boolean;
  /** Whether this kind may become a notification, and what firing means:
      the sub-toggle's own copy and preference key - the same shape and
      cascading disablement the two rows below already had on the Tracking
      card - which channel it fires on, and whether `hideNotificationTitles`
      disguises it. Absent is "never fires"; no live tile carries this
      today. */
  notify?: {
    title: () => string;
    subtitle: () => string;
    prefKey: BooleanPrefKey;
    channel: NotificationChannel;
    disguised: boolean;
  };
}

/* `as const`, not typed against `LiveTileRow[]`: giving every entry the
   interface's `key: UnpromptedKind` up front would widen each one to the
   whole union before `EveryKindRegistered` below ever compares them, which
   is the trap the ticket warns about - a completeness check that can never
   fail because the "registered" side already claims everything. Kept
   literal here and widened only for `LIVE_TILE_ROWS`, the export everything
   else reads. */
const ROWS = [
  {
    key: 'wear-timer',
    title: () => m.tile_wear_title(),
    subtitle: () => m.tile_wear_sub(),
    prefKey: 'wearTimerEnabled',
    surfaces: true
  },
  {
    key: 'dose-panel',
    title: () => m.tile_dose_title(),
    subtitle: () => m.tile_dose_sub(),
    prefKey: 'dosePanelEnabled',
    surfaces: true
  },
  {
    key: 'ready-letter',
    title: () => m.tile_letter_title(),
    subtitle: () => m.tile_letter_sub(),
    prefKey: 'readyLetterEnabled',
    surfaces: true
  },
  {
    key: 'surgery-countdown',
    title: () => m.tile_surgery_title(),
    subtitle: () => m.tile_surgery_sub(),
    prefKey: 'surgeryCountdownEnabled',
    surfaces: true
  },
  {
    key: 'safe-space-nudge',
    title: () => m.tile_safe_space_title(),
    subtitle: () => m.tile_safe_space_sub(),
    prefKey: 'safeSpaceNudgeEnabled',
    surfaces: true
  },
  {
    key: 'stock-notice',
    title: () => m.tile_stock_title(),
    subtitle: () => m.tile_stock_sub(),
    prefKey: 'stockNoticeEnabled',
    surfaces: true
  },
  {
    key: 'active-tryout-tile',
    title: () => m.tile_active_tryout_title(),
    subtitle: () => m.tile_active_tryout_sub(),
    prefKey: 'activeTryoutTileEnabled',
    surfaces: true
  },
  {
    key: 'patch-schedule-tile',
    title: () => m.tile_patch_schedule_title(),
    subtitle: () => m.tile_patch_schedule_sub(),
    prefKey: 'patchScheduleTileEnabled',
    surfaces: true
  },
  {
    key: 'voice-benchmark-nudge',
    title: () => m.tile_voice_benchmark_title(),
    subtitle: () => m.tile_voice_benchmark_sub(),
    prefKey: 'voiceBenchmarkNudgeEnabled',
    surfaces: true
  },
  {
    key: 'pause-active-banner',
    title: () => m.tile_pause_active_title(),
    subtitle: () => m.tile_pause_active_sub(),
    prefKey: 'pauseActiveBannerEnabled',
    surfaces: true
  },
  {
    key: 'hair-removal-recovery',
    title: () => m.tile_hair_removal_title(),
    subtitle: () => m.tile_hair_removal_sub(),
    prefKey: 'hairRemovalRecoveryEnabled',
    surfaces: true
  },
  {
    key: 'measurements-nudge',
    title: () => m.tile_measurements_title(),
    subtitle: () => m.tile_measurements_sub(),
    prefKey: 'measurementsNudgeEnabled',
    surfaces: true
  },
  {
    key: 'wrapped',
    title: () => m.wrapped(),
    subtitle: () => m.wrapped_settings_sub(),
    prefKey: 'wrappedEnabled',
    surfaces: true,
    notify: {
      title: () => m.retro_notify_title(),
      subtitle: () => m.wrapped_notify_sub(),
      prefKey: 'wrappedNotificationsEnabled',
      channel: 'retrospective',
      disguised: true
    }
  },
  {
    key: 'on-this-day',
    title: () => m.on_this_day(),
    subtitle: () => m.on_this_day_settings_sub(),
    prefKey: 'onThisDayEnabled',
    surfaces: true,
    notify: {
      title: () => m.retro_notify_title(),
      subtitle: () => m.on_this_day_notify_sub(),
      prefKey: 'onThisDayNotificationsEnabled',
      channel: 'retrospective',
      disguised: true
    }
  }
] as const;

/* A kind in `UnpromptedKind` with no entry above is a compile error here
   rather than a review catch, the same guarantee archiveSections.ts's
   `EverySectionRegistered` gives its own registry. Demonstrated by deleting
   a row above: `Unregistered` stops being `never` and this line refuses to
   compile. */
type Unregistered = Exclude<UnpromptedKind, (typeof ROWS)[number]['key']>;
type AssertNoneUnregistered<Missing extends never> = Missing;
export type EveryKindRegistered = AssertNoneUnregistered<Unregistered>;

export const LIVE_TILE_ROWS: readonly LiveTileRow[] = ROWS;

/** The runtime half of `EveryKindRegistered`: which kinds a given list of
    rows is missing, checked against the full `UNPROMPTED_KINDS` domain
    rather than against the list's own contents - so rows.test.ts can show
    the completeness rule actually failing on a named, shortened registry,
    not only assert that it never does. */
export function unregisteredKinds(rows: readonly Pick<LiveTileRow, 'key'>[]): UnpromptedKind[] {
  const present = new Set(rows.map((row) => row.key));
  return UNPROMPTED_KINDS.filter((kind) => !present.has(kind));
}
