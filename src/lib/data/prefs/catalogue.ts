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
  activePreset: string;
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
  appLock: boolean;
  /** Argon2id-derived, from ticket 17. Null until a PIN is set. */
  pinHash: string | null;
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
  /** Optional entry nudges that suggest adding detail after a mood-only save. */
  entryNudges: boolean;
  /** Optional per-analyte default units for labs entry/review. */
  preferredLabUnits: Partial<Record<'estradiol' | 'testosterone' | 'prolactin', string>>;
  /** Which measurement types have had their capture-protocol guidance
      dismissed (ticket 08). Guidance is opt-in, never required to save a
      measurement, so this only ever hides a card - it blocks nothing. */
  measurementProtocolDismissed: Partial<Record<'waist' | 'hips' | 'chest' | 'underbust', boolean>>;
  autoExportEnabled: boolean;
  autoExportSchedule: 'weekly' | 'monthly';
  /** Epoch milliseconds, not an epoch day. */
  lastBackupAt: number | null;
  backupNoticeDismissed: boolean;
}

export type PreferenceKey = keyof PreferenceValues;

export const PREFERENCE_DEFAULTS: PreferenceValues = {
  onboarded: false,
  name: '',
  activePreset: 'p-btw',
  metricKind: 'mood',
  metricDimension: null,
  theme: 'system',
  palette: 'trans',
  moodPreset: 'amber',
  language: 'system',
  a11yTextSizeBoost: false,
  a11yLegibilityBoost: false,
  a11yMotionReduce: false,
  appLock: false,
  pinHash: null,
  bioOptIn: null,
  lockOnLeave: false,
  disguise: false,
  quickExit: false,
  hideNotificationTitles: false,
  checkInEnabled: false,
  checkInTime: '21:00',
  entryNudges: true,
  preferredLabUnits: {},
  measurementProtocolDismissed: {},
  autoExportEnabled: false,
  autoExportSchedule: 'weekly',
  lastBackupAt: null,
  backupNoticeDismissed: false
};

/** Describes the journal, so it travels in an archive (ADR-0003). */
export const PORTABLE_KEYS = [
  'name',
  'activePreset',
  'metricKind',
  'metricDimension',
  'palette',
  'moodPreset',
  'theme',
  'language',
  'checkInEnabled',
  'checkInTime',
  'preferredLabUnits'
] as const satisfies readonly PreferenceKey[];

/** Describes this installation, so it never leaves it (ADR-0003). */
export const DEVICE_LOCAL_KEYS = [
  'onboarded',
  'a11yTextSizeBoost',
  'a11yLegibilityBoost',
  'a11yMotionReduce',
  'appLock',
  'pinHash',
  'bioOptIn',
  'lockOnLeave',
  'disguise',
  'quickExit',
  'hideNotificationTitles',
  'entryNudges',
  'autoExportEnabled',
  'autoExportSchedule',
  'lastBackupAt',
  'backupNoticeDismissed',
  'measurementProtocolDismissed'
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
