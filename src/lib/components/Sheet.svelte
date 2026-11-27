<script lang="ts">
  import type { Snippet } from 'svelte';
  import { sheetEntranceDelay, sheetRise, scrimFade } from '$lib/motion/navigation';
  import { isReducedMotion } from '$lib/motion/tokens';
  import { firstFocusable, hostAppOverlay, lockBackground, registerOverlay } from './overlayLock';

  /* Local transitions animate opening and closing, but skip a parent
     unmount. Gates must remove a sheet with its private content immediately. */
  let {
    open = $bindable(false),
    title = '',
    onClose,
    onRequestClose,
    onClosed,
    children,
    busy = false,
  }: {
    open?: boolean;
    title?: string;
    onClose?: () => void;
    onRequestClose?: () => void;
    /** Once the sheet has finished leaving and handed focus and scrolling
        back to the screen: the moment a caller can move either itself. Set
        while the sheet is still on screen, a scroll is refused (the region
        is locked) and a focus is taken back by the release. It also fires
        when the screen unmounts with the sheet still open, so a caller
        that acts on it should only do so for a close it asked for. */
    onClosed?: () => void;
    children: Snippet;
    /** A write the sheet is waiting on. The scrim, a drag, Escape and Back leave it up
        until the write lands, so a sheet never closes over a write that may yet fail and
        need what is in it, and its contents are inert meanwhile. */
    busy?: boolean;
  } = $props();

  let sheetEl: HTMLElement | null = null;

  function close() {
    // The outgoing sheet still owns Back until its transition removes it.
    if (!open) return;
    if (busy) {
      dragY = 0;
      return;
    }
    if (onRequestClose) {
      dragY = 0;
      onRequestClose();
      return;
    }
    open = false;
    onClose?.();
  }

  /* Dismissal follows the drag rather than replaying the entrance backwards.
     The drag offset lives on a wrapper and the
     entrance/exit transition on the sheet inside it, because a Svelte
     transition writes `transform` on the element it is applied to and would
     overwrite an inline one; on two elements the two compose, and letting go
     past the threshold leaves the sheet where the finger left it while the
     exit carries it the rest of the way.

     A drag only starts when the sheet is scrolled to its top. Sheets in this
     app can be taller than the screen - the dose editor is a form - and a
     downward swipe inside one means "scroll up" until there is no up left.
     Nor inside a scroller of its own that says so (`data-sheet-no-drag`):
     the time picker's drums scroll vertically under the finger, and a
     sheet that took the swipe would never let them turn. */
  const DISMISS_DISTANCE = 96;
  const DISMISS_VELOCITY = 0.5; // px per ms

  let dragY = $state(0);
  let dragging = $state(false);
  let dragFrom = 0;
  let dragAt = 0;
  let dragPointer: number | null = null;

  function dragStart(e: PointerEvent) {
    if (dragPointer !== null || !sheetEl || sheetEl.scrollTop > 0) return;
    if ((e.target as HTMLElement).closest('input, select, textarea, [data-sheet-no-drag]')) return;
    dragPointer = e.pointerId;
    dragFrom = e.clientY;
    dragAt = e.timeStamp;
  }

  function dragMove(e: PointerEvent) {
    if (e.pointerId !== dragPointer) return;
    const dy = e.clientY - dragFrom;
    /* Downward only. An upward drag is not a dismissal and rubber-banding
       the sheet above its resting place would just be movement. */
    if (dy <= 0) {
      dragY = 0;
      return;
    }
    if (!dragging && dy > 4) {
      dragging = true;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }
    if (dragging) dragY = dy;
  }

  /* `touch-action: pan-y` on the wrapper leaves vertical scrolling to the
     browser, and a browser that has started a pan fires `pointercancel` and
     stops sending pointermoves, so a finger never got the sheet past its
     first few pixels. Cancelling the touchmove once the drag has begun is
     what keeps the gesture ours; until then a swipe is still free to scroll
     a sheet taller than the screen. Svelte registers `touchmove` as passive,
     so the listener is added by hand. */
  function holdTouchDrag(node: HTMLElement) {
    const onTouchMove = (e: TouchEvent) => {
      if (dragging && e.cancelable) e.preventDefault();
    };
    node.addEventListener('touchmove', onTouchMove, { passive: false });
    return () => node.removeEventListener('touchmove', onTouchMove);
  }

  /* The component outlives one opening, so a sheet dismissed by a drag would
     otherwise come back already pushed down by however far it was thrown. */
  $effect(() => {
    if (open) dragY = 0;
  });

  function dragEnd(e: PointerEvent) {
    if (e.pointerId !== dragPointer) return;
    const velocity = dragY / Math.max(1, e.timeStamp - dragAt);
    const dismissed = dragging && (dragY > DISMISS_DISTANCE || velocity > DISMISS_VELOCITY);
    dragPointer = null;
    dragging = false;
    if (dismissed) {
      close();
    } else {
      dragY = 0;
    }
  }

  /* Never a text field: focusing one opens the on-screen keyboard the
     instant a sheet appears, before anyone has asked to type anything -
     the whole screen shoves up to make room for it. The sheet itself still
     takes focus in that case, which keeps the rest of the contract below
     (the label is read out, Tab walks in from the top) without summoning
     a keyboard nobody asked for. Readonly is excluded because a readonly
     field never raises one regardless of type - DatePicker's field is one,
     since its picker is the control. */
  const NON_TEXT_INPUT_TYPES = ['checkbox', 'radio', 'range', 'color', 'file', 'button', 'submit', 'reset', 'image'];
  function opensKeyboard(el: HTMLElement): boolean {
    if (el instanceof HTMLInputElement) {
      return !el.readOnly && !NON_TEXT_INPUT_TYPES.includes(el.type);
    }
    if (el instanceof HTMLTextAreaElement) return !el.readOnly;
    return el.matches('[contenteditable="true"]');
  }

  /* Focus an explicitly marked data-sheet-focus target, then the field the
     sheet opens to fill, then the dialog itself. An irreversible action must
     never receive initial focus. Wait for introend and use preventScroll so
     Android Chromium does not force layout before the entrance attaches. */
  function focusInitial(node: HTMLElement) {
    sheetEl = node;
    let fallback: ReturnType<typeof setTimeout> | undefined;
    const applyFocus = () => {
      if (fallback) clearTimeout(fallback);
      if (!sheetEl || !sheetEl.isConnected) return;
      if (sheetEl.contains(document.activeElement)) return;
      const target = node.querySelector<HTMLElement>('[data-sheet-focus]') ?? firstFocusable(node);
      (target && !opensKeyboard(target) ? target : node).focus({ preventScroll: true });
    };

    node.addEventListener('introend', applyFocus, { once: true });
    /* `in:` and `out:` run independently. If opening is interrupted, Svelte
       can remove the transition before `introend`; reduced-motion engines
       have also differed on zero-duration transition events. The fallback
       stays past the 380ms rise plus half of `--dur-fast` on Android, or past the
       reduced-motion crossfade. */
    fallback = setTimeout(applyFocus, isReducedMotion() ? 200 : 450 + sheetEntranceDelay());
    return () => {
      node.removeEventListener('introend', applyFocus);
      if (fallback) clearTimeout(fallback);
      sheetEl = null;
    };
  }

  /* The background lock's own release runs as the scrim leaves, and it
     queues the focus return; onClosed queues after it, so a caller that
     moves focus wins over the launcher getting it back. */
  let recedeBackground: (() => void) | null = null;

  function holdBackground(node: HTMLElement) {
    /* The screen and save bar form separate stacking contexts. Keep the
       scrim beside them in the app frame so its layer covers both during
       the whole entrance. */
    const unhost = hostAppOverlay(node);
    const release = lockBackground(node);
    recedeBackground = release.recede;
    return () => {
      recedeBackground = null;
      release();
      unhost();
      queueMicrotask(() => onClosed?.());
    };
  }

  function ownSheet(node: HTMLElement) {
    return registerOverlay(node, { dismiss: close });
  }

  /* While a write runs (`busy`), everything in the sheet but its handle is inert, so
     nothing can be typed or picked that the write already sent without. Per child rather
     than one wrapper, because `.sheet > * + *` spaces the children. Reruns when `busy`
     changes. */
  function freezeWhileBusy(node: HTMLElement) {
    if (!busy) return;
    const frozen = [...node.children].filter((child): child is HTMLElement => child instanceof HTMLElement && !child.classList.contains('sheet-handle'));
    for (const child of frozen) child.inert = true;
    return () => {
      for (const child of frozen) child.inert = false;
    };
  }

  /* SF-001's background lock and focus trap live in overlayLock.ts now: the
     letter arrival is the app's second surface that
     covers the whole shell, and it owes the screen behind it exactly what a
     sheet does. Their reasoning travelled with them. */

  /* Time the scrim and its fixed blur with the sheet, including
     the reduced-motion crossfade when motionDuration() returns 0.
     Separate in and out curves allow overshoot only on arrival.
     Closing during that 380ms arrival lets it finish before exit. */

</script>

{#snippet sheetBody(tint: Snippet, panel: Snippet)}
  <div
    class="sheet-scrim"
    role="presentation"
    data-sheet-scrim
    onclick={(e) => {
      if (e.target === e.currentTarget) close();
    }}
    {@attach holdBackground}
  >
    {@render tint()}
    <div
      class="sheet-drag"
      role="presentation"
      data-sheet-drag
      class:is-dragging={dragging}
      style:transform={dragY ? `translateY(${dragY}px)` : undefined}
      onpointerdown={dragStart}
      onpointermove={dragMove}
      onpointerup={dragEnd}
      onpointercancel={dragEnd}
      {@attach holdTouchDrag}
    >
      {@render panel()}
    </div>
  </div>
{/snippet}

{#if open}
  {#snippet tintLocal()}
    <div class="sheet-scrim-tint scrim-withdraw" data-sheet-tint transition:scrimFade></div>
  {/snippet}
  {#snippet panelLocal()}
    <div
      class="sheet"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      tabindex="-1"
      data-sheet
      in:sheetRise
      out:sheetRise
      onoutrostart={() => recedeBackground?.()}
      {@attach focusInitial}
      {@attach ownSheet}
      {@attach freezeWhileBusy}
    >
      <div class="sheet-handle"></div>
      {@render children()}
    </div>
  {/snippet}
  {@render sheetBody(tintLocal, panelLocal)}
{/if}

<style>
  /* Tint and blur use their own layer. Applying opacity to the scrim fades
     its child sheet as well. QuickAdd avoids that because its scrim and fan
     are siblings.

     pointer-events: none lets the scrim itself receive dismissal clicks. */
  .sheet-scrim-tint {
    position: absolute;
    inset: 0;
    pointer-events: none;
    /* Keep CSS transitions disabled so Svelte's
       scrimFade WAAPI animation controls opacity without CSS transition interference. */
    transition: none;
  }
</style>
