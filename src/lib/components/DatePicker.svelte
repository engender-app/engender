<script lang="ts">
  /* A date field: the day as `yyyy-mm-dd` in a readonly field, and the
     picker (DatePickerPanel.svelte) behind a tap, Enter or ArrowDown on it.
     The picker is the control, so the field takes no typing of its own;
     typed entry lives in the picker's foot. pickerField.svelte.ts owns the
     field's half: where the picker is mounted, and when. */
  import { m } from '$lib/paraglide/messages';
  import DatePickerPanel from './DatePickerPanel.svelte';
  import { PickerField } from './pickerField.svelte';

  let {
    value = $bindable(''),
    id,
    describedBy,
    name,
    min,
    max,
    ariaLabel,
    invis = false,
    onchange,
    ...rest
  }: {
    value?: string;
    id?: string;
    /** The id of the field's help paragraph (kit/Field hands it to its
        children). */
    describedBy?: string;
    name?: string;
    /** Inclusive bounds, `yyyy-mm-dd`. */
    min?: string;
    max?: string;
    ariaLabel?: string;
    /** For the list rows that are their own date display (compare, the
        wrapped custom range): the field spreads over the row invisibly and
        only the picker is its own, so the row keeps its drawing and gains
        its picker. */
    invis?: boolean;
    /** For callers that keep their date in someone else's state and want
        the new value on the way out rather than through a bind. */
    onchange?: (v: string) => void;
    [attribute: string]: unknown;
  } = $props();

  const picker: PickerField = new PickerField(
    'date',
    (): string => ariaLabel || picker.field?.labels?.[0]?.textContent?.trim() || m.date_picker_title(),
    panel
  );

  function commit(next: string) {
    value = next;
    onchange?.(next);
    picker.close();
  }
</script>

{#snippet panel()}
  <DatePickerPanel {value} {min} {max} onPick={commit} onClear={() => commit('')} />
{/snippet}

<input
  class="input"
  class:date-invis={invis}
  type="text"
  readonly
  {id}
  {name}
  {value}
  aria-label={ariaLabel}
  aria-describedby={describedBy}
  aria-haspopup="dialog"
  placeholder={ariaLabel}
  onclick={picker.show}
  onkeydown={picker.onKeydown}
  {@attach picker.attach}
  {...rest}
/>

<style>
  /* The invisible variant spreads over whatever row renders the date in its
     place, so the whole row is the press target and the picker anchors to
     the row's own box. */
  .date-invis {
    position: absolute;
    inset: 0;
    opacity: 0;
    border: none;
  }
</style>
