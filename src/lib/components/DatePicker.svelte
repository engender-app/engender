<script lang="ts">
  /* A date field: the day written out ("3 Oct 2026") in a readonly field,
     and the picker (DatePickerPanel.svelte) behind a tap, Enter or ArrowDown
     on it. The picker is the control, so the field takes no typing of its
     own; typed entry lives in the picker's foot, which is where `yyyy-mm-dd`
     still belongs. The field used to show that string too, the one place in
     the app a date read as `2026-10-03` (after-release 28). `value` stays
     `yyyy-mm-dd`, and `data-date-value` carries it for the guards.
     pickerField.svelte.ts owns the field's half: where the picker is
     mounted, and when. */
  import { m } from '$lib/paraglide/messages';
  import { fmtDateValue } from '$lib/data/dates';
  import DatePickerPanel from './DatePickerPanel.svelte';
  import { parseIsoDate } from './datePicker';
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

  const picker = new PickerField('date', () => ariaLabel, m.date_picker_title, panel);

  let shown = $derived.by(() => {
    const day = parseIsoDate(value);
    return day == null ? value : fmtDateValue(day);
  });

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
  value={shown}
  data-date-value={value}
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
