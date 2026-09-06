<script lang="ts">
  /* One picker for a document's link (phase 8 features ticket 56, ADR-0065):
     all four kinds together, each in its own labelled section, so choosing a
     target is one sheet rather than a kind-picker feeding a second sheet.
     Clearing is the same sheet, not a separate control - a "remove the link"
     row at the top when one is already set.

     The four sections come from documentTargets.svelte.ts, which the
     document's own screen also reads, and are drawn by one loop: the row is
     identical in all four, and a section that differs only in which list it
     walks is not four blocks' worth of markup. */
  import { m } from '$lib/paraglide/messages';
  import { DOCUMENT_TARGET_ICON } from '$lib/data/vocabulary/documentTargetLabels';
  import type { DocumentTarget } from '$lib/data/types';
  import { documentTargets } from './documentTargets.svelte';
  import Sheet from './Sheet.svelte';
  import Notice from './kit/Notice.svelte';
  import ListCard from './kit/ListCard.svelte';
  import ListRow from './kit/ListRow.svelte';
  import SectionHeading from './kit/SectionHeading.svelte';

  let {
    open,
    current,
    onPick,
    onClose
  }: {
    open: boolean;
    current: DocumentTarget | null;
    onPick: (target: DocumentTarget | null) => void;
    onClose: () => void;
  } = $props();

  const targets = documentTargets();
  let sections = $derived(targets.sections(current));

  /* Every row carries a box rather than a chevron: it picks, it does not go
     anywhere, and the one that is already the link has to say so. */
  const isCurrent = (kind: DocumentTarget['kind'], id: string) => current?.kind === kind && current.id === id;

  function pick(target: DocumentTarget) {
    onPick(target);
    onClose();
  }
</script>

<Sheet {open} title={m.document_link_sheet()} {onClose}>
  <h3>{m.document_link_sheet()}</h3>

  {#if current}
    <ListCard>
      <ListRow
        key="clear"
        data-clear-target
        chevron={false}
        icon="x"
        title={m.document_link_clear()}
        onclick={() => {
          onPick(null);
          onClose();
        }}
      />
    </ListCard>
  {/if}

  {#if sections.length === 0}
    <Notice icon="documents" title={m.document_link_empty_title()} text={m.document_link_empty_body()} />
  {/if}

  {#each sections as section (section.kind)}
    <SectionHeading text={section.heading} />
    <ListCard>
      {#each section.rows as row (row.id)}
        <ListRow
          key={row.id}
          data-pick-target={`${section.kind}:${row.id}`}
          checked={isCurrent(section.kind, row.id)}
          chevron={false}
          icon={DOCUMENT_TARGET_ICON[section.kind]}
          title={row.title}
          subtitle={row.subtitle}
          onclick={() => pick({ kind: section.kind, id: row.id })}
        />
      {/each}
    </ListCard>
  {/each}
</Sheet>
