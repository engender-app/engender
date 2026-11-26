<script lang="ts">
  /* A currency field: the code in a button that looks like the select it
     replaces, and the choices in the app's own picker host
     (pickerField.svelte.ts) - a popover hung from the button on a desktop,
     the bottom sheet on a phone. The platform's `<select>` left where its
     list opened to the browser, and with 160 codes on Chromium that was a
     column starting far above the field ("can the dropdown be better?
     currently it opens very high at least on web", Alicja, 2026-11-26).

     One of the list, so every row carries a check and only the chosen one
     shows it, the shape LockAfterChoice has. A pick closes the picker and
     the arrow keys move between rows, the date picker's contract. */
  import { m } from '$lib/paraglide/messages';
  import { CURRENCY_CHOICES } from '$lib/data/cost';
  import Icon from './Icon.svelte';
  import { PickerField } from './pickerField.svelte';

  let {
    value = $bindable(''),
    choices,
    id,
    ...rest
  }: {
    value?: string;
    /** The codes in the order offered; the first `CURRENCY_CHOICES.length`
        are the common ones, set apart from the rest by a hairline. */
    choices: string[];
    id?: string;
    [attribute: string]: unknown;
  } = $props();

  const picker = new PickerField('list', () => m.cost_currency_label(), m.cost_currency_label, panel);

  function commit(code: string) {
    value = code;
    picker.close();
  }

  /* The chosen row is the one in the tab order and the one the picker
     focuses on opening; it is scrolled to when it is below the fold, since
     the popover opens at the top of 160 rows. */
  function land(node: HTMLElement) {
    node.scrollIntoView({ block: 'nearest' });
  }

  function move(event: KeyboardEvent) {
    const rows = [...(event.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('[role="option"]')];
    const at = rows.indexOf(document.activeElement as HTMLElement);
    const next =
      event.key === 'ArrowDown' ? at + 1 : event.key === 'ArrowUp' ? at - 1 : event.key === 'Home' ? 0 : event.key === 'End' ? rows.length - 1 : null;
    if (next === null) return;
    event.preventDefault();
    rows[Math.max(0, Math.min(rows.length - 1, next))]?.focus({ preventScroll: false });
  }

  const common = CURRENCY_CHOICES.length;
</script>

{#snippet panel()}
  <div class="currency-list" role="listbox" tabindex="-1" aria-label={m.cost_currency_label()} data-currency-list onkeydown={move}>
    {#each choices as code, i (code)}
      {@const on = code === value}
      <button
        type="button"
        class="currency-row"
        class:is-set-apart={i === common - 1 && choices.length > common}
        role="option"
        aria-selected={on}
        tabindex={on ? 0 : -1}
        data-sheet-focus={on ? '' : undefined}
        data-currency-option={code}
        {@attach on ? land : undefined}
        onclick={() => commit(code)}
      >
        <span>{code}</span>
        <span class="currency-mark" class:is-on={on} aria-hidden="true"><Icon name="check" size={20} /></span>
      </button>
    {/each}
  </div>
{/snippet}

<button
  type="button"
  class="input currency-field"
  {id}
  aria-haspopup="dialog"
  aria-label={m.cost_currency_label()}
  data-currency-value={value}
  onclick={picker.show}
  onkeydown={picker.onKeydown}
  {@attach picker.attach}
  {...rest}
>
  <span>{value}</span>
  <Icon name="chevronDown" size={18} />
</button>

<style>
  /* A select's own shape: the code at the start, the chevron at the end. */
  .currency-field {
    flex: 0 0 auto;
    width: 6.5rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    text-align: start;
    cursor: pointer;
  }

  .currency-list {
    display: flex;
    flex-direction: column;
  }

  .currency-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    min-height: var(--touch-target);
    padding: 0 var(--space-3);
    border: 0;
    border-radius: var(--r-block);
    background: none;
    color: var(--text);
    font: inherit;
    font-weight: var(--weight-medium);
    text-align: start;
    cursor: pointer;
  }
  .currency-row:hover {
    background: var(--surface-2);
  }
  .currency-row.is-set-apart {
    margin-bottom: var(--space-1);
    box-shadow: 0 var(--space-1) 0 -0.5px var(--hairline);
  }

  .currency-mark {
    display: inline-flex;
    opacity: 0;
    transition: opacity var(--dur-fast) var(--ease-out);
  }
  .currency-mark.is-on {
    opacity: 1;
  }
</style>
