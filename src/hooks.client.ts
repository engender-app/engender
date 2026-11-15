import { arriveWithoutJournalText } from '$lib/navigation/journalTextParams';

/* Runs once, before the router reads the address: an old link or bookmark
   naming a medication or a search (journalTextParams.ts) is rewritten in
   place, so the first history entry the app owns never holds it and the
   lock screen that follows a cold start shows a clean address. */
export const init = () => {
  const clean = arriveWithoutJournalText(new URL(location.href));
  if (clean) history.replaceState(history.state, '', clean.href);
};
