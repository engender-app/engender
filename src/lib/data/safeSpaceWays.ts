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
   panel directly under the breath - and ticket 63, which binds the
   directory to Safe space properly, is where its placement is actually
   decided.

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
  { key: 'resources', icon: 'info', href: '/practice/resources' },
  { key: 'moments', icon: 'bookmark', href: '/doubt/moments' },
  { key: 'comfort', icon: 'heart', href: '/doubt/comfort' },
  { key: 'evidence', icon: 'sparkle', href: '/doubt/evidence' },
  { key: 'readings', icon: 'timeline', href: '/doubt/readings' }
];
