/** Stored vocabularies shared by Archive validation and ordinary writes. */
export const REMINDER_TYPES = ['med', 'injection', 'appointment', 'other'] as const;
export const REMINDER_RECURRENCES = ['DAILY', 'WEEKLY', 'EVERY_N_DAYS'] as const;
export const AFFIRMATION_LANGUAGES = ['en', 'pl'] as const;
export const EFFECT_DIRECTIONS_STORED = ['feminizing', 'masculinizing'] as const;
export const DOCUMENT_TARGET_KINDS = ['goal', 'milestone', 'procedure', 'episode'] as const;
export const HAIR_REMOVAL_METHODS = ['laser', 'electrolysis', 'other'] as const;
export const TALLY_KINDS = ['misgendered', 'correctly_gendered'] as const;
export const CYCLE_EVENT_KINDS = ['period_occurred', 'spotting', 'nothing_this_month'] as const;
export const TRYOUT_KINDS = ['name', 'pronouns', 'style', 'garment', 'makeup', 'presentation_step'] as const;
export const DOSE_RECURRENCE_KINDS = ['everyNDays', 'weekdays'] as const;
