/* Content for the optional journal book opening card. */

/** One already-formatted stat tile: a count, an average, or anything else a
    call site chooses to show as a number. Formatting is the caller's job -
    a locale-formatted number or a paraglide plural reads differently per
    element, and this module stays free of both so it can be used from
    either tier. */
export interface WrappedCardStat {
  label: string;
  value: string;
}

/** Everything a wrapped card can show, already chosen. A stat only appears
    if it's in `stats`, and the palette art only appears if `paletteArt` is
    true - nothing here defaults to on. */
export interface WrappedCardContent {
  stats: WrappedCardStat[];
  paletteArt: boolean;
}
