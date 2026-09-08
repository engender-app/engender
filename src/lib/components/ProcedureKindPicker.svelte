<script lang="ts">
  /* The procedure kind picker (phase 9 carpet ticket 17): one flat list,
     the compiled-in set in CONTEXT.md's order with `custom` last as the
     escape hatch, the same shape DocumentTargetPicker gives a single-select
     list living in a sheet. No sections and no icons per kind - the kind
     gates Dilation and nothing else (Out of scope), so it earns a list of
     names and a checkmark, not fifteen glyphs invented to look busy. */
  import { m } from '$lib/paraglide/messages';
  import { PROCEDURE_KINDS, procedureKindName } from '$lib/data/vocabulary/labels';
  import type { ProcedureKind } from '$lib/data/types';
  import Sheet from './Sheet.svelte';
  import ListCard from './kit/ListCard.svelte';
  import ListRow from './kit/ListRow.svelte';

  let {
    open,
    current,
    onPick,
    onClose
  }: {
    open: boolean;
    current: ProcedureKind;
    onPick: (kind: ProcedureKind) => void;
    onClose: () => void;
  } = $props();

  function pick(kind: ProcedureKind) {
    onPick(kind);
    onClose();
  }
</script>

<Sheet {open} title={m.surgery_kind_sheet()} {onClose}>
  <h3>{m.surgery_kind_sheet()}</h3>
  <ListCard>
    {#each PROCEDURE_KINDS as kind (kind)}
      <ListRow
        key={kind}
        data-procedure-kind-option={kind}
        checked={current === kind}
        chevron={false}
        title={procedureKindName(kind)}
        onclick={() => pick(kind)}
      />
    {/each}
  </ListCard>
</Sheet>
