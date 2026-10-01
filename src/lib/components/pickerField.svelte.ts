/* The field half of a picker (phase 12 pickers, tickets 01 and 02): a
   readonly field that opens the picker on a tap, Enter or ArrowDown, and
   the picker's host (PickerHost.svelte) mounted behind it. DatePicker and
   TimePicker each hold one.

   The picker is mounted outside the screen, into whatever holds the field:
   the scrim of the sheet it sits in, or the app frame. A sheet inside a
   sheet's scroll box would scroll with it and be clipped by it, and a
   popover inside a screen is spent inside `.app-main`'s stacking context
   under the floating bar (overlayLock.ts). Svelte's `mount` does that
   rather than moving a node the screen's markup owns - a moved node is not
   between the anchors its block removes by (carpet 26). It is mounted on
   the first opening, not with the field: 39 screens carry a date field,
   and a picker for each would be built for nothing on most visits (ticket
   165's reason). It is let go once it has closed and its exit has played,
   which is when its host is empty again. */
import { flushSync, mount, unmount, type Snippet } from 'svelte';
import PickerHost from './PickerHost.svelte';

/** app.css's `@container app (min-width: 1024px)`: the rail layout, where
    a pointer is the likely hand and a popover beats a sheet. */
const DESKTOP_WIDTH = 1024;

export class PickerField {
  open = $state(false);
  desktop = $state(false);
  #field: HTMLInputElement | undefined;
  #host: { instance: ReturnType<typeof mount>; target: HTMLElement; observer: MutationObserver } | null = null;

  readonly #kind: 'date' | 'time';
  readonly #ariaLabel: () => string | undefined;
  readonly #title: () => string;
  readonly #panel: Snippet;

  /** The surface is named by the caller's aria-label, else the field's own
      label, else the picker's generic `title`. */
  constructor(kind: 'date' | 'time', ariaLabel: () => string | undefined, title: () => string, panel: Snippet) {
    this.#kind = kind;
    this.#ariaLabel = ariaLabel;
    this.#title = title;
    this.#panel = panel;
  }

  #label(): string {
    return this.#ariaLabel() || this.#field?.labels?.[0]?.textContent?.trim() || this.#title();
  }

  /** Close, handing focus back to the field on a desktop - on a phone the
      sheet's own close does that. */
  close = () => {
    this.open = false;
    if (this.desktop) this.#field?.focus({ preventScroll: true });
  };

  show = () => {
    const field = this.#field;
    if (this.open || !field) return;
    const frame = field.closest('[data-app-root]');
    this.desktop = (frame?.clientWidth ?? window.innerWidth) >= DESKTOP_WIDTH;
    if (!this.#host) {
      const target = document.createElement('div');
      target.style.display = 'contents';
      (field.closest('[data-sheet-scrim]') ?? frame ?? document.body).append(target);
      const self = this;
      const instance = mount(PickerHost, {
        target,
        props: {
          get open() { return self.open; },
          get desktop() { return self.desktop; },
          anchor: field,
          get label() { return self.#label(); },
          kind: this.#kind,
          panel: this.#panel,
          onDismiss: () => (self.open = false)
        }
      });
      const observer = new MutationObserver(() => {
        if (!this.open && !target.firstElementChild) this.#release();
      });
      observer.observe(target, { childList: true });
      this.#host = { instance, target, observer };
      /* Mounted closed and opened a flush later, so the host's own
         `{#if open}` is what creates the surface and its entrance plays. */
      flushSync();
    }
    this.open = true;
  };

  onKeydown = (event: KeyboardEvent) => {
    if (event.key !== 'Enter' && event.key !== 'ArrowDown') return;
    event.preventDefault();
    this.show();
  };

  attach = (node: HTMLInputElement) => {
    this.#field = node;
    return () => this.#release();
  };

  #release() {
    const host = this.#host;
    if (!host) return;
    host.observer.disconnect();
    unmount(host.instance);
    host.target.remove();
    this.#host = null;
  }
}
