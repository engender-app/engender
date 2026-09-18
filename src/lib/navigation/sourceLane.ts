/* Which Care lane a spine mark was tapped from, for the return trip.

   Care writes when a mark leaves, and reads once on its next mount - the
   same tab-lifetime memory scroll-region.ts keeps its scroll positions in,
   which is what lets going back land on the same screen state without
   carrying it through the URL or rewriting a history entry underneath
   SvelteKit's router. The doses and labs screens' own `lane` query params
   stay as they are: they serve arrivals that come in through a fresh
   navigation, and this serves the immediate history-back. */

let lane: string | null = null;

export function rememberSourceLane(drug: string): void {
  lane = drug;
}

export function takeSourceLane(): string | null {
  const taken = lane;
  lane = null;
  return taken;
}
