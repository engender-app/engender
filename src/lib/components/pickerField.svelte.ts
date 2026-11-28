/* DatePicker and TimePicker use a readonly field that opens on tap,
   Enter or ArrowDown. Mount PickerHost in the enclosing sheet scrim
   or app frame to avoid scroll clipping and stacking issues.
   Svelte owns the new host and its teardown.

   Mount on first open to avoid unused hosts across 39 date-field
   screens. Release it once the exit animation finishes. */
import { flushSync, mount, unmount, type Snippet } from 'svelte';
import PickerHost from './PickerHost.svelte';

/** app.css's `@container app (min-width: 1024px)`: the rail layout, where
    a pointer is the likely hand and a popover beats a sheet. */
const DESKTOP_WIDTH = 1024;

/** What the picker holds: a day, a time, or a plain list of choices (the
    currency picker). The anchor may be a readonly input or a button. */
export type PickerKind = 'date' | 'time' | 'list';

export class PickerField {
  open = $state(false);
  desktop = $state(false);
  #field: HTMLElement | undefined;
  #host: { instance: ReturnType<typeof mount>; target: HTMLElement; observer: MutationObserver } | null = null;

  readonly #kind: PickerKind;
  readonly #ariaLabel: () => string | undefined;
  readonly #title: () => string;
  readonly #panel: Snippet;

  /** The surface is named by the caller's aria-label, else the field's own
      label, else the picker's generic `title`. */
  constructor(kind: PickerKind, ariaLabel: () => string | undefined, title: () => string, panel: Snippet) {
    this.#kind = kind;
    this.#ariaLabel = ariaLabel;
    this.#title = title;
    this.#panel = panel;
  }

  #label(): string {
    return this.#ariaLabel() || (this.#field as HTMLInputElement | undefined)?.labels?.[0]?.textContent?.trim() || this.#title();
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

  attach = (node: HTMLElement) => {
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
