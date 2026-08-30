<script lang="ts">
  /* The app's one date picker: a flatpickr popup on an input, themed onto
     the tokens (components.css carries the one flatpickr stylesheet for the
     whole app). It replaces the native `type="date"` inputs everywhere -
     the native popup has no animation, no month dropdown, and a year you
     reach a month at a time, which is what ticket 99 item 11 was about
     before it became "all pickers".

     The value is the same `yyyy-mm-dd` string the native input traded in,
     so every existing bind keeps working. The visible field shows the
     locale's own long date via altInput; the real input carries the ISO
     value under it, exactly as a native date input has a visible formatting
     and a submitted value. Anything else a caller puts on the component
     lands on the input - a walkthrough handle, data-attributes - the same
     rest-spread every kit control offers. */
  import flatpickr from 'flatpickr';
  import 'flatpickr/dist/flatpickr.min.css';
  import { pickerLocale } from './flatpickrLocale';

  let {
    value = $bindable(''),
    id,
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
    name?: string;
    /** Inclusive bounds, `yyyy-mm-dd`. */
    min?: string;
    max?: string;
    ariaLabel?: string;
    /** For the list rows that are their own date display (compare, the
        wrapped custom range): the input spreads over the row invisibly and
        only the popup is flatpickr's, so the row keeps its drawing and
        gains its picker. */
    invis?: boolean;
    /** For callers that keep their date in someone else's state and want
        the new value on the way out rather than through a bind. */
    onchange?: (v: string) => void;
    [attribute: string]: unknown;
  } = $props();

  let picker: flatpickr.Instance | null = null;

  function mount(node: HTMLInputElement) {
    picker = flatpickr(node, {
      dateFormat: 'Y-m-d',
      altInput: !invis,
      altFormat: 'j F Y',
      defaultDate: value || undefined,
      minDate: min || undefined,
      maxDate: max || undefined,
      disableMobile: true,
      locale: pickerLocale(),
      onChange: (dates) => {
        const next = dates[0] ? flatpickr.formatDate(dates[0], 'Y-m-d') : '';
        value = next;
        onchange?.(next);
      }
    });
    /* The id belongs on the field a person sees and a label points at; the
       hidden original keeps the name for whatever submits it. The instance
       goes on both, so anything holding the visible field - a label, a
       test - reaches the picker through it. */
    if (picker.altInput) {
      if (id) {
        picker.altInput.id = id as string;
        node.removeAttribute('id');
      }
      const visible = picker.altInput as unknown as Record<string, unknown>;
      visible.flatpickr = picker;
      visible._flatpickr = picker;
    }
    return {
      destroy() {
        picker?.destroy();
        picker = null;
      }
    };
  }

  /* A value changed underneath the picker - the screen cleared its form, a
     range edit narrowed the bounds - and the field follows it. */
  $effect(() => {
    if (!picker) return;
    picker.set('minDate', (min as string) ?? undefined);
    picker.set('maxDate', (max as string) ?? undefined);
    if ((picker.selectedDates[0]?.toISOString().slice(0, 10) ?? '') !== value) {
      if (value) picker.setDate(value as string, false);
    else picker.clear(false);
    }
  });
</script>

<input
  class="input"
  class:date-invis={invis}
  type="text"
  {id}
  {name}
  use:mount
  aria-label={ariaLabel}
  placeholder={ariaLabel}
  {...rest}
/>

<style>
  /* The invisible variant spreads over whatever row renders the date in its
     place, so the whole row is the press target and the popup anchors to
     the row's own box. */
  .date-invis {
    position: absolute;
    inset: 0;
    opacity: 0;
    border: none;
  }
</style>
