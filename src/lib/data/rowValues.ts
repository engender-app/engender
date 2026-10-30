/** The stored vocabularies: the one module Archive validation, ordinary writes
    and the label lookups all read (FA 04). SQL holds structural invariants
    only, so a word outside one of these sets can be stored (an archive from a
    newer build, a row an older build wrote); the write path refuses it and
    the screen renders it as "other".

    Node-tier safe: no paraglide import (ADR-0016). */
export { HAIR_REMOVAL_AREAS } from './hairRemovalAreas';

export function isOneOf<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (values as readonly string[]).includes(value);
}

/** The write-path check: throws a message naming the set and the word, before
    anything is written. */
export function assertOneOf(values: readonly string[], what: string, value: unknown): void {
  if (!isOneOf(values, value)) throw new Error(`invalid ${what}: ${String(value)}`);
}

export const REMINDER_RECURRENCES = ['DAILY', 'EVERY_N_DAYS'] as const;
export const EFFECT_DIRECTIONS_STORED = ['feminizing', 'masculinizing'] as const;
/** Where an institution stands after a change (functional audit ticket 35). */
export const INSTITUTION_STATUSES = ['submitted', 'waiting', 'done'] as const;
export const DOCUMENT_TARGET_KINDS = ['goal', 'milestone', 'procedure', 'episode'] as const;
export const HAIR_REMOVAL_METHODS = ['laser', 'electrolysis', 'other'] as const;
export const TALLY_KINDS = ['misgendered', 'correctly_gendered'] as const;
export const CYCLE_EVENT_KINDS = ['period_occurred', 'spotting', 'nothing_this_month'] as const;
export const TRYOUT_KINDS = ['name', 'pronouns', 'style', 'makeup'] as const;
export const DROPPED_TRYOUT_KINDS = ['garment', 'presentation_step'] as const;
export const DOSE_RECURRENCE_KINDS = ['everyNDays', 'weekdays'] as const;
