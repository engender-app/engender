/* The import-free preference catalogue serves both tiers and early boot.

   `PORTABLE_KEYS` is the Archive allowlist. New preferences stay device-local by default
   (ADR-0003). The independent boot set mirrors first-paint settings and gate flags in
   plaintext localStorage. Keep secrets such as the PIN hash behind encryption (ADR-0018).
   catalogue.test.ts checks that each preference is classified as portable or device-local. */

import type { Acknowledgements } from '../acknowledgements';

/** The four answers to "when does it ask again", in the order screens list
    them. */
export const LOCK_AFTER_CHOICES = ['immediately', 'one-minute', 'five-minutes', 'restart'] as const;
export type LockAfter = (typeof LOCK_AFTER_CHOICES)[number];

export interface PreferenceValues {
  onboarded: boolean;
  name: string;
  /** The gender scales the entry screen offers, by dimension key. A list somebody ticked, not a preset key resolved to a
      list: the app used to ship eight presets out of the 32 subsets of the
      five scales it had then (64 of today's six), so choosing meant finding
      the preset that was wrong in the fewest places. Empty is a legitimate resting state - a mood, tags,
      a note and a photo are still an entry - and never an error.

      Order here is the order they were ticked in and nothing reads it: the
      editor draws its sliders in catalogue order (`reference.activeDimensions`),
      so which box was ticked first cannot move a slider. */
  activeScales: string[];
  /** Which quantity colours the Home strip and the calendar. */
  metricKind: 'mood' | 'dimension';
  /** The gender dimension's key when metricKind is 'dimension', otherwise null. */
  metricDimension: string | null;
  theme: 'system' | 'light' | 'dark';
  palette: string;
  launcherIconShape: 'current' | 'round';
  /** Mood's own fixed 5-step scale, independent of `palette` -
      selectable on its own so a mood dot never has to double as a gender
      colour. */
  moodPreset: string;
  language: 'system' | 'en' | 'pl';
  a11yTextSizeBoost: boolean;
  a11yLegibilityBoost: boolean;
  a11yMotionReduce: boolean;
  /** How long the app may be out of sight before the access mode's secret is asked for
      again. Replaced `lockOnLeave`, whose on and off are `immediately` and `restart`;
      migration 117 moved an old row across. Meaningless under a mode with no secret, which
      is why no screen asks it there. */
  lockAfter: LockAfter;
  disguise: boolean;
  /** Android only (ticket screen-capture-guard/01): whether this device may
      screenshot or record the app, mirrored into SharedPreferences so
      MainActivity can decide FLAG_SECURE before the window has a frame.
      Default true. False is the person's choice: the Security row is a
      "Block screenshots" switch that is on when this is false
      (lock/screenshot-block.ts). */
  allowScreenCapture: boolean;
  /** Reminder notifications show their real title and body when false; a
      generic one otherwise, regardless of whether the device is locked at
      the moment they fire - the app cannot reliably learn the
      lock state at post time, so it never trusts one. */
  hideNotificationTitles: boolean;
  checkInEnabled: boolean;
  /** Wall-clock "HH:MM" in the device's timezone. */
  checkInTime: string;
  /** The last day the check-in stays silent, or null when it is not paused. It fires again
      the day after (checkIn.ts). Portable with the check-in's own two keys. */
  checkInPausedThrough: number | null;
  /** Whether the rotating reflection prompt shows on the entry-creation
      screen. Device-local because this controls
      one installation's entry screen, not anything the journal carries. */
  guidedPromptsEnabled: boolean;
  /** Whether a running binder session past eight hours picks up its
      duration cue, on the wear screen and the live tile. Default on: the figure is well enough sourced to
      show unasked, and the cue blocks nothing.

      It covers the cue and only the cue. The static safety facts on the
      record sheet are not gated by it - those are the near-universally
      agreed non-duration ones (never sleep in a binder, no ace bandages, no
      household tape), and a person turning off an eight-hour marker is not
      asking to be told less about tape.

      Device-local for the same reason `guidedPromptsEnabled` and
      `roadmapMilestoneSyncEnabled` are: a yes/no about what this
      installation's screens say. */
  wearDurationCueEnabled: boolean;
  /** The entry ID of the most recent bad-moment entry whose Safe Space nudge
      was dismissed or opened. A subsequent qualifying entry with a
      newer ID produces its own fresh nudge. */
  safeSpaceNudgeDismissedEntryId: number | null;
  /** A passage of somebody's own to read for a voice benchmark, empty for the one the app
      ships. Kept because the next benchmark has to be read from the same words as the last
      one, which is the only thing that makes two of them comparable. */
  voiceBenchmarkPassage: string;
  /** The two ends of the person's own comfort band on the pitch figure, in
      Hz, or null when they have not set one (ADR-0059). Null is the shipped state; no default or suggested range.
      Both are set and cleared together.
      Portable, like every other preference that is about the person rather
      than about this installation (ADR-0003). */
  voiceComfortLowHz: number | null;
  voiceComfortHighHz: number | null;
  /** The person's own answer to "show me this kind of thing", for every kind in the
      unprompted registry that draws something in the app: the live tiles, the stock notice,
      wrapped and on-this-day. Keyed by the registry's kind (`UnpromptedKind`) and holding
      only an answer that differs from the registry's default, so the defaults live in one
      place and a kind added later needs no key here. A key this build has no kind for is
      left alone.

      A switch is a kind-level yes or no, never a way to hide one running session. Portable,
      like `pinnedRows` beside it: which tiles somebody turned off is a statement about the
      front page they arranged, and a restore that switched them all back on would be the
      app forgetting an answer. Notifications keep their own switches. */
  surfaceOverrides: Partial<Record<string, boolean>>;
  /** Whether reminder alarms are scheduled at all. The
      kind-level switch the notifications view draws, one level above each
      Reminder row's own `enabled`: off means no reminder reaches the phone,
      while the rows themselves stay exactly as the person wrote them. Off is
      final rather than a snooze - nothing turns it back on.

      Device-local, unlike the reminder rows it gates, which travel in an
      archive: this is a yes/no about whether this installation may fire. */
  remindersEnabled: boolean;
  /** Whether a wear session's own elapsed prompt is scheduled. A wear prompt is an ordinary Reminder row on a `wear:`
      auto-source, so this gates that subset rather than a
      producer of its own, and independently of `remindersEnabled`: wanting
      medication reminders is not wanting to be told a binder has been on for
      eight hours. Device-local for the same reason `remindersEnabled` is. */
  wearElapsedEnabled: boolean;
  /** Whether a scheduled backup that failed says so on the phone. The notice has fired in
      older versions with no settings home at all; this is that home. On by default because
      a backup that saved nothing meets the notification rule for a failed action. */
  exportFailureNoticeEnabled: boolean;
  /** An export failure notice that came due inside quiet hours and is
      waiting for them to end. Held, not dropped - the
      auto-export scheduler's next check outside the window posts it and
      clears this. Reminders shift their own alarm, so they need no such
      flag. */
  heldExportFailureNotice: boolean;
  /** Native backup failure timestamp last posted, held or declined by the
      notice switch. Device-local notification history survives scheduler
      restarts without travelling in an Archive. */
  lastExportFailureNotifiedAt: number | null;
  /** Whether quiet hours hold notifications at all. One
      cross-class rule for every producer rather than a field per producer,
      which is what four schedulers each picking their own time amounted to
      before. Off by default: a rule about when the phone may wake somebody
      is theirs to set, and a window nobody asked for is its own surprise. */
  quietHoursEnabled: boolean;
  /** When quiet hours begin, as wall-clock `HH:MM`.
      Stored as a time rather than an instant for the same reason a Reminder
      is: 22:00 means 22:00 after a flight, not the instant that
      was 22:00 at home. */
  quietHoursStart: string;
  /** When quiet hours end, as wall-clock `HH:MM`. A window may wrap past
      midnight, which the default one does, and start equal to end is an
      empty window rather than a whole silent day - quietHours.ts owns that
      rule. */
  quietHoursEnd: string;
  /** Optional per-analyte default units for labs entry/review. */
  preferredLabUnits: Partial<Record<'estradiol' | 'testosterone', string>>;
  /** Whether the Look back rail's "drag the ends" hint has been answered by
      a drag. One flag rather than a count: the hint is
      there to say the rail can be dragged, and one drag is the whole
      answer. Device-local, with the two protocol flags above: what it
      records is that somebody has worked out a gesture on this
      installation, which does not travel with the journal - a restore on a
      new device is a screen somebody has not used before. */
  spanRailHintDismissed: boolean;
  /** The day HRT began, as the person set it, or null to count from the earliest HRT
      episode (personalEffectWindow.ts's hrtAnchor). The effects timeline and its onset
      bands count from it. Portable, because it is a fact about the journal. */
  hrtStartEpochDay: number | null;
  /** The milestone id that durations, stats ranges and wrapped figures are
      measured from, or null when none is chosen - a
      resting state the app never nags about. Mirrors `activeScales`: one
      global choice rather than a per-surface one, so wrapped and a stats
      range cannot disagree about how long the person has been on their own
      journey. A milestone this install no longer has resolves to unset
      rather than falling back to another one. */
  journeyAnchorMilestoneId: string | null;
  /** Null preserves the pre-choice rule for existing journals. A new journal records false
      when setup finishes. */
  cycleTrackingChoice: boolean | null;
  autoExportEnabled: boolean;
  autoExportSchedule: 'weekly' | 'monthly';
  /** Epoch milliseconds, not an epoch day. */
  lastBackupAt: number | null;
  backupNoticeDismissed: boolean;
  /** Home's "this browser may clear your journal" notice, put away. Device-local: it is
      about this browser. */
  storageNoticeDismissed: boolean;
  /** When a dry-run restore drill last decrypted, parsed and validated a
      chosen archive without error. Epoch
      milliseconds, like `lastBackupAt`, and just as device-local: it
      describes what this installation has checked, not the journal. */
  lastVerifiedAt: number | null;
  /** Whether ticking a roadmap goal prompts to record it as a milestone
      on the timeline (ADR-0045). */
  roadmapMilestoneSyncEnabled: boolean;
  /** The answer to the roadmap's "Polish legal steps" switch, null until somebody touches it. Null is off in
      every language (roadmap.ts, `polishLegalStepsShown`). Portable, on `areaFinishOfferDeclined`'s
      argument: whether a Polish court procedure is somebody's path is
      something they said about their own journal. */
  roadmapPolishStepsChoice: boolean | null;
  /** Whether the roadmap's built-in "Social and presentation" group shows. On until
      switched off: unlike the Polish steps it is not tied to a country, so there is no
      locale to follow. Portable, on `roadmapPolishStepsChoice`'s argument. */
  roadmapSocialStepsShown: boolean;
  /** Portable list of declined finish offers (ADR-0045). Ask once per
      journal and area. Store stable `ArchiveSectionName` keys instead of
      hub row keys (ADR-0052). `areaGroups.ts` treats a group as declined
      if any member is. The list accommodates new sections without a
      migration and preserves answers across restore. */
  areaFinishOfferDeclined: string[];
  /** The last gap for which this installation opened `/coming-back`, or
      null. Store its journal-derived `sinceEpochDay` so reopening without
      writing does not repeat it and later gaps get their own opening.
      Keep it device-local so a restore can show the return on a new
      installation. */
  comingBackSeenSince: number | null;
  /** Which drugs a person has turned off the clinician summary's regimen, dose-history and
      exposure sections, keyed by drug name. On (absent or false) by default. Device- local:
      which drug a printout leaves out is a choice about a specific visit on this
      installation, not portable journal data (ADR-0003). */
  clinicianSummaryDrugExcluded: Partial<Record<string, boolean>>;
  /** Which drug's schedule /doses' "against the schedule" view compares
      against, while more than one regimen episode is active at once.
      Null until chosen, and a stored pick
      that no longer names a currently active drug resolves back to the
      screen's own default rather than showing nothing. Device-local: it is
      a choice about what this installation's screen currently shows, not
      something the journal itself remembers. */
  adherenceRegimenPick: string | null;
  /** Ordered Home pins use hub row keys, resolved by `pinnedRows.ts`.
      An empty list means no pins. Null resolves defaults from
      `onboardingAreas` or the legacy default set. Resolve defaults
      without writing. Reset returns to null.

      Pins refer to UI rows rather than archive sections (ADR-0052).
      Ignore stale keys for rows the registry no longer holds. */
  pinnedRows: string[] | null;
  /** Saved area choices from older onboarding flows. `hubRows.ts` row keys.

      Held apart from `pinnedRows` rather than written straight into it, because the initial
      pins have to stay computable after the front page has been rearranged: reset returns
      to this choice or the default set.

      Null means no saved answer and resolves to `DEFAULT_ONBOARDING_AREAS`. An empty list
      is somebody who unticked everything, and it means a front page with no pinned rows,
      the same way an empty `pinnedRows` does. */
  onboardingAreas: string[] | null;
  /** What the person has already been told: tile snoozes, letters read and
      met, and the last answer to "are there entries". Four facts that used to sit in plaintext localStorage,
      where they showed which features a journal uses. Portable, so letter
      read state finally travels with a backup. The shape and its rules are
      data/acknowledgements.ts's. */
  acknowledgements: Acknowledgements;
  /** The height each screen's late block last rested at, by slot (data/homeReserve.ts), so
      its next visit holds that room. Home's own three stay in localStorage for its first
      frame; these name screens (dilation, doses, wear), so they live behind the journal's
      key. Device-local: a height belongs to this screen size. */
  layoutReserves: Record<string, number>;
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
  launcherIconShape: 'current',
  moodPreset: 'teal',
  language: 'system',
  a11yTextSizeBoost: false,
  a11yLegibilityBoost: false,
  a11yMotionReduce: false,
  /* A restart, because that is what the old switch's off meant and every journal from that
     never touched it was off. A new install is offered a minute in setup instead, and only
     writes it by answering. */
  lockAfter: 'restart',
  disguise: false,
  allowScreenCapture: true,
  hideNotificationTitles: true,
  checkInEnabled: false,
  checkInTime: '21:00',
  checkInPausedThrough: null,
  guidedPromptsEnabled: true,
  wearDurationCueEnabled: true,
  safeSpaceNudgeDismissedEntryId: null,
  voiceBenchmarkPassage: '',
  voiceComfortLowHz: null,
  voiceComfortHighHz: null,
  surfaceOverrides: {},
  remindersEnabled: true,
  wearElapsedEnabled: true,
  exportFailureNoticeEnabled: true,
  heldExportFailureNotice: false,
  lastExportFailureNotifiedAt: null,
  quietHoursEnabled: false,
  quietHoursStart: '22:00',
  quietHoursEnd: '07:00',
  preferredLabUnits: {},
  spanRailHintDismissed: false,
  hrtStartEpochDay: null,
  journeyAnchorMilestoneId: null,
  cycleTrackingChoice: null,
  autoExportEnabled: false,
  autoExportSchedule: 'weekly',
  lastBackupAt: null,
  backupNoticeDismissed: false,
  storageNoticeDismissed: false,
  lastVerifiedAt: null,
  roadmapMilestoneSyncEnabled: true,
  roadmapPolishStepsChoice: null,
  roadmapSocialStepsShown: true,
  areaFinishOfferDeclined: [],
  comingBackSeenSince: null,
  clinicianSummaryDrugExcluded: {},
  adherenceRegimenPick: null,
  pinnedRows: null,
  onboardingAreas: null,
  acknowledgements: { snoozes: {}, readLetterIds: [], greetedLetterIds: [], hasEntries: null },
  layoutReserves: {}
};

/** What a disguised journal wears before it unlocks, in the boot mirror and on every gate:
    palettes.css's neutral `notes`, not a flag. Never a value of `palette` itself. */
export const DISGUISED_PALETTE = 'notes';

/** Describes the journal, so it travels in an archive (ADR-0003). */
export const PORTABLE_KEYS = [
  'name',
  'activeScales',
  'metricKind',
  'metricDimension',
  'palette',
  'launcherIconShape',
  'moodPreset',
  'theme',
  'language',
  'checkInEnabled',
  'checkInTime',
  'checkInPausedThrough',
  'preferredLabUnits',
  'journeyAnchorMilestoneId',
  'hrtStartEpochDay',
  'cycleTrackingChoice',
  'voiceComfortLowHz',
  'voiceComfortHighHz',
  'surfaceOverrides',
  'areaFinishOfferDeclined',
  'roadmapPolishStepsChoice',
  'roadmapSocialStepsShown',
  /* Both 's remaining front-page preferences travel, on `areaFinishOfferDeclined`'s own
     argument next door: each is something the person said about their own journal rather
     than something this installation happens to be showing, and a restore that handed
     somebody a front page they never arranged would be the app forgetting an answer they
     gave. `adherenceRegimenPick` is the other side of that line - a choice about what one
     screen shows right now - and stays device-local for it. */
  'pinnedRows',
  'onboardingAreas',
  'acknowledgements'
] as const satisfies readonly PreferenceKey[];

/** Describes this installation, so it never leaves it (ADR-0003). */
/* DEVICE_LOCAL_KEYS stays exported for its own test, and cross-checked in pack.test.ts,
   roadmap-milestone-sync.test.ts. */
export const DEVICE_LOCAL_KEYS = [
  'onboarded',
  'a11yTextSizeBoost',
  'a11yLegibilityBoost',
  'a11yMotionReduce',
  'lockAfter',
  'disguise',
  'allowScreenCapture',
  'hideNotificationTitles',
  'guidedPromptsEnabled',
  'wearDurationCueEnabled',
  'safeSpaceNudgeDismissedEntryId',
  'voiceBenchmarkPassage',
  'remindersEnabled',
  'wearElapsedEnabled',
  'exportFailureNoticeEnabled',
  'heldExportFailureNotice',
  'lastExportFailureNotifiedAt',
  'quietHoursEnabled',
  'quietHoursStart',
  'quietHoursEnd',
  'autoExportEnabled',
  'autoExportSchedule',
  'lastBackupAt',
  'backupNoticeDismissed',
  'storageNoticeDismissed',
  'lastVerifiedAt',
  'roadmapMilestoneSyncEnabled',
  'spanRailHintDismissed',
  'comingBackSeenSince',
  'clinicianSummaryDrugExcluded',
  'adherenceRegimenPick',
  'layoutReserves'
] as const satisfies readonly PreferenceKey[];

/** Mirrored outside SQLite because it is needed before the database opens. `language` has
    no pre-paint reader of its own: paraglide resolves the locale from its own localStorage
    strategy (vite.config.ts) before any of this runs, and setLocale() reloads the page.
    This is the app's own record of the choice, which is what makes it portable in an
    archive - paraglide's copy is not. After durable preference attachment, boot reconciles
    that strategy with SQLite so an interrupted Replace cannot leave a restored choice
    beside the previous locale. */
export const BOOT_KEYS = [
  'theme',
  'palette',
  'moodPreset',
  'language',
  'a11yTextSizeBoost',
  'a11yLegibilityBoost',
  'a11yMotionReduce',
  'lockAfter',
  'disguise'
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

/** The metric in the form the entry repositories still take it: 'mood', or a gender
    dimension's key. The preference is a kind plus a key so that "mood" is a case rather
    than a reserved dimension name, and this is the one place the two forms meet - owns
    those signatures. */
export function metricKey(values: Pick<PreferenceValues, 'metricKind' | 'metricDimension'>): string {
  return values.metricKind === 'dimension' && values.metricDimension ? values.metricDimension : 'mood';
}
