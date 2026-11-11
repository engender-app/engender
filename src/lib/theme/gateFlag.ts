/* What an unlock's field draws instead of the app's name (tester-report-02
   ticket 07).

   A tester, on the screen a person meets every time the journal is locked:
   "there should be nothing written in the background there, only, for
   example, the flag". Alicja picked the corner sun from four drawings on the
   sign-off page, and asked for the field to be a little taller (2026-11-11).

   So an unlock's field holds Today's own sun - FlagSun, at Today's size and
   in Today's corner - with nothing written on it, and the field is taller by
   `GATE_ROOM` so more of the sun shows. Opening the app holds that sun still
   while the field opens to Today's height around it (appOpening.ts): it is
   the same drawing in the same place on both sides, so the eye has one
   object to follow.

   The rule that matters most is pure, so it is held without a browser: under
   disguise, or on a gate that is not an unlock, nothing is drawn, and no
   colour of the flag reaches the screen. */

/** Whether a gate draws the sun at all. Only an unlock does, and never under
    disguise: a disguised gate shows nothing that names the app or the person
    (ADR-0101), and a flag names the person from across a room. */
export function gateDrawsFlag({ unlock, disguised }: { unlock: boolean; disguised: boolean }): boolean {
  return unlock && !disguised;
}

/** How much taller than the title's line an unlock's field is, in px at
    the normal height (half of it on a short window, screens.css). The two
    neighbours are offered on the sign-off page until Alicja confirms. */
export const GATE_ROOMS = [0, 32, 64] as const;
export type GateRoom = (typeof GATE_ROOMS)[number];
export const GATE_ROOM: GateRoom = 32;

/** The room this build uses. A demo build reads `?gateRoom=` once, so the
    sign-off page can show the neighbours live; a production build folds the
    branch away and always answers GATE_ROOM. */
export function gateRoomChoice(
  search: string = typeof location === 'undefined' ? '' : location.search
): GateRoom {
  if (typeof __DEMO__ === 'undefined' || !__DEMO__) return GATE_ROOM;
  const raw = new URLSearchParams(search).get('gateRoom');
  const asked = raw === null || raw === '' ? NaN : Number(raw);
  return GATE_ROOMS.includes(asked as GateRoom) ? (asked as GateRoom) : GATE_ROOM;
}
