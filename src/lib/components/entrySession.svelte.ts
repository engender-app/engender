import { untrack } from 'svelte';
import { leaveGuard } from './kit/leaveGuard.svelte';
import { entrySessionCore, initialEntrySession, type EntrySessionOptions } from './entrySession';

export function entrySession(options: EntrySessionOptions) {
  const state = $state(initialEntrySession(options));
  const session = entrySessionCore(options, state);
  const guard = leaveGuard(session.guardOptions);
  $effect(() => session.mirror());
  $effect(() => {
    if (state.baseline !== null || session.preparing) return;
    untrack(session.establishBaseline);
  });
  return {
    ...session, guard,
    get draft() { return state.draft; },
    get saving() { return state.saving; },
    get preparing() { return session.preparing; },
    get starred() { return state.starred; },
    set starred(value: boolean) { state.starred = value; },
    get savedDestination() { return state.destination; },
    get navigationFailed() { return state.navigationFailed; }
  };
}
