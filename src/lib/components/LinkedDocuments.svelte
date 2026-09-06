<script lang="ts">
  /* Documents pointing at one target (phase 8 features ticket 56, ADR-0065):
     the target's own screen lists them by reading, since the target itself
     stores nothing about the link. Shared across the four kinds - milestone,
     procedure, regimen episode, roadmap goal - rather than written four
     times, because the query and the row are identical in all four; only
     which (kind, id) is asked for differs.

     Renders nothing, not an empty heading, when there are none - the ticket's
     own "a target with none shows nothing" rule. */
  import { m } from '$lib/paraglide/messages';
  import { liveList } from '$lib/data/live/journal.svelte';
  import { fmtDay } from '$lib/data/dates';
  import type { DocumentTargetKind } from '$lib/data/types';
  import ListCard from './kit/ListCard.svelte';
  import ListRow from './kit/ListRow.svelte';
  import SectionHeading from './kit/SectionHeading.svelte';

  let { kind, id }: { kind: DocumentTargetKind; id: string } = $props();

  let query = liveList((j) => j.documents.getDocumentsLinkedTo(kind, id));
  let documents = $derived(query.rows);

  const dayLabel = (epochDay: number) => fmtDay(epochDay, { day: 'numeric', month: 'long', year: 'numeric' });
</script>

{#if documents.length > 0}
  <SectionHeading text={m.document_linked_here_title()} />
  <ListCard>
    {#each documents as document (document.id)}
      <ListRow
        key={document.id}
        icon="documents"
        title={document.title}
        subtitle={dayLabel(document.epochDay)}
        href={`/media/documents/${document.id}`}
      />
    {/each}
  </ListCard>
{/if}
