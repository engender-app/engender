<script lang="ts">
  /* Where a picker's body is shown (phase 12 pickers, tickets 01 and 02):
     the app's own bottom Sheet on a phone, and on a desktop a popover
     hung from the field, which a pointer can reach without the page
     going away behind it. The date and the time picker share it, each
     handing over its body as `panel`.

     pickerField.svelte.ts mounts this outside the screen (see the note
     there), so it owns both ends of the popover's motion itself. The popover is a
     block, and a block does not fade up from nothing (ADR-0078): it
     unrolls from the field's edge on a clip, travelling the last few
     pixels with it, and rolls back up into the field on the way out. Under
     reduced motion it crossfades instead. */
  import type { Snippet } from 'svelte';
  import type { TransitionConfig } from 'svelte/transition';
  import { crossfadeDuration, EASE_OUT, fadeOnly, isReducedMotion, motionDuration } from '$lib/motion/tokens';
  import Sheet from './Sheet.svelte';
  import { registerOverlayRegion } from './overlayLock';

  let {
    open,
    desktop,
    anchor,
    label,
    kind,
    panel,
    onDismiss
  }: {
    open: boolean;
    desktop: boolean;
    /** The field the popover hangs from. */
    anchor: HTMLElement;
    label: string;
    /** Names the surface for tests and the popover's width: seven day
        targets for a date, two drums for a time. */
    kind: 'date' | 'time';
    panel: Snippet;
    onDismiss: () => void;
  } = $props();

  let marker = $derived({ [`data-${kind}-picker`]: '' });

  /* Which way the popover opens, decided when it is placed: down from the
     field, or up from it where the frame has no room below. */
  let above = false;
  const GAP = 8;

  function place(node: HTMLElement) {
    const frame = (anchor.closest('[data-app-root]') ?? document.documentElement).getBoundingClientRect();
    const field = anchor.getBoundingClientRect();
    const { offsetWidth: w, offsetHeight: h } = node;
    above = field.bottom + GAP + h > frame.bottom - GAP && field.top - GAP - h >= frame.top + GAP;
    const top = above ? field.top - GAP - h : Math.min(field.bottom + GAP, frame.bottom - GAP - h);
    node.style.top = `${Math.max(GAP, top - frame.top)}px`;
    node.style.left = `${Math.max(GAP, Math.min(field.left - frame.left, frame.width - w - GAP))}px`;
  }

  function unroll(node: Element, { closing = false }: { closing?: boolean } = {}): TransitionConfig {
    /* Placed here as well as in `own`: which edge it unrolls from depends
       on where it fits, and Svelte may build the intro before the
       attachment has run. */
    if (!closing) place(node as HTMLElement);
    if (isReducedMotion()) return fadeOnly(crossfadeDuration());
    const edge = above ? 'top' : 'bottom';
    const dir = above ? 1 : -1;
    return {
      duration: motionDuration(closing ? '--dur-fast' : '--dur-med'),
      easing: EASE_OUT,
      css: (_t, u) => {
        const shut = Number((u * 100).toFixed(2));
        const inset = edge === 'bottom' ? `0 0 ${shut}% 0` : `${shut}% 0 0 0`;
        return `clip-path: inset(${inset}); translate: 0 ${Number((dir * u * GAP).toFixed(2))}px`;
      }
    };
  }

  /* The popover is a region of whatever surface holds the field: Escape
     and Back close it first, and Tab stays inside the sheet it opened
     from. A click that lands outside it and the field closes it. It
     follows the field when the page under it scrolls. */
  function own(node: HTMLElement) {
    place(node);
    const release = registerOverlayRegion(anchor, node, { dismiss: onDismiss, restoreFocus: anchor });
    const outside = (event: MouseEvent) => {
      if (event.target instanceof Node && !node.contains(event.target) && !anchor.contains(event.target)) onDismiss();
    };
    let frame = 0;
    const follow = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => place(node));
    };
    /* On the intro's end, Sheet.svelte's reason (ticket 115); the timer is
       its fallback too, for an intro that is cut short or never fires. */
    const focusCursor = () => {
      clearTimeout(fallback);
      if (!node.isConnected || node.contains(document.activeElement)) return;
      node.querySelector<HTMLElement>('[data-sheet-focus]')?.focus({ preventScroll: true });
    };
    const fallback = setTimeout(focusCursor, motionDuration('--dur-med') + 200);
    document.addEventListener('click', outside);
    document.addEventListener('scroll', follow, true);
    window.addEventListener('resize', follow);
    node.addEventListener('introend', focusCursor, { once: true });
    return () => {
      release();
      cancelAnimationFrame(frame);
      document.removeEventListener('click', outside);
      document.removeEventListener('scroll', follow, true);
      window.removeEventListener('resize', follow);
      node.removeEventListener('introend', focusCursor);
      clearTimeout(fallback);
    };
  }
</script>

{#if desktop}
  {#if open}
    <div
      class="picker-popover"
      class:is-time={kind === 'time'}
      role="dialog"
      aria-label={label}
      tabindex="-1"
      {...marker}
      in:unroll
      out:unroll={{ closing: true }}
      {@attach own}
    >
      {@render panel()}
    </div>
  {/if}
{:else}
  <Sheet {open} title={label} onRequestClose={onDismiss}>
    <div {...marker}>{@render panel()}</div>
  </Sheet>
{/if}

<style>
  /* A surface's own edge against arbitrary content: a line, no shadow
     (the sheet's trade, and the kit's). Seven 48px targets plus padding,
     or for a time the drums and the typed entry under them. */
  .picker-popover {
    position: fixed;
    z-index: 45;
    width: min(calc(336px + 2 * var(--space-3) + 2px), calc(100% - 16px));
    max-height: calc(100% - 16px);
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: var(--space-3);
    border: 1px solid var(--outline);
    border-radius: var(--r-block);
    background: var(--surface);
    outline: none;
  }
  .picker-popover.is-time { width: min(calc(256px + 2 * var(--space-3) + 2px), calc(100% - 16px)); }
</style>
