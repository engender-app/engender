<script lang="ts">
  /* A date field: the day as `yyyy-mm-dd` in a readonly field, and the
     picker (DatePickerPanel.svelte) behind a tap, Enter or ArrowDown on it.
     The picker is the control, so the field takes no typing of its own;
     typed entry lives in the picker's foot.

     The picker is mounted outside the screen, into whatever holds the
     field: the scrim of the sheet it sits in, or the app frame. A sheet
     inside a sheet's scroll box would scroll with it and be clipped by it,
     and a popover inside a screen is spent inside `.app-main`'s stacking
     context under the floating bar (overlayLock.ts). Svelte's `mount` does
     that rather than moving a node the screen's markup owns - a moved node
     is not between the anchors its block removes by (carpet 26). It is
     mounted on the first opening, not with the field: 39 screens carry a
     date field, and a picker for each would be built for nothing on most
     visits (ticket 165's reason). It is let go once it has closed and its
     exit has played, which is when its host is empty again. */
  import { flushSync, mount, unmount } from 'svelte';
  import { m } from '$lib/paraglide/messages';
  import DatePickerHost from './DatePickerHost.svelte';

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

  /** app.css's `@container app (min-width: 1024px)`: the rail layout, where
      a pointer is the likely hand and a popover beats a sheet. */
  const DESKTOP_WIDTH = 1024;

  let open = $state(false);
  let desktop = $state(false);
  let field: HTMLInputElement;
  let host: { instance: ReturnType<typeof mount>; target: HTMLElement; observer: MutationObserver } | null = null;

  function commit(next: string) {
    value = next;
    onchange?.(next);
    open = false;
    if (desktop) field.focus({ preventScroll: true });
  }

  const hostProps = {
    get open() { return open; },
    get desktop() { return desktop; },
    get anchor() { return field; },
    get label() {
      return ariaLabel || field.labels?.[0]?.textContent?.trim() || m.date_picker_title();
    },
    get value() { return value; },
    get min() { return min; },
    get max() { return max; },
    onPick: commit,
    onClear: () => commit(''),
    onDismiss: () => (open = false)
  };

  function release() {
    if (!host) return;
    host.observer.disconnect();
    unmount(host.instance);
    host.target.remove();
    host = null;
  }

  function show() {
    if (open) return;
    const frame = field.closest('[data-app-root]');
    desktop = (frame?.clientWidth ?? window.innerWidth) >= DESKTOP_WIDTH;
    if (!host) {
      const target = document.createElement('div');
      target.style.display = 'contents';
      (field.closest('[data-sheet-scrim]') ?? frame ?? document.body).append(target);
      const instance = mount(DatePickerHost, { target, props: hostProps });
      const observer = new MutationObserver(() => {
        if (!open && !target.firstElementChild) release();
      });
      observer.observe(target, { childList: true });
      host = { instance, target, observer };
      /* Mounted closed and opened a flush later, so the host's own
         `{#if open}` is what creates the surface and its entrance plays. */
      flushSync();
    }
    open = true;
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.key !== 'Enter' && event.key !== 'ArrowDown') return;
    event.preventDefault();
    show();
  }

  function attach(node: HTMLInputElement) {
    field = node;
    return release;
  }
</script>

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
  onclick={show}
  onkeydown={onKeydown}
  {@attach attach}
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
