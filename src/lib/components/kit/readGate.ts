/* Which of a gated read's four faces is on screen (phase 5 audit ticket 04).

   Rune-free so it can be node-tested; ReadGate.svelte is the rendering of it
   and holds nothing else, the split recordEditor.ts already makes here. */

import type { LiveList } from '$lib/data/live/journal.svelte';

export type GateBranch = 'loading' | 'rows' | 'empty' | 'failed';

/** The branch to render.

    Order matters twice over. A read still in flight shows the placeholder
    whatever else is true of it, so a failure the previous run left behind
    cannot flash while the next one is out. And rows beat both of the other
    two, because a re-run that rejects leaves the last answer standing and a
    list on screen is worth more than a notice about the read behind it.

    `saysFailed` is whether the screen passed a failed snippet. Without one, a
    failed read renders as the empty state, which is what every screen did
    before the state had a name. */
export function gateBranch(
  read: Pick<LiveList<unknown>, 'loading' | 'empty' | 'failed'>,
  saysFailed: boolean
): GateBranch {
  if (read.loading) return 'loading';
  if (!read.empty) return 'rows';
  if (read.failed && saysFailed) return 'failed';
  return 'empty';
}
