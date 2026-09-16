/* How much of the counterevidence pool Safe space reads (ADR-0037,
   CONTEXT: "counterevidence pool").

   One number, in one place, because more than one surface asks the same
   query for it and they have to agree: `/doubt/evidence` draws the entries,
   and the affirming-themes reading weighs their tags into its bars. A tile
   saying 20 over a list showing 25 is the drift this exists to prevent - it
   was one constant on one screen until redesign ticket 47 split that screen
   in two, and phase 11 tickets 15 and 07 moved the second half onto Look
   back.

   Node-tier safe: no clock, no driver, no paraglide, no runes. */

/** Entries the pool offers back, newest first. */
export const COUNTEREVIDENCE_LIMIT = 20;

/** How many of them the screen opens on (phase 11 ticket 15). Six, because
    the save control has to sit under them and still be inside a 390x844
    viewport: twenty cards ran the screen to 3990px and put the one thing a
    person came here to do at the bottom of it. The rest are a control away
    rather than a screen away, so this bounds the first render and nothing
    else - the pool itself is still read whole, and the snapshot still saves
    whole. */
export const COUNTEREVIDENCE_PREVIEW = 6;
