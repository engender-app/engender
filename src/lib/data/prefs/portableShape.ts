/* The shape check Archive Replace runs on its portable preferences before
   committing them with the restored rows (ADR-0003).
   Pure and rune-free on purpose: store.svelte.ts is a `.svelte.ts` file,
   which cannot be node-tested directly (its `$state` is a compiler macro
   with no runtime outside Svelte), so the logic that decides what a value
   from a backup file is allowed to be lives here, tested against fake input
   rather than through the reactive store. */

import type { PortablePreferences } from '../archive/payload';
import { sanitizePreferredLabUnits, type PreferredLabUnits } from '../labs/units';
import { sanitizeAcknowledgements } from '../acknowledgements';
import { PORTABLE_KEYS } from './catalogue';

export type PortableKey = (typeof PORTABLE_KEYS)[number];

const TIME_SHAPE = /^([01]\d|2[0-3]):[0-5]\d$/;

/* Free-form identifiers with no list to check membership against -
   palettes.css is the one place the flags are written down
   (theme/roles.ts argues against a second copy), and moodPreset's four
   presets are the same kind of thing. A slug shape is enough to keep a
   script tag or a path out of a value that ends up in a favicon href
   (app.html) and a CSS attribute selector, without adding the table
   roles.ts deliberately avoids. */
const SLUG_SHAPE = /^[a-z][a-z0-9-]*$/;

const isStringArray = (value: unknown): boolean =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

/** One check per portable key. A Record rather than a switch, so a key
    PORTABLE_KEYS gains later and this object does not is a typecheck
    failure rather than a silent pass-through. */
const PORTABLE_SHAPE: Record<PortableKey, (value: unknown) => boolean> = {
  name: (v) => typeof v === 'string',
  activeScales: isStringArray,
  metricKind: (v) => v === 'mood' || v === 'dimension',
  metricDimension: (v) => v === null || typeof v === 'string',
  palette: (v) => typeof v === 'string' && SLUG_SHAPE.test(v),
  launcherIconShape: (v) => v === 'current' || v === 'round',
  moodPreset: (v) => typeof v === 'string' && SLUG_SHAPE.test(v),
  theme: (v) => v === 'system' || v === 'light' || v === 'dark',
  language: (v) => v === 'system' || v === 'en' || v === 'pl',
  checkInEnabled: (v) => typeof v === 'boolean',
  checkInTime: (v) => typeof v === 'string' && TIME_SHAPE.test(v),
  checkInPausedThrough: (v) => v === null || Number.isInteger(v),
  preferredLabUnits: (v) => typeof v === 'object' && v !== null && !Array.isArray(v),
  journeyAnchorMilestoneId: (v) => v === null || typeof v === 'string',
  hairAnchorEpochDay: (v) => v === null || Number.isFinite(v),
  hrtStartEpochDay: (v) => v === null || Number.isFinite(v),
  cycleTrackingChoice: (v) => v === null || typeof v === 'boolean',
  voiceComfortLowHz: (v) => v === null || Number.isFinite(v),
  voiceComfortHighHz: (v) => v === null || Number.isFinite(v),
  surfaceOverrides: (v) =>
    typeof v === 'object' && v !== null && !Array.isArray(v) && Object.values(v).every((on) => typeof on === 'boolean'),
  areaFinishOfferDeclined: isStringArray,
  roadmapPolishStepsChoice: (v) => v === null || typeof v === 'boolean',
  roadmapSocialStepsShown: (v) => typeof v === 'boolean',
  pinnedRows: (v) => v === null || isStringArray(v),
  onboardingAreas: (v) => v === null || isStringArray(v),
  acknowledgements: (v) => typeof v === 'object' && v !== null && !Array.isArray(v)
};

/** The value to write for a portable key, or undefined when the archive's
    value is outside what the key can hold - the same reasoning boot-cache.ts
    gives for a damaged mirror: a backup is a file on disk, editable by
    hand or corrupted in transit, and undefined here is the caller's signal
    to keep this device's own value rather than adopting a string that was
    never a valid theme, palette or check-in time.

    preferredLabUnits additionally runs its own allowlist (ADR-0026):
    PORTABLE_SHAPE only confirms it is an object, so a valid shape still goes
    through sanitizePreferredLabUnits to drop a unit this app doesn't know.
    acknowledgements is the same: an object is only the outer shape, and its
    ids and deadlines are sanitised field by field. */
export function portableValueForKey<K extends PortableKey>(
  key: K,
  value: unknown
): PortablePreferences[K] | undefined {
  if (!PORTABLE_SHAPE[key](value)) return undefined;
  if (key === 'preferredLabUnits') return sanitizePreferredLabUnits(value as PreferredLabUnits) as never;
  if (key === 'acknowledgements') return sanitizeAcknowledgements(value) as never;
  return value as PortablePreferences[K];
}

/** What Archive Replace writes for a restored
    archive: every valid portable key, plus a cycle choice for older
    archives. Other missing or invalid keys leave this device's value alone.

    Pulled out as its own function so the "importing an archive keeps the
    device's value" behaviour has something to test against a whole
    archive payload, not only one key's validator in isolation -
    store.svelte.ts's `$state` cannot be node-tested directly, but this can. */
export function portablePreferencePatch(portable: Partial<PortablePreferences> | null | undefined): Partial<PortablePreferences> {
  portable ??= {};
  const patch: Partial<PortablePreferences> = {};
  for (const key of PORTABLE_KEYS) {
    const value = portableValueForKey(key, portable?.[key]);
    if (value !== undefined) patch[key] = value as never;
  }
  /* Archives written before cycle choices keep the automatic rule even when
     replacing a journal whose choice was explicit, except that the legacy
     opt-in they may carry (`cycleTrackingEnabled`, no longer a preference)
     read as a yes in that rule, so it is kept as one. */
  if (!Object.prototype.hasOwnProperty.call(portable, 'cycleTrackingChoice')) {
    const legacyOptIn = (portable as { cycleTrackingEnabled?: unknown }).cycleTrackingEnabled;
    patch.cycleTrackingChoice = legacyOptIn === true ? true : null;
  }
  return patch;
}
