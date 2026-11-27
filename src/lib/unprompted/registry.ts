/* Register everything the app can show or send unprompted. Today edits live tiles, and
   Settings handles other surface switches and notifications. Each switch applies to the
   whole kind. A running session keeps its real-time surface.

   Only a scheduled time or a failure can prompt a notification. Reminders, check-in and
   wear-elapsed are scheduled. Export failure reports an error. Insights and offers wait
   inside the app.

   Quiet hours delay notifications until the window ends. Disguise hides titles for every
   notification kind, enforced by its type. */
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
  | 'wrapped'
  | 'on-this-day'
  | 'reminders'
  | 'check-in'
  | 'wear-elapsed'
  | 'export-failure';

/** Android channels used by remaining notification producers. */
type NotificationChannel = 'reminders' | 'checkIn' | 'exportFailure';

export interface UnpromptedRow {
  /** Stable handle for the walkthrough - never the title, which is copy. */
  key: UnpromptedKind;
  /** What the kind is. Shared by both views: a row on one screen and a row
      on the other are the same kind, and calling it two things would be the
      "two registries" this file exists not to be. */
  title: () => string;
  /**
   * Name the area whose hidden or finished state quiets this kind (ADR-0052).
   * Use null for kinds that concern the journal as a whole, such as export
   * failure or the retrospectives. The field is required so every new kind
   * makes that choice.
   *
   * unpromptedQuiet applies the area rule on top of each kind's own
   * preference. Hiding an area does not change its surfaceOverrides or
   * notification switch.
   */
  area: HideableArea | null;
  /** Present when this kind shows something in the app of its own, carrying a subtitle
      saying what it puts in front of you where the title does not already say it, and
      whether it shows until the person says otherwise (`defaultOn`). The switch is one
      entry in the `surfaceOverrides` preference, keyed by this row's key, and sits in
      Today's editor for a live tile and on `/settings/notifications` for everything else.
      Absent is "shows nothing in the app of its own": the four producers folded in all fire
      and none surfaces. */
  surface?: { subtitle?: () => string; defaultOn: boolean };
  /** Present when this kind may become a notification, and what firing
      means: the preference the notifications view's switch writes, the
      subtitle saying *when* it fires (only where the title leaves that
      open), which channel it fires on, and
      `disguised: true`, the literal type being the enforcement: every
      notification is covered by `hideNotificationTitles`, so a row cannot
      declare otherwise. Absent is "never
      fires"; no live tile carries this. Every row that carries one has to
      answer the admission rule above. A `notify` with no `channel` does not
      compile - see `UNPROMPTED_ROWS` below. */
  notify?: {
    subtitle?: () => string;
    prefKey: BooleanPrefKey;
    channel: NotificationChannel;
    disguised: true;
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
    surface: { defaultOn: true }
  },
  {
    key: 'dose-panel',
    // a dose is an event inside a regimen episode, and an episode carries its own end day.
    area: null,
    title: () => m.tile_dose_title(),
    surface: { subtitle: () => m.tile_dose_sub(), defaultOn: true }
  },
  {
    key: 'ready-letter',
    // a letter is sealed and then unlocked, which is its whole lifecycle.
    area: null,
    title: () => m.tile_letter_title(),
    surface: { defaultOn: true }
  },
  {
    key: 'surgery-countdown',
    // a procedure has its own date and its own recovery window.
    area: null,
    title: () => m.tile_surgery_title(),
    surface: { subtitle: () => m.tile_surgery_sub(), defaultOn: true }
  },
  {
    key: 'safe-space-nudge',
    // a crisis surface, and being done needing it is not a thing to record.
    area: null,
    title: () => m.tile_safe_space_title(),
    surface: { subtitle: () => m.tile_safe_space_sub(), defaultOn: true }
  },
  {
    key: 'stock-notice',
    // a running count of what is in the drawer, not a series to stop adding to.
    area: null,
    title: () => m.tile_stock_title(),
    surface: { defaultOn: true }
  },
  {
    key: 'wrapped',
    // the journal as a whole, and `entries` is not finishable.
    area: null,
    title: () => m.wrapped(),
    surface: { subtitle: () => m.wrapped_settings_sub(), defaultOn: true }
  },
  {
    key: 'on-this-day',
    // the journal as a whole, for the same reason.
    area: null,
    title: () => m.on_this_day(),
    surface: { subtitle: () => m.on_this_day_settings_sub(), defaultOn: true }
  },
  {
    key: 'reminders',
    // an intention for a future day, switched off one reminder at a time.
    area: null,
    title: () => m.reminders(),
    notify: {
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
type EveryKindRegistered = AssertNoneUnregistered<Unregistered>;

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

/** A kind that shows something in the app of its own, and so has a switch in
    `surfaceOverrides`. Read off `ROWS` rather than typed out again, like
    `UNPROMPTED_KINDS` below. */
export type SurfaceKind = Extract<(typeof ROWS)[number], { surface: unknown }>['key'];

/** Whether a surface is on, given the stored `surfaceOverrides`: the person's
    answer when they gave one, the registry's `defaultOn` otherwise. A
    pure function over the map so the node tier and a template read it the
    same way. */
export function surfaceOn(overrides: Readonly<Partial<Record<string, boolean>>>, kind: SurfaceKind): boolean {
  const stored = overrides[kind];
  if (typeof stored === 'boolean') return stored;
  return ROW_OF[kind].surface!.defaultOn;
}

/** The map after a person turns one surface on or off. Holds only answers
    that differ from the default, so setting a surface back to its default
    takes its entry away, and entries for other kinds (including ones this
    build does not know) are carried over untouched. A new object each time,
    which is what the preference store needs to see a write. */
export function withSurface(
  overrides: Readonly<Partial<Record<string, boolean>>>,
  kind: SurfaceKind,
  on: boolean
): Partial<Record<string, boolean>> {
  const next = { ...overrides };
  if (on === ROW_OF[kind].surface!.defaultOn) delete next[kind];
  else next[kind] = on;
  return next;
}

/** Whether a kind should stay silent because the area it talks about is
    hidden or finished (ADR-0052).

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
export type SurfaceRow = UnpromptedRow & { key: SurfaceKind; surface: NonNullable<UnpromptedRow['surface']> };

/** Narrows a row to one with a switch in `surfaceOverrides`, key included. */
export function isSurfaceRow(row: UnpromptedRow): row is SurfaceRow {
  return row.surface !== undefined;
}
type NotificationRow = UnpromptedRow & { notify: NonNullable<UnpromptedRow['notify']> };

/** The surfaces view's rows, in registry order. */
export const SURFACE_ROWS: readonly SurfaceRow[] = UNPROMPTED_ROWS.filter(isSurfaceRow);

/** The notifications view's rows, in registry order - every kind that may
    reach the phone rather than only the app. */
/* NOTIFICATION_ROWS stays exported only for its own test. */
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
/* UNPROMPTED_KINDS stays exported only for liveTiles.grid.test.ts, home-contracts.ts, which
   cross-check against it. */
export const UNPROMPTED_KINDS: readonly UnpromptedKind[] = ROWS.map((row) => row.key);

/** The runtime half of `EveryKindRegistered`: which kinds a given list of
    rows is missing, checked against the full `UNPROMPTED_KINDS` domain
    rather than against the list's own contents - so registry.test.ts can
    show the completeness rule actually failing on a named, shortened
    registry, not only assert that it never does. */
/* unregisteredKinds stays exported only for its own test. */
export function unregisteredKinds(rows: readonly Pick<UnpromptedRow, 'key'>[]): UnpromptedKind[] {
  const present = new Set(rows.map((row) => row.key));
  return UNPROMPTED_KINDS.filter((kind) => !present.has(kind));
}
