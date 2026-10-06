import type { Journal } from '$lib/data/journal/journal';
import { attachJournal, journalIsOpen } from '$lib/data/live/journal.svelte';
import { hydrateReference } from '$lib/data/live/reference.svelte';

/** Attaches an already-open journal without creating, resetting or closing it. */
export async function prepareScreenJournal(raw: Journal): Promise<void> {
  const journal = attachJournal(raw);
  await hydrateReference(journal);
  journalIsOpen();
}
