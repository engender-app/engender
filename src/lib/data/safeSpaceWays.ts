/* The ways down from Safe space (phase 10 redesign ticket 47).

   `/doubt` opens on the breathing exercise and nothing else, because it is
   the screen a person reaches on their worst day and it was the second
   longest in the app - 5908px, with the calming tool at the top of a scroll
   that ran past two charts, a photo grid and every good entry the journal
   holds. Everything that scroll held is still here; it is one tap down
   instead, and this is the list of those taps in the order the ticket
   states.

   The order is the ticket's own: the saved good moments, the comfort items,
   the counterevidence check, the readings. The directory sits above them
   because that is where it already sat on the screen this replaces - a
   panel directly under the breath. Ticket 63 confirmed this placement and
   decided, against its own original scope, to leave the `resources` row on
   the More hub too (`hubRows.ts`, `support` group) rather than remove it -
   the directory is reachable from both.

   Two of the five stopped being screens of their own in phase 11 ticket 15,
   and the ways survive the screens. "Letters and photos" was showing the
   same unlocked letters `/transition/letters` shows in its Open section,
   one door apart, so it points at that section directly; the readings were
   a Look back page sitting on this door, so they point at Look back. Both
   old addresses redirect, but a way down is a row somebody taps rather than
   a bookmark, and a row that lands on a redirect is a row that costs a hop
   on the screen least able to afford one. The rows keep their own words -
   `moments` still says "Letters and photos", and `readings` is worded as
   Look back words it rather than as the deleted screen did.

   Held here rather than written into the screen for the reason `hubRows.ts`
   holds the hub's own: an order somebody argued for is a fact about the
   product, and a test can hold a list where it cannot hold markup. Words
   are not here (ADR-0016: the node tier does not import paraglide), so a
   way carries its key and the screen says it.

   Node-tier safe: no clock, no driver, no paraglide, no runes. */

export type SafeSpaceWayKey = 'resources' | 'moments' | 'comfort' | 'evidence' | 'readings';

export type SafeSpaceWay = {
  key: SafeSpaceWayKey;
  /** A name from $lib/components/icons.ts. */
  icon: string;
  href: string;
};

export const SAFE_SPACE_WAYS: readonly SafeSpaceWay[] = [
  { key: 'resources', icon: 'info', href: '/support/resources' },
  { key: 'moments', icon: 'bookmark', href: '/transition/letters#opened' },
  { key: 'comfort', icon: 'heart', href: '/doubt/comfort' },
  { key: 'evidence', icon: 'sparkle', href: '/doubt/evidence' },
  { key: 'readings', icon: 'timeline', href: '/stats' }
];
