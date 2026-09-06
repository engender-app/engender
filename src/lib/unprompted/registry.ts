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
import { areaQuiet, type AreaStates, type HideableArea } from '../data/areaState';
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
  | 'appointment-today'
  | 'wrapped'
  | 'on-this-day'
  | 'revisit'
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
type NotificationChannel = 'reminders' | 'checkIn' | 'retrospective' | 'exportFailure';

export interface UnpromptedRow {
  /** Stable handle for the walkthrough (ADR-0029) - never the title, which
      is copy. */
  key: UnpromptedKind;
  /** What the kind is. Shared by both views: a row on one screen and a row
      on the other are the same kind, and calling it two things would be the
      "two registries" this file exists not to be. */
  title: () => string;
  /** Which area this kind talks about, or null where it talks about none
      (phase 8 features ticket 04, ADR-0052).

      An area that is hidden or finished goes quiet, and this is the field
      that says what "for that area" means - one declaration per kind, on the
      list that already holds every kind, rather than a second list of tiles
      and notifications kept somewhere else and silently missing the next one.
      `unpromptedQuiet` below is what reads it.

      Required, and nullable rather than optional, so a kind added here has to
      decide. Null is a real answer for most of them: a letter unlocking, a
      journaling pause, an export that failed and the two retrospectives are
      about the journal as a whole, and `entries` is not finishable.

      A row's `prefKey` is untouched by any of this. Whether a kind of prompt
      talks is a different question from whether an area is on, and this is a
      switch above the preferences rather than a replacement for them.

      Checked 2026-09-05 (features ticket 35) against the worry that
      `prefs/catalogue.ts`'s `*Enabled` booleans are a second, boolean-shaped
      answer to what this field already answers: they are not. Five rows
      carry a non-null area today - `wear-timer` and `wear-elapsed` both
      name `wearSessions`, so it is five booleans across four areas, not
      four - and every other `*Enabled` boolean fronts a record that cannot
      be an area at all (its own reason lives on its row above). ADR-0039's
      amendment is why the boolean survives alongside the cascade rather than
      being replaced by it: a kind's toggle means "never show me this kind,"
      not "hide the one instance that's currently true," and folding it into
      `unpromptedQuiet` would delete that distinction. This field being
      required rather than optional already forces the next kind to answer
      the same question, so no separate exhaustiveness guard is needed for
      it either. Nothing changed as a result of this check - see ticket 35's
      Outcome. */
  area: HideableArea | null;
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
    area: 'wearSessions',
    title: () => m.tile_wear_title(),
    surface: { subtitle: () => m.tile_wear_sub(), prefKey: 'wearTimerEnabled' }
  },
  {
    key: 'dose-panel',
    // a dose is an event inside a regimen episode, and an episode carries its own end day.
    area: null,
    title: () => m.tile_dose_title(),
    surface: { subtitle: () => m.tile_dose_sub(), prefKey: 'dosePanelEnabled' }
  },
  {
    key: 'ready-letter',
    // a letter is sealed and then unlocked, which is its whole lifecycle.
    area: null,
    title: () => m.tile_letter_title(),
    surface: { subtitle: () => m.tile_letter_sub(), prefKey: 'readyLetterEnabled' }
  },
  {
    key: 'surgery-countdown',
    // a procedure has its own date and its own recovery window.
    area: null,
    title: () => m.tile_surgery_title(),
    surface: { subtitle: () => m.tile_surgery_sub(), prefKey: 'surgeryCountdownEnabled' }
  },
  {
    key: 'safe-space-nudge',
    // a crisis surface, and being done needing it is not a thing to record.
    area: null,
    title: () => m.tile_safe_space_title(),
    surface: { subtitle: () => m.tile_safe_space_sub(), prefKey: 'safeSpaceNudgeEnabled' }
  },
  {
    key: 'stock-notice',
    // a running count of what is in the drawer, not a series to stop adding to.
    area: null,
    title: () => m.tile_stock_title(),
    surface: { subtitle: () => m.tile_stock_sub(), prefKey: 'stockNoticeEnabled' }
  },
  {
    key: 'active-tryout-tile',
    // a tryout carries its own end day.
    area: null,
    title: () => m.tile_active_tryout_title(),
    surface: { subtitle: () => m.tile_active_tryout_sub(), prefKey: 'activeTryoutTileEnabled' }
  },
  {
    key: 'patch-schedule-tile',
    // the dose log again, for the same reason as the dose panel.
    area: null,
    title: () => m.tile_patch_schedule_title(),
    surface: { subtitle: () => m.tile_patch_schedule_sub(), prefKey: 'patchScheduleTileEnabled' }
  },
  {
    key: 'voice-benchmark-nudge',
    area: 'voiceBenchmarks',
    title: () => m.tile_voice_benchmark_title(),
    surface: { subtitle: () => m.tile_voice_benchmark_sub(), prefKey: 'voiceBenchmarkNudgeEnabled' }
  },
  {
    key: 'pause-active-banner',
    // a journaling pause already carries the day it started and the day it ended.
    area: null,
    title: () => m.tile_pause_active_title(),
    surface: { subtitle: () => m.tile_pause_active_sub(), prefKey: 'pauseActiveBannerEnabled' }
  },
  {
    key: 'hair-removal-recovery',
    area: 'hairRemovalSessions',
    title: () => m.tile_hair_removal_title(),
    surface: { subtitle: () => m.tile_hair_removal_sub(), prefKey: 'hairRemovalRecoveryEnabled' }
  },
  {
    key: 'measurements-nudge',
    area: 'measurements',
    title: () => m.tile_measurements_title(),
    surface: { subtitle: () => m.tile_measurements_sub(), prefKey: 'measurementsNudgeEnabled' }
  },
  {
    key: 'appointment-today',
    // appointments is its own hideable series (hubRows.ts): hiding it takes
    // this tile with it the same way hiding wearSessions takes wear-timer.
    area: 'appointments',
    title: () => m.tile_appointment_title(),
    surface: { subtitle: () => m.tile_appointment_sub(), prefKey: 'appointmentTodayEnabled' }
  },
  {
    key: 'wrapped',
    // the journal as a whole, and `entries` is not finishable.
    area: null,
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
    // the journal as a whole, for the same reason.
    area: null,
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
    key: 'revisit',
    // an entry someone already wrote, on the day they chose to see it again.
    area: null,
    title: () => m.tile_revisit_title(),
    surface: { subtitle: () => m.tile_revisit_sub(), prefKey: 'revisitEnabled' }
    // No `notify`: phase 8 features ticket 08 is explicit that this
    // registers no new notification machinery - the arrival offers in the
    // app and never mints anything (ADR-0045), the same reason a ready
    // letter carries no `notify` either.
  },
  {
    key: 'reminders',
    // an intention for a future day, switched off one reminder at a time.
    area: null,
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
    // the journal as a whole, for the same reason wrapped is.
    area: null,
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
    area: 'wearSessions',
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
    // a failure of this device's own bookkeeping, about no area at all.
    area: null,
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

/** Every kind, addressable by key - what the cascade below and the two views
    read a row through when they hold a kind rather than a list. */
const ROW_OF = Object.fromEntries(UNPROMPTED_ROWS.map((row) => [row.key, row])) as Record<
  UnpromptedKind,
  UnpromptedRow
>;

/** Whether a kind should stay silent because the area it talks about is
    hidden or finished (phase 8 features ticket 04, ADR-0052).

    The cascade, in one line and read from the registry itself. A tile, a
    notification and anything else that grows a row here all pass through this
    rather than each asking `areaQuiet` about an area it named for itself -
    which is what would leave the next kind out of the cascade silently.

    Above the preferences, not instead of them: a caller still asks its own
    `prefKey`, and this only takes away the areas that are off. A kind about
    no area is never quiet here. */
export function unpromptedQuiet(kind: UnpromptedKind, states: AreaStates, todayEpochDay: number): boolean {
  const area = ROW_OF[kind].area;
  return area !== null && areaQuiet(area, states, todayEpochDay);
}

/** A row as the view drawing it sees one: the half that view owns is no
    longer optional. Without these two, both screens read `row.surface!` and
    `row.notify!` on every line, which is a non-null assertion standing in
    for a filter that already ran. */
export type SurfaceRow = UnpromptedRow & { surface: NonNullable<UnpromptedRow['surface']> };
type NotificationRow = UnpromptedRow & { notify: NonNullable<UnpromptedRow['notify']> };

/** The surfaces view's rows, in registry order. */
export const SURFACE_ROWS: readonly SurfaceRow[] = UNPROMPTED_ROWS.filter(
  (row): row is SurfaceRow => row.surface !== undefined
);

/** The notifications view's rows, in registry order - every kind that may
    reach the phone rather than only the app. */
/* NOTIFICATION_ROWS stays exported only for its own test (AU-09 test-only
   review). */
export const NOTIFICATION_ROWS: readonly NotificationRow[] = UNPROMPTED_ROWS.filter(
  (row): row is NotificationRow => row.notify !== undefined
);

/** `UnpromptedKind` as a value, read off `ROWS` itself rather than typed out
    a second time - a hand-kept second copy of the same literals would be
    exactly the kind of list `EveryKindRegistered` exists to stop needing.
    Safe to derive here, unlike `Unregistered` above: this only has to name
    what today's registry actually holds for `unregisteredKinds` to check a
    *shortened copy* against, not stand as its own independent source of
    truth - that job is `UnpromptedKind`'s. */
/* UNPROMPTED_KINDS stays exported only for liveTiles.grid.test.ts,
   home-surfaces.test.ts, which cross-check against it (AU-09 test-only
   review). */
export const UNPROMPTED_KINDS: readonly UnpromptedKind[] = ROWS.map((row) => row.key);

/** The runtime half of `EveryKindRegistered`: which kinds a given list of
    rows is missing, checked against the full `UNPROMPTED_KINDS` domain
    rather than against the list's own contents - so registry.test.ts can
    show the completeness rule actually failing on a named, shortened
    registry, not only assert that it never does. */
/* unregisteredKinds stays exported only for its own test (AU-09 test-only
   review). */
export function unregisteredKinds(rows: readonly Pick<UnpromptedRow, 'key'>[]): UnpromptedKind[] {
  const present = new Set(rows.map((row) => row.key));
  return UNPROMPTED_KINDS.filter((kind) => !present.has(kind));
}
