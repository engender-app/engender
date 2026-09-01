/* Every kind the app may show or fire unprompted (phase 6 tickets 02 and
   04): a live tile (CONTEXT.md), the stock notice, wrapped and on-this-day,
   and - since ticket 04 - the four producers that used to answer to nobody
   in common, namely reminders, the daily check-in, a wear session's elapsed
   prompt and the auto-export failure notice. Era mutes fold in at ticket
   05; insight rows at 06 - each of those becomes one array entry below
   rather than a fifth place deciding for itself.

   The list is the point: each of the two views draws one row per entry and
   nothing else, so a later ticket adds its kind here - one array entry, no
   new markup - the same way archiveSections.ts is a registry rather than a
   hand-maintained list. Titles and subtitles are keyless functions over the
   message catalogue for the same reason the More hub's HubRow is: the
   swatch names translate with everything else.

   Two views, one list. `/settings/live-tiles` is the surfaces view and
   draws every row with a `surface`; `/settings/notifications` is the
   notifications view and draws every row with a `notify`. Someone asking
   "stop buzzing my phone" and someone asking "stop putting things on my
   home screen" are different people in different moments, which is why
   there are two views and only one list behind them.

   A row switches its kind off for good, never one true instance (a running
   session cannot be hidden while it runs) - ADR-0039's amendment holds the
   line, and the tile tickets read these keys as one gate on top of their
   own data trigger.

   ## The admission rule (phase 6 ticket 04)

   **A notification requires that the person scheduled this specific thing
   for a specific time, or that something failed. Everything else surfaces
   in the app and waits.**

   Written down here because its whole value is that the next feature has to
   argue with it: a kind that wants a `notify` below has to say which half
   of the rule admits it. What the six firing rows claim today:

   - `reminders`, `check-in`, `wear-elapsed` - scheduled, for a time the
     person themselves set (a rule, a check-in time, an hour count on a wear
     session).
   - `export-failure` - something failed, and nothing was saved.
   - `wrapped`, `on-this-day` - **grandfathered.** Neither passes the rule:
     both are content offers the app decides are due. They keep their
     existing opt-in toggles and behaviour because a milestone about consent
     should not silently withdraw behaviour people already chose, not
     because the rule admits them.

   Applied honestly to what phase 6 adds, the rule admits nothing new: the
   appointment debrief offer, insights and the flourish are all in-app. That
   is the expected outcome rather than a sign a ticket is incomplete.

   Quiet hours is the one cross-class rule (quietHours.ts), not a field per
   row: a notification due inside the window is held until the window ends,
   never dropped. Disguise is the other - `hideNotificationTitles` covers
   every row whose `notify.disguised` is true, which is every one of them. */
/* Relative rather than $lib: registry.test.ts imports this file on the node
   tier, where no $lib alias exists - the one svelte-kit-ism the tests can't
   follow (see vitest.config.ts). */
import { m } from '../paraglide/messages';
import type { PreferenceKey, PreferenceValues } from '../data/prefs/catalogue';

/** A preference that is a plain on/off, so a view's switch wiring can index
    the store directly instead of narrowing each entry by hand. */
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
  | 'on-this-day'
  | 'reminders'
  | 'check-in'
  | 'wear-elapsed'
  | 'export-failure';

/** Which Android notification channel a firing kind uses. Reminders, the
    check-in and a wear session's elapsed prompt share the two fixed channels
    android-bridge.ts declares - a wear prompt is an ordinary Reminder row
    (CONTEXT.md), so it arrives on the reminder channel rather than one of its
    own. Wrapped and on-this-day each name a channel after their own title
    (retrospective-notifications-scheduler.ts); `retrospective` covers both
    here, since what varies between them is the channel's display name, not
    its category. `exportFailure` is AutoExportPlugin's own. */
export type NotificationChannel = 'reminders' | 'checkIn' | 'retrospective' | 'exportFailure';

export interface UnpromptedRow {
  /** Stable handle for the walkthrough (ADR-0029) - never the title, which
      is copy. */
  key: UnpromptedKind;
  /** What the kind is. Shared by both views: a row on one screen and a row
      on the other are the same kind, and calling it two things would be the
      "two registries" this file exists not to be. */
  title: () => string;
  /** Present when this kind has a row on the surfaces view
      (`/settings/live-tiles`), carrying the preference that switch writes
      and the subtitle saying what it puts in front of you. Absent is "shows
      nothing in the app of its own": the four producers ticket 04 folded in
      all fire and none surfaces. */
  surface?: { subtitle: () => string; prefKey: BooleanPrefKey };
  /** Present when this kind may become a notification, and what firing
      means: the preference the notifications view's switch writes, the
      subtitle saying *when* it fires, which channel it fires on, and
      whether `hideNotificationTitles` disguises it. Absent is "never
      fires"; no live tile carries this. Every row that carries one has to
      answer the admission rule above. A `notify` with no `channel` does not
      compile - see `UNPROMPTED_ROWS` below. */
  notify?: {
    subtitle: () => string;
    prefKey: BooleanPrefKey;
    channel: NotificationChannel;
    disguised: boolean;
  };
}

/* `as const`, not typed against `UnpromptedRow[]`: giving every entry the
   interface's `key: UnpromptedKind` up front would widen each one to the
   whole union before `EveryKindRegistered` below ever compares them, which
   is the trap the ticket warns about - a completeness check that can never
   fail because the "registered" side already claims everything. Kept
   literal here and widened only for `UNPROMPTED_ROWS`, the export everything
   else reads. */
const ROWS = [
  {
    key: 'wear-timer',
    title: () => m.tile_wear_title(),
    surface: { subtitle: () => m.tile_wear_sub(), prefKey: 'wearTimerEnabled' }
  },
  {
    key: 'dose-panel',
    title: () => m.tile_dose_title(),
    surface: { subtitle: () => m.tile_dose_sub(), prefKey: 'dosePanelEnabled' }
  },
  {
    key: 'ready-letter',
    title: () => m.tile_letter_title(),
    surface: { subtitle: () => m.tile_letter_sub(), prefKey: 'readyLetterEnabled' }
  },
  {
    key: 'surgery-countdown',
    title: () => m.tile_surgery_title(),
    surface: { subtitle: () => m.tile_surgery_sub(), prefKey: 'surgeryCountdownEnabled' }
  },
  {
    key: 'safe-space-nudge',
    title: () => m.tile_safe_space_title(),
    surface: { subtitle: () => m.tile_safe_space_sub(), prefKey: 'safeSpaceNudgeEnabled' }
  },
  {
    key: 'stock-notice',
    title: () => m.tile_stock_title(),
    surface: { subtitle: () => m.tile_stock_sub(), prefKey: 'stockNoticeEnabled' }
  },
  {
    key: 'active-tryout-tile',
    title: () => m.tile_active_tryout_title(),
    surface: { subtitle: () => m.tile_active_tryout_sub(), prefKey: 'activeTryoutTileEnabled' }
  },
  {
    key: 'patch-schedule-tile',
    title: () => m.tile_patch_schedule_title(),
    surface: { subtitle: () => m.tile_patch_schedule_sub(), prefKey: 'patchScheduleTileEnabled' }
  },
  {
    key: 'voice-benchmark-nudge',
    title: () => m.tile_voice_benchmark_title(),
    surface: { subtitle: () => m.tile_voice_benchmark_sub(), prefKey: 'voiceBenchmarkNudgeEnabled' }
  },
  {
    key: 'pause-active-banner',
    title: () => m.tile_pause_active_title(),
    surface: { subtitle: () => m.tile_pause_active_sub(), prefKey: 'pauseActiveBannerEnabled' }
  },
  {
    key: 'hair-removal-recovery',
    title: () => m.tile_hair_removal_title(),
    surface: { subtitle: () => m.tile_hair_removal_sub(), prefKey: 'hairRemovalRecoveryEnabled' }
  },
  {
    key: 'measurements-nudge',
    title: () => m.tile_measurements_title(),
    surface: { subtitle: () => m.tile_measurements_sub(), prefKey: 'measurementsNudgeEnabled' }
  },
  {
    key: 'wrapped',
    title: () => m.wrapped(),
    surface: { subtitle: () => m.wrapped_settings_sub(), prefKey: 'wrappedEnabled' },
    notify: {
      subtitle: () => m.wrapped_notify_sub(),
      prefKey: 'wrappedNotificationsEnabled',
      channel: 'retrospective',
      disguised: true
    }
  },
  {
    key: 'on-this-day',
    title: () => m.on_this_day(),
    surface: { subtitle: () => m.on_this_day_settings_sub(), prefKey: 'onThisDayEnabled' },
    notify: {
      subtitle: () => m.on_this_day_notify_sub(),
      prefKey: 'onThisDayNotificationsEnabled',
      channel: 'retrospective',
      disguised: true
    }
  },
  {
    key: 'reminders',
    title: () => m.reminders(),
    notify: {
      subtitle: () => m.notif_reminders_sub(),
      prefKey: 'remindersEnabled',
      channel: 'reminders',
      disguised: true
    }
  },
  {
    key: 'check-in',
    title: () => m.checkin_title(),
    notify: {
      subtitle: () => m.notif_check_in_sub(),
      prefKey: 'checkInEnabled',
      channel: 'checkIn',
      disguised: true
    }
  },
  {
    key: 'wear-elapsed',
    title: () => m.notif_wear_elapsed_title(),
    notify: {
      subtitle: () => m.notif_wear_elapsed_sub(),
      prefKey: 'wearElapsedEnabled',
      channel: 'reminders',
      disguised: true
    }
  },
  {
    key: 'export-failure',
    title: () => m.notif_export_failure_title(),
    notify: {
      subtitle: () => m.notif_export_failure_sub(),
      prefKey: 'exportFailureNoticeEnabled',
      channel: 'exportFailure',
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

/* This assignment is where a row that fires without declaring a channel
   stops compiling, and it matters for a sharper reason than tidiness:
   `postNotification` on the Android side needs a channel to post into, and a
   kind that reaches it with none is a notification the OS drops on the
   floor. `notify` is a required-fields object rather than a bag of
   optionals, so a literal above that leaves `channel` out is not assignable
   to `UnpromptedRow` and this line refuses it. Demonstrated by deleting
   `channel: 'reminders'` from the `reminders` row. */
export const UNPROMPTED_ROWS: readonly UnpromptedRow[] = ROWS;

/** The surfaces view's rows, in registry order. */
export const SURFACE_ROWS: readonly UnpromptedRow[] = UNPROMPTED_ROWS.filter((row) => row.surface);

/** The notifications view's rows, in registry order - every kind that may
    reach the phone rather than only the app. */
export const NOTIFICATION_ROWS: readonly UnpromptedRow[] = UNPROMPTED_ROWS.filter((row) => row.notify);

/** `UnpromptedKind` as a value, read off `ROWS` itself rather than typed out
    a second time - a hand-kept second copy of the same literals would be
    exactly the kind of list `EveryKindRegistered` exists to stop needing.
    Safe to derive here, unlike `Unregistered` above: this only has to name
    what today's registry actually holds for `unregisteredKinds` to check a
    *shortened copy* against, not stand as its own independent source of
    truth - that job is `UnpromptedKind`'s. */
export const UNPROMPTED_KINDS: readonly UnpromptedKind[] = ROWS.map((row) => row.key);

/** The runtime half of `EveryKindRegistered`: which kinds a given list of
    rows is missing, checked against the full `UNPROMPTED_KINDS` domain
    rather than against the list's own contents - so registry.test.ts can
    show the completeness rule actually failing on a named, shortened
    registry, not only assert that it never does. */
export function unregisteredKinds(rows: readonly Pick<UnpromptedRow, 'key'>[]): UnpromptedKind[] {
  const present = new Set(rows.map((row) => row.key));
  return UNPROMPTED_KINDS.filter((kind) => !present.has(kind));
}
