/* The reactive half of detailDraft.ts - the read, the draft and the route
   parameter, with every branch delegated to the rune-free rules there.
   Same split recordEditor.svelte.ts makes from recordEditor.ts.

   The route parameter is read here rather than taken as an argument, and
   that is the whole point of the module: a screen that captured
   `page.params.id` into a const kept the first record's draft forever when
   SvelteKit reused the component across two ids, and the two screens on
   this module cannot write that line any more. */

import { page } from '$app/state';
import { liveQuery, type LiveList } from '$lib/data/live/journal.svelte';
import type { Journal } from '$lib/data/journal/journal';
import { draftFor, fillDecision, waitingOn } from './detailDraft.ts';

export type DetailDraftOptions<TRecord, TDraft> = {
  /** Find the record this id names. Not called for a new one. */
  read: (journal: Journal, id: string) => Promise<TRecord | undefined>;
  /** The draft for a record that does not exist yet. */
  blank: () => TDraft;
  /** The draft for one that does. */
  fromRecord: (record: TRecord) => TDraft;
};

export type DetailDraft<TRecord, TDraft> = {
  /** The id on the route, right now. */
  readonly id: string;
  /** Whether the route is on this screen's own `new`. */
  readonly isNew: boolean;
  /** The stored record for the id on the route, or undefined for a new one
      and until the read answers. Never another id's record. */
  readonly record: TRecord | undefined;
  /** The editable draft. Deeply reactive, so a field binds straight to it. */
  draft: TDraft;
  /** True until the read has answered for the id on the route. */
  readonly loading: boolean;
  /** True when that read rejected. */
  readonly failed: boolean;
  /** A list read that hangs off this record, held at loading until the
      record has arrived (detailDraft.ts). */
  waitingOnRecord: <T>(read: LiveList<T>) => LiveList<T>;
};

const NEW = 'new';

export function detailDraft<TRecord, TDraft extends object>(
  options: DetailDraftOptions<TRecord, TDraft>
): DetailDraft<TRecord, TDraft> {
  const routeId = () => page.params.id as string;

  /* The answer carries the id it was read for. Without it a route move from
     one id to the next would fill the new draft from the old record: the
     previous answer is still the query's `value` for the round trip the new
     one takes, and `loading` deliberately stays false across a re-run so
     that a list does not flash its skeleton on every write. */
  const query = liveQuery(async (journal) => {
    const id = routeId();
    return { id, record: id === NEW ? undefined : await options.read(journal, id) };
  });
  const answer = $derived(query.value?.id === routeId() ? query.value : undefined);

  let draft = $state<TDraft>(options.blank());
  let filledFor: string | null = null;

  $effect(() => {
    const id = routeId();
    if (fillDecision(filledFor, id, answer === undefined) !== 'fill') return;
    filledFor = id;
    draft = draftFor(answer!.record, options.blank, options.fromRecord);
  });

  return {
    get id() {
      return routeId();
    },
    get isNew() {
      return routeId() === NEW;
    },
    get record() {
      return answer?.record;
    },
    get draft() {
      return draft;
    },
    set draft(value: TDraft) {
      draft = value;
    },
    get loading() {
      return answer === undefined;
    },
    get failed() {
      return query.failed;
    },
    waitingOnRecord<T>(read: LiveList<T>): LiveList<T> {
      return waitingOn(answer === undefined, read);
    }
  };
}
