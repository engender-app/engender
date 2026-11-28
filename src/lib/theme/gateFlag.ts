/* Draw Today's FlagSun on an unlock gate at the same size and corner.
   The field fits the sun without text. Hold the sun fixed while the
   field opens to Today's height. Under disguise or on a non-unlock
   gate, draw no flag or flag colors. */

/** Whether a gate draws the sun at all. Only an unlock does, and never under
    disguise: a disguised gate shows nothing that names the app or the person
    (ADR-0101), and a flag names the person from across a room. */
export function gateDrawsFlag({ unlock, disguised }: { unlock: boolean; disguised: boolean }): boolean {
  return unlock && !disguised;
}
