/* The ways down from Safe space (phase 10 redesign ticket 47).

   `/doubt` opens on the breathing exercise and nothing else, because it is
   the screen a person reaches on their worst day and it was the second
   longest in the app - 5908px, with the calming tool at the top of a scroll
   that ran past two charts, a photo grid and every good entry the journal
   holds. What stays of that scroll is one tap down instead, and this is
   the list of those taps.

   The directory sits above good moments because that is where it already
   sat on the screen this replaces - a panel directly under the breath. Ticket 63 confirmed this placement and
   decided, against its own original scope, to leave the `resources` row on
   the More hub too (`hubRows.ts`, `support` group) rather than remove it -
   the directory is reachable from both.

   Functional audit ticket 09 took two of them away. The letters row
   pointed at `/transition/letters` and the readings row at Look back, and
   each one switched the lit tab mid-crisis: a person who opened Safe space
   on their worst day tapped a row and found themselves on another door.
   What stays is what Safe space itself holds - good moments here, the
   comfort list as the button above the breath - and the resources, which
   were always a shared directory.

   Held here rather than written into the screen for the reason `hubRows.ts`
   holds the hub's own: an order somebody argued for is a fact about the
   product, and a test can hold a list where it cannot hold markup. Words
   are not here (ADR-0016: the node tier does not import paraglide), so a
   way carries its key and the screen says it.

   The comfort list left the run in phase 14 ticket 18 (release audit U11):
   it already had its own button above the breath, so a short screen
   reaches it without starting the exercise (UI/UX ticket 14), and the
   same words as a row further down said it twice. The button is the one
   that stays, since it is the one that holds the reachability.

   Node-tier safe: no clock, no driver, no paraglide, no runes. */

export type SafeSpaceWayKey = 'resources' | 'evidence';

export type SafeSpaceWay = {
  key: SafeSpaceWayKey;
  /** A name from $lib/components/icons.ts. */
  icon: string;
  href: string;
};

export const SAFE_SPACE_WAYS: readonly SafeSpaceWay[] = [
  { key: 'resources', icon: 'info', href: '/support/resources' },
  { key: 'evidence', icon: 'sparkle', href: '/doubt/evidence' }
];
