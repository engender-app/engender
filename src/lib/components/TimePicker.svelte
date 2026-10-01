<script lang="ts">
  /* A time field (phase 12 pickers, ticket 02), in place of the platform's
     `<input type="time">` and keeping its contract: the value is `HH:MM` on
     a 24-hour clock, or empty. The field is readonly and the picker
     (TimePickerPanel.svelte) is the control, behind a tap, Enter or
     ArrowDown, in the same host as the date picker's (pickerField.svelte.ts). */
  import { m } from '$lib/paraglide/messages';
  import TimePickerPanel from './TimePickerPanel.svelte';
  import { PickerField } from './pickerField.svelte';

  let {
    value = $bindable(''),
    id,
    describedBy,
    name,
    ariaLabel,
    required = false,
    onchange,
    ...rest
  }: {
    value?: string;
    id?: string;
    /** The id of the field's help paragraph (kit/Field hands it to its
        children). */
    describedBy?: string;
    name?: string;
    ariaLabel?: string;
    /** The caller always stores a time, so the picker offers no Clear. */
    required?: boolean;
    onchange?: (v: string) => void;
    [attribute: string]: unknown;
  } = $props();

  const picker: PickerField = new PickerField(
    'time',
    (): string => ariaLabel || picker.field?.labels?.[0]?.textContent?.trim() || m.time_picker_title(),
    panel
  );

  function commit(next: string) {
    value = next;
    onchange?.(next);
    picker.close();
  }
</script>

{#snippet panel()}
  <TimePickerPanel {value} {required} onPick={commit} onClear={() => commit('')} />
{/snippet}

<input
  class="input time-field"
  type="text"
  readonly
  {id}
  {name}
  {value}
  {required}
  aria-label={ariaLabel}
  aria-describedby={describedBy}
  aria-haspopup="dialog"
  placeholder={m.time_picker_empty()}
  onclick={picker.show}
  onkeydown={picker.onKeydown}
  {@attach picker.attach}
  {...rest}
/>

<style>
  .time-field { font-variant-numeric: tabular-nums; }
</style>
