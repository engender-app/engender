/* Which Care lane a spine mark was tapped from, for the return trip.

   Care writes when a mark leaves, and reads once on its next mount - the
   same tab-lifetime memory scroll-region.ts keeps its scroll positions in,
   which is what lets going back land on the same screen state without
   carrying it through the URL or rewriting a history entry underneath
   SvelteKit's router. The doses and labs screens carry an episode UUID for
   fresh arrivals; this remembers that same identity for history-back.
   Free-text drug names never travel through either address. */

let lane: string | null = null;

export function rememberSourceLane(episodeId: string): void {
  lane = episodeId;
}

export function takeSourceLane(): string | null {
  const taken = lane;
  lane = null;
  return taken;
}
