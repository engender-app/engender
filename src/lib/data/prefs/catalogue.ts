/* Every preference the app has, with its default and its two memberships.
   Kept free of imports so both tiers and the pre-database boot path can
   read it.

   Two lists, and they deliberately do not line up:

   - Portable vs device-local (ADR-0003) decides whether a preference
     travels inside an export archive. It is an allowlist: a preference
     added later is device-local until someone puts it in PORTABLE_KEYS on
     purpose, so nothing leaks into an archive by accident.
   - The boot set (ADR-0009) decides whether a preference is mirrored
     outside SQLite, and its one question is different: is this needed
     before the database is open? Theme, palette and language must apply on
     first paint; the lock flags shape the passphrase gate that renders
     before the database can be unlocked (ticket 09). The mirror lives in
     plaintext localStorage, so nothing sensitive may join it: the PIN hash
     used to be here for the pre-database lock screen, and moved back
     behind encryption when the passphrase gate took that slot - a 4-digit
     hash beside the ciphertext is an offline-guessable secret (ADR-0018
     names sensitive boot preferences as covered). `bioOptIn` (ticket 18) is
     also in the boot set for the same "needed before the database opens"
     reason - the Android device-bound gate has to decide whether to auto-fire
     the platform prompt before there is a database to read the answer from -
     but it is a plain yes/no/unasked flag rather than a secret, so plaintext
     costs nothing the way a PIN hash would.

   catalogue.test.ts fails if a preference lands in neither of the first
   two lists. */

export interface PreferenceValues {
  onboarded: boolean;
  name: string;
  /** The gender scales the entry screen offers, by dimension key (phase 5
      ticket 35). A list somebody ticked, not a preset key resolved to a
      list: there are 32 subsets of five scales and the app used to ship
      eight of them, so choosing meant finding the preset that was wrong in
      the fewest places. Empty is a legitimate resting state - a mood, tags,
      a note and a photo are still an entry - and never an error.

      Order here is the order they were ticked in and nothing reads it: the
      editor draws its sliders in catalogue order (`reference.activeDimensions`),
      so which box was ticked first cannot move a slider. */
  activeScales: string[];
  /** Which quantity colours the Home strip and the calendar (CONTEXT: Metric). */
  metricKind: 'mood' | 'dimension';
  /** The gender dimension's key when metricKind is 'dimension', otherwise null. */
  metricDimension: string | null;
  theme: 'system' | 'light' | 'dark';
  palette: string;
  /** Mood's own fixed 5-step scale (ADR-0025), independent of `palette` -
      selectable on its own so a mood dot never has to double as a gender
      colour. */
  moodPreset: string;
  language: 'system' | 'en' | 'pl';
  a11yTextSizeBoost: boolean;
  a11yLegibilityBoost: boolean;
  a11yMotionReduce: boolean;
  /** Null until the person has answered the biometric ask (ticket 18) - the
      boot gate and the PIN pad both read it to decide whether to offer
      biometrics at all, so it has to distinguish "never asked" from
      "declined" rather than defaulting either way. */
  bioOptIn: boolean | null;
  lockOnLeave: boolean;
  disguise: boolean;
  quickExit: boolean;
  /** Reminder notifications show their real title and body when false; a
      generic one otherwise, regardless of whether the device is locked at
      the moment they fire (ticket 15) - the app cannot reliably learn the
      lock state at post time, so it never trusts one. */
  hideNotificationTitles: boolean;
  checkInEnabled: boolean;
  /** Wall-clock "HH:MM" in the device's timezone. */
  checkInTime: string;
  /** Whether the daily check-in prompt carries an affirming line alongside
      its question (phase 4 features ticket 22). Only ever adds a line to
      the prompt - off leaves the check-in exactly as it was. Portable,
      with `checkInEnabled` and `checkInTime` rather than with the wrapped
      family: it configures the same ritual those two carry into an
      archive, and someone who turned the line off should not get it back
      by restoring on a new device. Weighed rather than defaulted -
      ADR-0003's rule alone would have made it device-local. */
  checkInAffirmationsEnabled: boolean;
  /** Optional entry nudges that suggest adding detail after a mood-only save. */
  entryNudges: boolean;
  /** Whether the rotating reflection prompt shows on the entry-creation
      screen (phase 4 features ticket 17). Device-local for the same reason
      `entryNudges` is: a yes/no about one installation's entry screen, not
      anything the journal itself carries. */
  guidedPromptsEnabled: boolean;
  /** Whether active tryouts show a felt-sense quick prompt in the entry editor. */
  entryTryoutPromptEnabled: boolean;
  /** Whether a scheduled dose due today shows a quick-log chip in the entry editor. */
  entryDoseQuickLogEnabled: boolean;
  /** Whether post-op procedure recovery shows a status card in the entry editor. */
  entryProcedureRecoveryEnabled: boolean;
  /** Whether active HRT regimen shows a physical change marker chip in the entry editor. */
  entryHrtEffectsEnabled: boolean;
  /** Whether the wear-timer live tile is ever shown (phase 5 ticket 51).
      A kind-level switch, not a way to hide one running session: the tile
      appears while a session is running and the kind is on, and this never
      stands in for that data check (ADR-0039's amendment). Default on, the
      same "the app may speak unless told otherwise" default wrapped has.
      Device-local for the same reason `wrappedEnabled` is - a yes/no about
      one installation's Home screen. */
  wearTimerEnabled: boolean;
  /** Whether the dose-log live tile is ever shown (phase 5 ticket 51),
      while a regimen episode is active. Same shape and reasoning as
      `wearTimerEnabled`. */
  dosePanelEnabled: boolean;
  /** Whether the ready-letter live tile is ever shown (phase 5 ticket 51),
      when a time-capsule letter has become readable. Same shape and
      reasoning as `wearTimerEnabled`. */
  readyLetterEnabled: boolean;
  /** Whether the surgery-countdown live tile is ever shown (phase 5
      ticket 51), ahead of a scheduled procedure. Same shape and reasoning
      as `wearTimerEnabled`. */
  surgeryCountdownEnabled: boolean;
  /** Whether the Safe Space nudge is ever shown (phase 5 ticket 51), after
      an entry that reads as a bad moment. Same shape and reasoning as
      `wearTimerEnabled`. */
  safeSpaceNudgeEnabled: boolean;
  /** The entry ID of the most recent bad-moment entry whose Safe Space nudge
      was dismissed or opened (ticket 50). A subsequent qualifying entry with a
      newer ID produces its own fresh nudge. */
  safeSpaceNudgeDismissedEntryId: number | null;
  /** Whether the running-low stock notice is ever shown (phase 5 ticket 51),
      while an in-use regimen's stock is projected to run out. Same shape and
      reasoning as `wearTimerEnabled`. */
  stockNoticeEnabled: boolean;
  /** Whether the active-tryout live tile is ever shown (phase 5 deepening ticket 03). */
  activeTryoutTileEnabled: boolean;
  /** Whether the patch-schedule live tile is ever shown (phase 5 deepening ticket 03). */
  patchScheduleTileEnabled: boolean;
  /** Whether the voice-benchmark nudge live tile is ever shown (phase 5 deepening ticket 03). */
  voiceBenchmarkNudgeEnabled: boolean;
  /** A passage of somebody's own to read for a voice benchmark, empty for the
      one the app ships (phase 5 deepening ticket 15, CONTEXT: "Benchmark
      passage"). Kept because the next benchmark has to be read from the same
      words as the last one, which is the only thing that makes two of them
      comparable. */
  voiceBenchmarkPassage: string;
  /** The two ends of the person's own comfort band on the pitch figure, in
      Hz, or null when they have not set one (phase 8 features ticket 09,
      ADR-0059). Null is the shipped state and stays it: the reference bands
      on that figure are a citation, and this one is a decision nobody but
      the person can make, so there is no default and no table behind it.
      Both are set and cleared together, the way streakGoal's pair is.
      Portable, like every other preference that is about the person rather
      than about this installation (ADR-0003). */
  voiceComfortLowHz: number | null;
  voiceComfortHighHz: number | null;
  /** Whether the pause-active banner live tile is ever shown (phase 5 deepening ticket 03). */
  pauseActiveBannerEnabled: boolean;
  /** Whether the hair-removal recovery live tile is ever shown (phase 5 deepening ticket 03). */
  hairRemovalRecoveryEnabled: boolean;
  /** Whether the measurements nudge live tile is ever shown (phase 5 deepening ticket 03). */
  measurementsNudgeEnabled: boolean;
  /** Whether wrapped is offered at all (phase 4 features ticket 01). Off
      stops the Home card and the recap read behind it, rather than hiding a
      card over work that still runs.

      Device-local, deliberately, and unlike `checkInEnabled`: the check-in is
      a ritual with a time attached that a person would have to set up again
      on a new device, while this is a yes/no about one installation's Home
      screen. Weighed rather than defaulted - ADR-0003's rule would have
      landed it here either way. */
  wrappedEnabled: boolean;
  /** Whether on-this-day is offered at all (phase 4 features ticket 03).
      Its own toggle, independent of `wrappedEnabled`: on-this-day reuses
      wrapped's presentation components but answers a different question,
      and turning one off must not silently turn off the other. Device-local
      for the same reason `wrappedEnabled` is - a yes/no about one
      installation's Home screen. */
  onThisDayEnabled: boolean;
  /** Whether wrapped also fires a local notification when a fresh period is
      ready (phase 4 features ticket 04). Its own switch, independent of
      `wrappedEnabled`'s Home-card toggle - wanting the card is not the same
      as wanting to be pinged about it. Off by default, since notifications
      are opt-in, and forced back to false whenever `wrappedEnabled` is
      turned off, so there is no second toggle to remember to also find.
      Device-local for the same reason `wrappedEnabled` is. */
  wrappedNotificationsEnabled: boolean;
  /** Whether on-this-day also fires a local notification for a qualifying
      day (phase 4 features ticket 04). Same shape as
      `wrappedNotificationsEnabled`, and for the same reasons. */
  onThisDayNotificationsEnabled: boolean;
  /** Whether reminder alarms are scheduled at all (phase 6 ticket 04). The
      kind-level switch the notifications view draws, one level above each
      Reminder row's own `enabled`: off means no reminder reaches the phone,
      while the rows themselves stay exactly as the person wrote them. Off is
      final rather than a snooze - nothing turns it back on.

      Device-local, unlike the reminder rows it gates, which travel in an
      archive: this is a yes/no about whether this installation may fire. */
  remindersEnabled: boolean;
  /** Whether a wear session's own elapsed prompt is scheduled (phase 6
      ticket 04). A wear prompt is an ordinary Reminder row on a `wear:`
      auto-source (CONTEXT.md), so this gates that subset rather than a
      producer of its own, and independently of `remindersEnabled`: wanting
      medication reminders is not wanting to be told a binder has been on for
      eight hours. Device-local for the same reason `remindersEnabled` is. */
  wearElapsedEnabled: boolean;
  /** Whether a scheduled backup that failed says so on the phone (phase 6
      ticket 04). The notice has fired since phase 4 with no settings home at
      all; this is that home. On by default, unlike the two retrospective
      notifications: a backup that saved nothing is the one thing in here
      that is worth interrupting somebody for, and it is the half of the
      admission rule that says "something failed". */
  exportFailureNoticeEnabled: boolean;
  /** An export failure notice that came due inside quiet hours and is
      waiting for them to end (phase 6 ticket 04). Held, not dropped - the
      auto-export scheduler's next check outside the window posts it and
      clears this. The three other producers need no such flag: reminders
      shift their own alarm, and the two retrospective checks re-run every
      fifteen minutes anyway, so skipping one is already a hold. */
  heldExportFailureNotice: boolean;
  /** Whether quiet hours hold notifications at all (phase 6 ticket 04). One
      cross-class rule for every producer rather than a field per producer,
      which is what four schedulers each picking their own time amounted to
      before. Off by default: a rule about when the phone may wake somebody
      is theirs to set, and a window nobody asked for is its own surprise. */
  quietHoursEnabled: boolean;
  /** When quiet hours begin, as wall-clock `HH:MM` (phase 6 ticket 04).
      Stored as a time rather than an instant for the same reason a Reminder
      is (CONTEXT.md): 22:00 means 22:00 after a flight, not the instant that
      was 22:00 at home. */
  quietHoursStart: string;
  /** When quiet hours end, as wall-clock `HH:MM`. A window may wrap past
      midnight, which the default one does, and start equal to end is an
      empty window rather than a whole silent day - quietHours.ts owns that
      rule. */
  quietHoursEnd: string;
  /** The wrapped period (`cadence:start`) last notified about, so the
      scheduler does not repeat itself on every check while the same period
      is still fresh (phase 4 features ticket 04). Device-local: it
      describes this installation's notification history, not the journal. */
  lastWrappedNotifiedPeriodKey: string | null;
  /** The epoch day on-this-day last notified about (phase 4 features ticket
      04) - at most one on-this-day notification per day, even when more
      than one lookback qualifies. Device-local for the same reason
      `lastWrappedNotifiedPeriodKey` is. */
  lastOnThisDayNotifiedEpochDay: number | null;
  /** Optional per-analyte default units for labs entry/review. */
  preferredLabUnits: Partial<Record<'estradiol' | 'testosterone', string>>;
  /** The unit body measurements chart in (phase 5, "units should be
      choosable in settings"). A measurement is still logged and stored in
      whatever unit it was typed in, never converted (measurements.ts) -
      this only decides what a chart converts every reading to for display,
      which is what lets the chart be one line instead of one per unit
      someone has ever logged in. */
  measurementUnit: 'cm' | 'in';
  /** Which measurement types have had their capture-protocol guidance
      dismissed (ticket 08), keyed by measurement type key. Guidance is
      opt-in, never required to save a measurement, so this only ever
      hides a card - it blocks nothing. Widened from the four built-in
      keys to any string (phase 5 ticket 29): a custom type never has
      guidance to dismiss in the first place, so it never populates this
      at all, built-in or not. */
  measurementProtocolDismissed: Partial<Record<string, boolean>>;
  /** Whether the hair-photo capture-protocol guidance has been dismissed
      (phase 4 ticket 09). A plain boolean rather than measurementProtocolDismissed's
      per-type record: hair progress has only the one photo kind. Guidance
      is opt-in, never required to take a photo, so this only ever hides a
      card - it blocks nothing. */
  hairPhotoProtocolDismissed: boolean;
  /** The day the hair-progress timeline counts from, as an epoch day, or
      null when the person has not set one (phase 5 ticket 33). Null is a
      resting state, not unfinished setup: with no date set the screen falls
      back to the earliest dose logged, and with neither it simply shows no
      week counts (hairAnchor.ts). Portable rather than device-local - it
      says something about the journal's own timeline, the same way
      `journeyAnchorMilestoneId` does. */
  hairAnchorEpochDay: number | null;
  /** Whether the hormone curve is fitted to the user's own lab results
      (phase 4 ticket 10). Off by default: the published band is what the
      literature says, and moving it onto someone's own points is a thing
      they ask for rather than a thing that happens to them. Not portable -
      it says how one device draws a chart, not anything about the journal. */
  hormoneCurveFitToOwnLabs: boolean;
  /** The habit a streak goal (phase 4 features ticket 20) is set against,
      or null when no goal is set. Mirrors streakGoal.ts's
      `StreakGoalHabit` as an inline literal rather than importing it - this
      file stays import-free so both tiers and the pre-database boot path
      can read it. */
  streakGoalHabit: 'journaling' | null;
  /** The target streak length, in days, for `streakGoalHabit`. Null exactly
      when `streakGoalHabit` is null - the two are set and cleared together. */
  streakGoalTargetDays: number | null;
  /** The milestone id that durations, stats ranges and wrapped figures are
      measured from (phase 5 ticket 25), or null when none is chosen - a
      resting state the app never nags about, the same way an unset
      `streakGoalHabit` is never a bug to fix. Mirrors `activeScales`: one
      global choice rather than a per-surface one, so wrapped and a stats
      range cannot disagree about how long the person has been on their own
      journey. A milestone this install no longer has resolves to unset
      rather than falling back to another one. */
  journeyAnchorMilestoneId: string | null;
  /** Whether cycle tracking is surfaced for someone no active regimen
      already calls it out for (ADR-0043, phase 5 deepening ticket 05). Off
      by default: a standalone cycle row is a dysphoria trigger for the
      transfemme reader it has nothing to say to, so an active testosterone
      regimen surfaces it on its own and this is everyone else's way in -
      the row in More, the section beside side effects. It never hides or
      deletes records; the log keeps them and its direct URL either way.
      Portable: it says something about the person and their journal, the
      way `activeScales` does, so moving to a new device brings the opt-in
      along with the cycle_event rows it was set for. */
  cycleTrackingEnabled: boolean;
  autoExportEnabled: boolean;
  autoExportSchedule: 'weekly' | 'monthly';
  /** Epoch milliseconds, not an epoch day. */
  lastBackupAt: number | null;
  backupNoticeDismissed: boolean;
  /** When a dry-run restore drill last decrypted, parsed and validated a
      chosen archive without error (phase 4 features ticket 28). Epoch
      milliseconds, like `lastBackupAt`, and just as device-local: it
      describes what this installation has checked, not the journal. */
  lastVerifiedAt: number | null;
  /** Whether ticking a roadmap goal prompts to record it as a milestone
      on the timeline (phase 5 deepening ticket 10, ADR-0045). */
  roadmapMilestoneSyncEnabled: boolean;
  /** The areas whose finish offer has been answered no (phase 8 features
      ticket 04, ADR-0045). `ArchiveSectionName`s - the same key space
      `area_state` rows use.

      An offer that keeps coming back is a nag, and the rule this ticket
      holds itself to is that it asks once per area for the life of the
      journal. That needs the no kept somewhere, and it cannot be a column:
      `area_state` is deepening ticket 13's and holds what the person said
      about an area, while this holds what the app has already asked.

      Section names and **not** the hub row keys a person actually meets,
      which is ADR-0052's own rule about stored keys applied to a stored
      preference: a row renamed, regrouped or split this afternoon would
      otherwise quietly change which area a stored no refers to. The rows are
      resolved to sections by `areaGroups.ts`, which is also where a group
      reads as declined when any of its sections is.

      A list rather than a boolean per area, so a section added later needs
      no migration and no entry here. Portable, like `cycleTrackingEnabled`
      and for the same reason: it says something about this person and their
      journal rather than about this installation, and a restore that started
      asking again about eight areas would be the app forgetting an answer
      somebody gave. */
  areaFinishOfferDeclined: string[];
}

export type PreferenceKey = keyof PreferenceValues;

export const PREFERENCE_DEFAULTS: PreferenceValues = {
  onboarded: false,
  name: '',
  activeScales: ['euphoria_dysphoria', 'femininity', 'masculinity'],
  metricKind: 'mood',
  metricDimension: null,
  theme: 'system',
  palette: 'trans',
  moodPreset: 'teal',
  language: 'system',
  a11yTextSizeBoost: false,
  a11yLegibilityBoost: false,
  a11yMotionReduce: false,
  bioOptIn: null,
  lockOnLeave: false,
  disguise: false,
  quickExit: false,
  hideNotificationTitles: false,
  checkInEnabled: false,
  checkInTime: '21:00',
  checkInAffirmationsEnabled: true,
  entryNudges: true,
  guidedPromptsEnabled: true,
  entryTryoutPromptEnabled: true,
  entryDoseQuickLogEnabled: true,
  entryProcedureRecoveryEnabled: true,
  entryHrtEffectsEnabled: true,
  wearTimerEnabled: true,
  dosePanelEnabled: true,
  readyLetterEnabled: true,
  surgeryCountdownEnabled: true,
  safeSpaceNudgeEnabled: true,
  safeSpaceNudgeDismissedEntryId: null,
  stockNoticeEnabled: true,
  activeTryoutTileEnabled: true,
  patchScheduleTileEnabled: true,
  voiceBenchmarkNudgeEnabled: true,
  voiceBenchmarkPassage: '',
  voiceComfortLowHz: null,
  voiceComfortHighHz: null,
  pauseActiveBannerEnabled: true,
  hairRemovalRecoveryEnabled: true,
  measurementsNudgeEnabled: true,
  wrappedEnabled: true,
  onThisDayEnabled: true,
  wrappedNotificationsEnabled: false,
  onThisDayNotificationsEnabled: false,
  remindersEnabled: true,
  wearElapsedEnabled: true,
  exportFailureNoticeEnabled: true,
  heldExportFailureNotice: false,
  quietHoursEnabled: false,
  quietHoursStart: '22:00',
  quietHoursEnd: '07:00',
  lastWrappedNotifiedPeriodKey: null,
  lastOnThisDayNotifiedEpochDay: null,
  preferredLabUnits: {},
  measurementUnit: 'cm',
  measurementProtocolDismissed: {},
  hairPhotoProtocolDismissed: false,
  hairAnchorEpochDay: null,
  hormoneCurveFitToOwnLabs: false,
  streakGoalHabit: null,
  streakGoalTargetDays: null,
  journeyAnchorMilestoneId: null,
  cycleTrackingEnabled: false,
  autoExportEnabled: false,
  autoExportSchedule: 'weekly',
  lastBackupAt: null,
  backupNoticeDismissed: false,
  lastVerifiedAt: null,
  roadmapMilestoneSyncEnabled: true,
  areaFinishOfferDeclined: []
};

/** Describes the journal, so it travels in an archive (ADR-0003). */
export const PORTABLE_KEYS = [
  'name',
  'activeScales',
  'metricKind',
  'metricDimension',
  'palette',
  'moodPreset',
  'theme',
  'language',
  'checkInEnabled',
  'checkInTime',
  'checkInAffirmationsEnabled',
  'preferredLabUnits',
  'measurementUnit',
  'streakGoalHabit',
  'streakGoalTargetDays',
  'journeyAnchorMilestoneId',
  'hairAnchorEpochDay',
  'cycleTrackingEnabled',
  'voiceComfortLowHz',
  'voiceComfortHighHz',
  'areaFinishOfferDeclined'
] as const satisfies readonly PreferenceKey[];

/** Describes this installation, so it never leaves it (ADR-0003). */
export const DEVICE_LOCAL_KEYS = [
  'onboarded',
  'a11yTextSizeBoost',
  'a11yLegibilityBoost',
  'a11yMotionReduce',
  'bioOptIn',
  'lockOnLeave',
  'disguise',
  'quickExit',
  'hideNotificationTitles',
  'entryNudges',
  'guidedPromptsEnabled',
  'entryTryoutPromptEnabled',
  'entryDoseQuickLogEnabled',
  'entryProcedureRecoveryEnabled',
  'entryHrtEffectsEnabled',
  'wearTimerEnabled',
  'dosePanelEnabled',
  'readyLetterEnabled',
  'surgeryCountdownEnabled',
  'safeSpaceNudgeEnabled',
  'safeSpaceNudgeDismissedEntryId',
  'stockNoticeEnabled',
  'activeTryoutTileEnabled',
  'patchScheduleTileEnabled',
  'voiceBenchmarkNudgeEnabled',
  'voiceBenchmarkPassage',
  'pauseActiveBannerEnabled',
  'hairRemovalRecoveryEnabled',
  'measurementsNudgeEnabled',
  'wrappedEnabled',
  'onThisDayEnabled',
  'wrappedNotificationsEnabled',
  'onThisDayNotificationsEnabled',
  'remindersEnabled',
  'wearElapsedEnabled',
  'exportFailureNoticeEnabled',
  'heldExportFailureNotice',
  'quietHoursEnabled',
  'quietHoursStart',
  'quietHoursEnd',
  'lastWrappedNotifiedPeriodKey',
  'lastOnThisDayNotifiedEpochDay',
  'autoExportEnabled',
  'autoExportSchedule',
  'lastBackupAt',
  'backupNoticeDismissed',
  'lastVerifiedAt',
  'roadmapMilestoneSyncEnabled',
  'measurementProtocolDismissed',
  'hairPhotoProtocolDismissed',
  'hormoneCurveFitToOwnLabs'
] as const satisfies readonly PreferenceKey[];

/** Mirrored outside SQLite because it is needed before the database opens
    (ADR-0009). `language` has no pre-paint reader of its own: paraglide
    resolves the locale from its own localStorage strategy (vite.config.ts)
    before any of this runs, and setLocale() reloads the page. This is the
    app's own record of the choice, which is what makes it portable in an
    archive - paraglide's copy is not. */
export const BOOT_KEYS = [
  'theme',
  'palette',
  'moodPreset',
  'language',
  'a11yTextSizeBoost',
  'a11yLegibilityBoost',
  'a11yMotionReduce',
  'lockOnLeave',
  'disguise',
  'bioOptIn'
] as const satisfies readonly PreferenceKey[];

export type BootKey = (typeof BOOT_KEYS)[number];

export function isPreferenceKey(key: string): key is PreferenceKey {
  /* hasOwnProperty.call rather than Object.hasOwn, which arrived in Chrome 93
     and was the only call in app code above the bundle's own compile target
     (ADR-0023). It sits on the boot path - preferences are read before the
     first paint - so on a WebView between the two it took the app out before
     anything could render. */
  return Object.prototype.hasOwnProperty.call(PREFERENCE_DEFAULTS, key);
}

/** The metric in the form the entry repositories still take it: 'mood', or
    a gender dimension's key. The preference is a kind plus a key so that
    "mood" is a case rather than a reserved dimension name, and this is the
    one place the two forms meet - ticket 07 owns those signatures. */
export function metricKey(values: Pick<PreferenceValues, 'metricKind' | 'metricDimension'>): string {
  return values.metricKind === 'dimension' && values.metricDimension ? values.metricDimension : 'mood';
}
