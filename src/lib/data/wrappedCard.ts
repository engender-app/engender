/* The wrapped card (ticket 16): what tickets 17 and 18 share instead of each
   building their own version of the same visual object - a card composed of
   whatever stat tiles and palette art a person picked, and nothing else.

   The shape below is deliberately narrower than "arbitrary card content".
   There is no field for entry text or a photo, so a caller cannot hand the
   renderer one even by mistake - the only way journal text or a photo would
   ever reach a wrapped card is a future ticket widening this type on
   purpose, which is exactly the acceptance criterion this file exists to
   hold. */

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
