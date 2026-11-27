<script lang="ts">
  /* The procedure kind picker: one flat list, the compiled-in kinds in their declared
     order, with `custom` last as the escape hatch, the same shape DocumentTargetPicker
     gives a single-select list living in a sheet. No sections and no icons per kind - the
     kind gates Dilation and nothing else (Out of scope), so it earns a list of names and a
     checkmark, not fifteen glyphs invented to look busy.

     One of the list, so a radio group of rows with a bare check and not ListRow's
     `checked`, which draws a checkbox's square - "this looks like multiple choice and it's
     not". LockAfterChoice's shape: every row carries its check, only the chosen one shows
     it. A pick closes the sheet, so the arrow keys move focus and Space or Enter picks. */
  import { m } from '$lib/paraglide/messages';
  import { PROCEDURE_KINDS, procedureKindName } from '$lib/data/vocabulary/labels';
  import type { ProcedureKind } from '$lib/data/types';
  import Sheet from './Sheet.svelte';
  import ListCard from './kit/ListCard.svelte';
  import ListRow from './kit/ListRow.svelte';
  import Icon from './Icon.svelte';
  import { rovingRadio } from './rovingRadio';

  let {
    open,
    current,
    onPick,
    onClose
  }: {
    open: boolean;
    current: ProcedureKind | null;
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
  <div role="radiogroup" aria-label={m.surgery_kind_sheet()} tabindex="-1" use:rovingRadio={{ selectOnArrow: false }}>
    <ListCard>
      {#each PROCEDURE_KINDS as kind (kind)}
        <ListRow
          key={kind}
          data-procedure-kind-option={kind}
          role="radio"
          aria-checked={current === kind}
          chevron={false}
          title={procedureKindName(kind)}
          onclick={() => pick(kind)}
        >
          {#snippet trailing()}
            <span class="kind-mark" class:is-on={current === kind} aria-hidden="true">
              <Icon name="check" size={20} />
            </span>
          {/snippet}
        </ListRow>
      {/each}
    </ListCard>
  </div>
</Sheet>

<style>
  .kind-mark {
    display: inline-flex;
    opacity: 0;
    transition: opacity var(--dur-fast) var(--ease-out);
  }
  .kind-mark.is-on {
    opacity: 1;
  }
</style>
