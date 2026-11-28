<script lang="ts">
  /* The cost on a record that costs money:
     one amount box beside its currency, and a Refunded switch. The same
     three controls on every editor that has a cost, so a session, a visit,
     a draw, a procedure and the stock sheet ask it the same way.

     The amount is text, not a number input: "250,50" is how a Polish
     reader writes it, and a number input drops what it cannot parse while
     the person is still typing. A blank amount is no cost; an amount that is
     not one plain figure says so under the box, once the person has left
     it, and the editor's canSave (costDraftOk) holds the save back. The
     message opens and closes with `disclose` inside the control's own
     block, so the field's flex gap never jumps by a row. */
  import { m } from '$lib/paraglide/messages';
  import { journalTextAutocomplete } from '$lib/platform';
  import Field from '$lib/components/kit/Field.svelte';
  import Switch from '$lib/components/Switch.svelte';
  import CurrencyPicker from './CurrencyPicker.svelte';
  import { disclose } from '$lib/motion/reveal';
  import { currencyChoices } from '$lib/data/cost';
  import { costDraftOk, type CostDraft } from './costDraft';

  let { draft = $bindable(), id }: { draft: CostDraft; id: string } = $props();

  // The common currencies first, then every other code; a stored one stays offerable.
  let choices = $derived(currencyChoices(draft.currency));
  let ok = $derived(costDraftOk(draft));
</script>

<Field label={m.cost_label()} {id}>
  {#snippet children(fieldId, _hint, touched)}
    <div class="cost-control">
      <div class="cost-row">
        <input
          autocomplete={journalTextAutocomplete()}
          class="input cost-amount"
          id={fieldId}
          name={`${id}-amount`}
          inputmode="decimal"
          placeholder={m.cost_amount_placeholder()}
          aria-invalid={touched && !ok}
          aria-describedby={touched && !ok ? `${fieldId}-invalid` : undefined}
          bind:value={draft.amount}
        />
        <CurrencyPicker id={`${id}-currency`} {choices} bind:value={draft.currency} />
      </div>
      {#if touched && !ok}
        <p class="cost-invalid" id={`${fieldId}-invalid`} transition:disclose>{m.cost_amount_invalid()}</p>
      {/if}
    </div>
  {/snippet}
</Field>
<Field label={m.cost_refunded()} legend spread>
  {#snippet children()}
    <Switch checked={draft.refunded} label={m.cost_refunded()} onChange={(value) => (draft.refunded = value)} />
  {/snippet}
</Field>

<style>
  /* The currency goes under the amount rather than squeezing it below a
     touch target when the sheet is narrow (200% text at 390px). */
  .cost-row {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }
  .cost-amount {
    flex: 1 1 8rem;
    min-width: 0;
  }
  .cost-invalid {
    padding-top: var(--space-1);
    font-size: var(--text-sm);
    color: var(--text-2);
  }
</style>
