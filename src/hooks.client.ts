import { arriveWithoutJournalText } from '$lib/navigation/journalTextParams';
import { hashRowId } from '$lib/navigation/scroll-region';

/* Runs once, before the router reads the address: an old link or bookmark
   naming a medication or a search (journalTextParams.ts) is rewritten in
   place, so the first history entry the app owns never holds it and the
   lock screen that follows a cold start shows a clean address. A fragment
   that is not a valid escape (`#%`, GD-039) names no row and goes too,
   since the router's own scroll to it throws on the same decode.
   Plain history.replaceState rather than replaceRoute: the router has not
   started yet, so there is no navigation to go through. */
export const init = () => {
  const url = arriveWithoutJournalText(new URL(location.href), { cold: true }) ?? new URL(location.href);
  const malformedHash = url.hash.length > 1 && hashRowId(url.hash) === null;
  if (malformedHash) url.hash = '';
  if (url.href !== location.href) history.replaceState(history.state, '', url.href);
};
