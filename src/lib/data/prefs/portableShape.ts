/* The shape check applyPortablePreferences (store.svelte.ts) runs on a
   restored archive's values before they replace this device's (ADR-0003).
   Pure and rune-free on purpose: store.svelte.ts is a `.svelte.ts` file,
   which cannot be node-tested directly (its `$state` is a compiler macro
   with no runtime outside Svelte), so the logic that decides what a value
   from a .ttbackup is allowed to be lives here, tested against fake input
   rather than through the reactive store. */

import type { PortablePreferences } from '../archive/payload';
import { sanitizePreferredLabUnits, type PreferredLabUnits } from '../labs/units';
import { PORTABLE_KEYS } from './catalogue';

export type PortableKey = (typeof PORTABLE_KEYS)[number];

const TIME_SHAPE = /^([01]\d|2[0-3]):[0-5]\d$/;

/* Free-form identifiers with no list to check membership against -
   palettes.css is the one place the 8 flags are written down
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
  moodPreset: (v) => typeof v === 'string' && SLUG_SHAPE.test(v),
  theme: (v) => v === 'system' || v === 'light' || v === 'dark',
  language: (v) => v === 'system' || v === 'en' || v === 'pl',
  checkInEnabled: (v) => typeof v === 'boolean',
  checkInTime: (v) => typeof v === 'string' && TIME_SHAPE.test(v),
  checkInAffirmationsEnabled: (v) => typeof v === 'boolean',
  preferredLabUnits: (v) => typeof v === 'object' && v !== null && !Array.isArray(v),
  measurementUnit: (v) => v === 'cm' || v === 'in',
  journeyAnchorMilestoneId: (v) => v === null || typeof v === 'string',
  hairAnchorEpochDay: (v) => v === null || Number.isFinite(v),
  cycleTrackingEnabled: (v) => typeof v === 'boolean',
  voiceComfortLowHz: (v) => v === null || Number.isFinite(v),
  voiceComfortHighHz: (v) => v === null || Number.isFinite(v),
  areaFinishOfferDeclined: isStringArray,
  pinnedRows: (v) => v === null || isStringArray(v),
  agendaKinds: (v) => v === null || isStringArray(v),
  onboardingAreas: (v) => v === null || isStringArray(v)
};

/** The value to write for a portable key, or undefined when the archive's
    value is outside what the key can hold - the same reasoning boot-cache.ts
    gives for a damaged mirror: a .ttbackup is a file on disk, editable by
    hand or corrupted in transit, and undefined here is the caller's signal
    to keep this device's own value rather than adopting a string that was
    never a valid theme, palette or check-in time.

    preferredLabUnits additionally runs its own allowlist (ADR-0026):
    PORTABLE_SHAPE only confirms it is an object, so a valid shape still goes
    through sanitizePreferredLabUnits to drop a unit this app doesn't know. */
export function portableValueForKey<K extends PortableKey>(
  key: K,
  value: unknown
): PortablePreferences[K] | undefined {
  if (!PORTABLE_SHAPE[key](value)) return undefined;
  if (key === 'preferredLabUnits') return sanitizePreferredLabUnits(value as PreferredLabUnits) as never;
  return value as PortablePreferences[K];
}

/** What applyPortablePreferences (store.svelte.ts) writes for a restored
    archive: every portable key whose value passed portableValueForKey,
    paired with that value. A key the patch omits - because the archive
    didn't carry it, or its value was outside the key's shape - is a key
    applyPortablePreferences leaves untouched, which is how this device's
    own value survives an archive naming an invented theme, an out-of-shape
    palette or a nonsense check-in time.

    Pulled out as its own function so the "importing an archive keeps the
    device's value" behaviour has something to test against a whole
    archive payload, not only one key's validator in isolation -
    store.svelte.ts's `$state` cannot be node-tested directly, but this can. */
export function portablePreferencePatch(portable: Partial<PortablePreferences>): Partial<PortablePreferences> {
  const patch: Partial<PortablePreferences> = {};
  for (const key of PORTABLE_KEYS) {
    const value = portableValueForKey(key, portable?.[key]);
    if (value !== undefined) patch[key] = value as never;
  }
  return patch;
}
