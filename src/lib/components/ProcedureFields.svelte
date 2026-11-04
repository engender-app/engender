<script lang="ts">
  /* A procedure's own facts as fields: its name, its type, its date, what
     it cost, and the two switches. Shared by the new-procedure sheet on the
     index and the procedure's own screen (prh12 bug 20), so the type is
     asked for the same way in both and the two cannot drift.

     The type sits right under the name and is drawn as a choice to make
     (prh12 bug 18): the whole row opens the list, it says "Choose a type"
     until one is picked, and the screen holding these fields keeps Save
     disabled until then. It used to be a static row reading "Custom" with
     a small pencil, which looked like an answer already given. */
  import { journalTextAutocomplete } from '$lib/platform';
  import { m } from '$lib/paraglide/messages';
  import { procedureKindName } from '$lib/data/vocabulary/labels';
  import type { ProcedureKind } from '$lib/data/types';
  import { disclose } from '$lib/motion/reveal';
  import type { CostDraft } from './costDraft';
  import CostField from './CostField.svelte';
  import DatePicker from './DatePicker.svelte';
  import Icon from './Icon.svelte';
  import ProcedureKindPicker from './ProcedureKindPicker.svelte';
  import Switch from './Switch.svelte';
  import Field from './kit/Field.svelte';
  import ListCard from './kit/ListCard.svelte';
  import ListRow from './kit/ListRow.svelte';

  let {
    name = $bindable(),
    kind = $bindable(),
    date = $bindable(),
    cost = $bindable(),
    dilationOptIn = $bindable(),
    archived = $bindable(),
    showArchive = false
  }: {
    name: string;
    kind: ProcedureKind | null;
    /** A date input's value, empty for a procedure with no date yet. */
    date: string;
    cost: CostDraft;
    dilationOptIn: boolean;
    archived: boolean;
    /** Only for a procedure that exists: there is nothing to archive
        before the first save. */
    showArchive?: boolean;
  } = $props();

  let pickingKind = $state(false);
</script>

<Field label={m.surgery_name_label()} id="surgery-name">
  {#snippet children(id)}
    <input autocomplete={journalTextAutocomplete()}
      class="input"
      {id}
      name="surgery-name"
      placeholder={m.surgery_name_placeholder()}
      bind:value={name}
    />
  {/snippet}
</Field>
<Field label={m.surgery_kind_label()} legend>
  {#snippet children()}
    <ListCard>
      <ListRow
        key="procedure-kind"
        data-procedure-kind
        data-pick-procedure-kind="true"
        aria-haspopup="dialog"
        icon="clipboard"
        title={kind ? procedureKindName(kind) : m.surgery_kind_choose()}
        subtitle={kind ? null : m.surgery_kind_needed()}
        fadeSwap
        chevron={false}
        onclick={() => (pickingKind = true)}
      >
        {#snippet trailing()}<Icon name="chevronDown" size={22} />{/snippet}
      </ListRow>
    </ListCard>
  {/snippet}
</Field>
<Field label={m.surgery_date_label()} id="surgery-date">
  {#snippet children(id)}
    <DatePicker name="surgery-date" bind:value={date} {id} />
  {/snippet}
</Field>
<CostField id="surgery-cost" bind:draft={cost} />
{#if kind === 'custom'}
  <div class="disclosed" transition:disclose>
    <Field label={m.surgery_kind_dilation_toggle_label()} legend spread>
      {#snippet children()}
        <Switch
          checked={dilationOptIn}
          label={m.surgery_kind_dilation_toggle_label()}
          onChange={(v) => (dilationOptIn = v)}
        />
      {/snippet}
    </Field>
  </div>
{/if}
{#if showArchive}
  <Field label={m.surgery_archive_toggle_label()} legend spread>
    {#snippet children()}
      <Switch
        checked={archived}
        label={m.surgery_archive_toggle_label()}
        onChange={(value) => (archived = value)}
      />
    {/snippet}
  </Field>
{/if}
<ProcedureKindPicker
  open={pickingKind}
  current={kind}
  onPick={(picked) => (kind = picked)}
  onClose={() => (pickingKind = false)}
/>
