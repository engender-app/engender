<script lang="ts">
  /* Flatpickr owns local dates and bounds. The popup lists days in a
     wrapping grid, so every target fits without a seven-column minimum. */
  import flatpickr from 'flatpickr';
  import 'flatpickr/dist/flatpickr.min.css';
  import { m } from '$lib/paraglide/messages';
  import { pickerLocale } from './flatpickrLocale';
  import { registerOverlayRegion } from './overlayLock';

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
  let releaseOverlay: (() => void) | null = null;

  function mount(node: HTMLInputElement) {
    let directInput: HTMLInputElement;
    let clearButton: HTMLButtonElement;

    function fitPopup() {
      if (!picker?.isOpen) return;
      const root = (node.closest('[data-app-root]') ?? document.documentElement).getBoundingClientRect();
      const view = window.visualViewport;
      const calendar = picker.calendarContainer;
      const left = view?.offsetLeft ?? 0;
      const width = view?.width ?? window.innerWidth;
      calendar.style.maxWidth = `${Math.min(root.width, width) - 16}px`;
      calendar.style.maxHeight = `${(view?.height ?? window.innerHeight) - 16}px`;
      calendar.style.top = `${(view?.offsetTop ?? 0) + 8}px`;
      calendar.style.left = `${Math.max(left + 8, Math.min(root.left + (root.width - calendar.offsetWidth) / 2, left + width - calendar.offsetWidth - 8))}px`;

    }

    function moveDay(event: KeyboardEvent) {
      if (!(event.target instanceof HTMLElement) || !event.target.classList.contains('flatpickr-day') || !picker) return;
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key) || event.ctrlKey) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const days = Array.from(picker.days.querySelectorAll<HTMLElement>('.flatpickr-day:not(.prevMonthDay):not(.nextMonthDay)'));
      const columns = getComputedStyle(picker.days).gridTemplateColumns.split(' ').length;
      const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -columns, ArrowDown: columns }[event.key]!;
      let index = days.indexOf(event.target) + step;
      while (days[index]?.classList.contains('flatpickr-disabled')) index += Math.sign(step);
      if (days[index]) days[index].focus();
    }

    function focusableNavigation(_dates: Date[], _text: string, fp: flatpickr.Instance) {
      fp.currentYearElement.tabIndex = 0;
      fp.monthsDropdownContainer.tabIndex = 0;
    }

    function addControls(fp: flatpickr.Instance) {
      focusableNavigation([], '', fp);
      fp.monthsDropdownContainer.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape' && event.key !== 'Tab') event.stopPropagation();
      });
      fp.calendarContainer.classList.add('date-picker-calendar');
      fp.calendarContainer.addEventListener('keydown', moveDay, true);
      for (const [control, label, step] of [
        [fp.prevMonthNav, m.prev_month(), -1],
        [fp.nextMonthNav, m.next_month(), 1]
      ] as const) {
        control.setAttribute('role', 'button');
        control.setAttribute('aria-label', label);
        control.tabIndex = 0;
        control.addEventListener('keydown', (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            event.stopImmediatePropagation();
            fp.changeMonth(step);
          }
        });
      }
      const footer = document.createElement('div');
      footer.className = 'date-picker-entry';
      const label = document.createElement('label');
      label.textContent = m.date_picker_entry();
      directInput = document.createElement('input');
      directInput.className = 'input';
      directInput.type = 'text';
      directInput.autocomplete = 'off';
      label.append(directInput);
      function applyDate() {
        const text = directInput.value.trim();
        const parsed = /^\d{4}-\d{2}-\d{2}$/.test(text) ? flatpickr.parseDate(text, 'Y-m-d') : undefined;
        if (!parsed || flatpickr.formatDate(parsed, 'Y-m-d') !== text || !fp.isEnabled(parsed)) {
          directInput.setCustomValidity(m.date_picker_invalid());
          directInput.reportValidity();
          return;
        }
        fp.setDate(parsed, true);
        (fp.altInput ?? node).focus({ preventScroll: true });
        fp.close();
      }
      directInput.addEventListener('input', () => directInput.setCustomValidity(''));
      directInput.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape' && event.key !== 'Tab') event.stopPropagation();
        if (event.key === 'Enter') {
          event.preventDefault();
          applyDate();
        }
      });
      const apply = document.createElement('button');
      apply.type = 'button';
      apply.className = 'btn btn-primary';
      apply.textContent = m.date_picker_apply();
      apply.addEventListener('click', applyDate);
      clearButton = document.createElement('button');
      clearButton.type = 'button';
      clearButton.className = 'btn btn-ghost';
      clearButton.textContent = m.date_picker_clear();
      clearButton.addEventListener('click', () => {
        fp.clear();
        (fp.altInput ?? node).focus({ preventScroll: true });
        fp.close();
      });
      footer.append(label, apply, clearButton);
      fp.calendarContainer.append(footer);
    }

    picker = flatpickr(node, {
      dateFormat: 'Y-m-d',
      altInput: !invis,
      altFormat: 'Y-m-d',
      defaultDate: value || undefined,
      minDate: min || undefined,
      maxDate: max || undefined,
      disableMobile: true,
      // Flatpickr dismisses on touchstart, before Android can cancel a Back
      // gesture. Outside dismissal below waits for a completed click.
      ignoredFocusElements: [document.body],
      clickOpens: false,
      locale: pickerLocale(),
      position: fitPopup,
      onChange: (dates) => {
        const next = dates[0] ? flatpickr.formatDate(dates[0], 'Y-m-d') : '';
        value = next;
        onchange?.(next);
      },
      onReady: (_dates, _text, fp) => addControls(fp),
      onMonthChange: focusableNavigation,
      onYearChange: focusableNavigation,
      onOpen: () => {
        if (!picker) return;
        fitPopup();
        directInput.value = value;
        directInput.setCustomValidity('');
        clearButton.disabled = !value;
        releaseOverlay?.();
        const launcher = picker.altInput ?? node;
        releaseOverlay = registerOverlayRegion(launcher, picker.calendarContainer, {
          dismiss: () => picker?.close(),
          restoreFocus: launcher
        });
      },
      onClose: () => {
        releaseOverlay?.();
        releaseOverlay = null;
      }
    });
    const dismissOutside = (event: MouseEvent) => {
      if (!picker?.isOpen || !(event.target instanceof Node)) return;
      if (picker.calendarContainer.contains(event.target)
        || (picker.altInput ?? node).contains(event.target)) return;
      picker.close();
    };
    document.addEventListener('click', dismissOutside);
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
    const launcher = picker.altInput ?? node;
    const open = () => picker?.open();
    const openFromKeyboard = (event: KeyboardEvent) => {
      if (event.key !== 'ArrowDown' || !picker) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      picker.open();
      const selected = picker.days.querySelector<HTMLElement>('.selected');
      (selected ?? picker.days.querySelector<HTMLElement>('.flatpickr-day:not(.flatpickr-disabled):not(.prevMonthDay):not(.nextMonthDay)'))?.focus();
    };
    launcher.addEventListener('click', open);
    launcher.addEventListener('keydown', openFromKeyboard, true);
    window.visualViewport?.addEventListener('resize', fitPopup);
    window.visualViewport?.addEventListener('scroll', fitPopup);
    return {
      destroy() {
        document.removeEventListener('click', dismissOutside);
        launcher.removeEventListener('click', open);
        launcher.removeEventListener('keydown', openFromKeyboard, true);
        window.visualViewport?.removeEventListener('resize', fitPopup);
        window.visualViewport?.removeEventListener('scroll', fitPopup);
        releaseOverlay?.();
        releaseOverlay = null;
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
    if ((picker.selectedDates[0] ? flatpickr.formatDate(picker.selectedDates[0], 'Y-m-d') : '') !== value) {
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
