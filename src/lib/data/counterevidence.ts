/* How much of the counterevidence pool Safe space reads (ADR-0037,
   CONTEXT: "counterevidence pool").

   One number, in one place, because two screens ask the same query for it
   and they have to agree: `/doubt/evidence` draws the entries, and
   `/doubt/readings` counts them into a tile and weighs their tags into the
   affirming-themes bars. The tile saying 20 over a list showing 25 is the
   drift this exists to prevent - it was one constant on one screen until
   redesign ticket 47 split that screen in two.

   Node-tier safe: no clock, no driver, no paraglide, no runes. */

/** Entries the pool offers back, newest first. */
export const COUNTEREVIDENCE_LIMIT = 20;
