/* Every kind Home may show or fire unprompted, as ticket 51's one
   consolidated Settings entry lists them: a live tile (CONTEXT.md), the
   stock notice, and wrapped and on-this-day, whose toggles moved here from
   the Tracking card they used to sit in.

   The list is the point: the screen draws one row per entry and nothing
   else, so a later tile ticket (45/46/47/48/50) adds its kind here - one
   array entry, no new markup - the same way archiveSections.ts is a
   registry rather than a hand-maintained list. Titles and subtitles are
   keyless functions over the message catalogue for the same reason the
   More hub's HubRow is: the swatch names translate with everything else.

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

export interface LiveTileRow {
  /** Stable handle for the walkthrough (ADR-0029) - never the title, which
      is copy. */
  key: string;
  title: () => string;
  subtitle: () => string;
  prefKey: BooleanPrefKey;
  /** The notification sub-toggle nested under this row, where the kind has
      one: hidden on web, forced off whenever the kind itself is turned off,
      exactly as these two rows behaved on the Tracking card. No live tile
      carries one today; the field is here so the screen needs no second
      shape if a later one earns it. */
  notify?: {
    title: () => string;
    subtitle: () => string;
    prefKey: BooleanPrefKey;
  };
}

export const LIVE_TILE_ROWS: LiveTileRow[] = [
  { key: 'wear-timer', title: () => m.tile_wear_title(), subtitle: () => m.tile_wear_sub(), prefKey: 'wearTimerEnabled' },
  { key: 'dose-panel', title: () => m.tile_dose_title(), subtitle: () => m.tile_dose_sub(), prefKey: 'dosePanelEnabled' },
  { key: 'ready-letter', title: () => m.tile_letter_title(), subtitle: () => m.tile_letter_sub(), prefKey: 'readyLetterEnabled' },
  {
    key: 'surgery-countdown',
    title: () => m.tile_surgery_title(),
    subtitle: () => m.tile_surgery_sub(),
    prefKey: 'surgeryCountdownEnabled'
  },
  {
    key: 'safe-space-nudge',
    title: () => m.tile_safe_space_title(),
    subtitle: () => m.tile_safe_space_sub(),
    prefKey: 'safeSpaceNudgeEnabled'
  },
  { key: 'stock-notice', title: () => m.tile_stock_title(), subtitle: () => m.tile_stock_sub(), prefKey: 'stockNoticeEnabled' },
  {
    key: 'active-tryout-tile',
    title: () => m.tile_active_tryout_title(),
    subtitle: () => m.tile_active_tryout_sub(),
    prefKey: 'activeTryoutTileEnabled'
  },
  {
    key: 'patch-schedule-tile',
    title: () => m.tile_patch_schedule_title(),
    subtitle: () => m.tile_patch_schedule_sub(),
    prefKey: 'patchScheduleTileEnabled'
  },
  {
    key: 'voice-benchmark-nudge',
    title: () => m.tile_voice_benchmark_title(),
    subtitle: () => m.tile_voice_benchmark_sub(),
    prefKey: 'voiceBenchmarkNudgeEnabled'
  },
  {
    key: 'pause-active-banner',
    title: () => m.tile_pause_active_title(),
    subtitle: () => m.tile_pause_active_sub(),
    prefKey: 'pauseActiveBannerEnabled'
  },
  {
    key: 'hair-removal-recovery',
    title: () => m.tile_hair_removal_title(),
    subtitle: () => m.tile_hair_removal_sub(),
    prefKey: 'hairRemovalRecoveryEnabled'
  },
  {
    key: 'measurements-nudge',
    title: () => m.tile_measurements_title(),
    subtitle: () => m.tile_measurements_sub(),
    prefKey: 'measurementsNudgeEnabled'
  },
  {
    key: 'wrapped',
    title: () => m.wrapped(),
    subtitle: () => m.wrapped_settings_sub(),
    prefKey: 'wrappedEnabled',
    notify: { title: () => m.retro_notify_title(), subtitle: () => m.wrapped_notify_sub(), prefKey: 'wrappedNotificationsEnabled' }
  },
  {
    key: 'on-this-day',
    title: () => m.on_this_day(),
    subtitle: () => m.on_this_day_settings_sub(),
    prefKey: 'onThisDayEnabled',
    notify: {
      title: () => m.retro_notify_title(),
      subtitle: () => m.on_this_day_notify_sub(),
      prefKey: 'onThisDayNotificationsEnabled'
    }
  }
];
