import type { LiveList } from '$lib/data/live/journal.svelte';

type GateBranch = 'loading' | 'rows' | 'empty' | 'failed' | 'stale';

/** Failure never implies an empty journal. */
export function gateBranch(
  read: Pick<LiveList<unknown>, 'loading' | 'empty' | 'failed' | 'stale'>
): GateBranch {
  if (read.loading) return 'loading';
  if (read.stale) return 'stale';
  if (read.failed) return 'failed';
  return read.empty ? 'empty' : 'rows';
}
