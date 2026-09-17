<script lang="ts">
  import type { Snippet } from 'svelte';
  import { sheetRise, scrimFade } from '$lib/motion/navigation';
  import { firstFocusable, lockBackground, registerOverlay } from './overlayLock';

  let {
    open = $bindable(false),
    title = '',
    onClose,
    onRequestClose,
    children,
  }: { open?: boolean; title?: string; onClose?: () => void; onRequestClose?: () => void; children: Snippet } = $props();

  let sheetEl: HTMLElement | null = null;

  function close() {
    if (onRequestClose) {
      dragY = 0;
      onRequestClose();
      return;
    }
    open = false;
    onClose?.();
  }

  /* Dismissal follows the drag rather than replaying the entrance backwards
     (DIRECTION.md, tier 2). The drag offset lives on a wrapper and the
     entrance/exit transition on the sheet inside it, because a Svelte
     transition writes `transform` on the element it is applied to and would
     overwrite an inline one; on two elements the two compose, and letting go
     past the threshold leaves the sheet where the finger left it while the
     exit carries it the rest of the way.

     A drag only starts when the sheet is scrolled to its top. Sheets in this
     app can be taller than the screen - the dose editor is a form - and a
     downward swipe inside one means "scroll up" until there is no up left. */
  const DISMISS_DISTANCE = 96;
  const DISMISS_VELOCITY = 0.5; // px per ms

  let dragY = $state(0);
  let dragging = $state(false);
  let dragFrom = 0;
  let dragAt = 0;
  let dragPointer: number | null = null;

  function dragStart(e: PointerEvent) {
    if (dragPointer !== null || !sheetEl || sheetEl.scrollTop > 0) return;
    if ((e.target as HTMLElement).closest('input, select, textarea')) return;
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

  /* Focus the field a sheet exists to fill; otherwise the sheet itself,
     which is where a dialog's focus belongs anyway - the label is read out
     and Tab walks in from the top. Never the first button: on the sheets
     that ask something irreversible that button is "yes", and a sheet that
     opens with "yes" under the cursor is one stray Enter from doing the
     thing it opened to warn about (ticket 15, F22).

     Ticket 115: calling .focus() synchronously upon DOM attachment forces
     layout flushes on Android Chromium before CSS transition keyframes attach,
     teleporting the sheet from translateY(0) to translateY(travel). Defer
     initial focus until the entrance transition settles (`introend`), with
     preventScroll: true. */
  function focusInitial(node: HTMLElement) {
    sheetEl = node;
    let fallback: ReturnType<typeof setTimeout> | undefined;
    const applyFocus = () => {
      if (fallback) clearTimeout(fallback);
      if (!sheetEl || !sheetEl.isConnected) return;
      if (sheetEl.contains(document.activeElement)) return;
      (firstFocusable(node) ?? node).focus({ preventScroll: true });
    };

    node.addEventListener('introend', applyFocus, { once: true });
    /* `in:` and `out:` run independently. If opening is interrupted, Svelte
       can remove the transition before `introend`; reduced-motion engines
       have also differed on zero-duration transition events. The fallback
       runs after the normal 380ms entrance, never during its layout setup. */
    fallback = setTimeout(applyFocus, 450);
    return () => {
      node.removeEventListener('introend', applyFocus);
      if (fallback) clearTimeout(fallback);
      sheetEl = null;
    };
  }

  function ownSheet(node: HTMLElement) {
    return registerOverlay(node, { dismiss: close });
  }

  /* SF-001's background lock and focus trap live in overlayLock.ts now: the
     letter arrival (redesign ticket 45) is the app's second surface that
     covers the whole shell, and it owes the screen behind it exactly what a
     sheet does. Their reasoning travelled with them. */

  /* The scrim and the withdrawal blur it carries settle with the sheet, on
     the sheet's own clock rather than on a duration of their own: with the
     travel now the sheet's whole height (redesign ticket 38) a scrim that
     finished first left the sheet still visibly moving over a page that had
     already gone dark. Under reduced motion the sheet substitutes a
     crossfade, so the scrim takes the same one - motionDuration() answers 0
     there, and a scrim that cuts while the sheet fades is the same mismatch
     the other way round.

     The entrance and the exit are two curves now rather than one, so the
     sheet is `in:`/`out:` rather than a bidirectional `transition:`. What
     that costs is the reversal: a sheet closed while it is still rising
     lands before it leaves instead of turning round where it got to. The
     directions had to differ - only the way up runs past its mark - and a
     sheet closed inside 380ms is a rarer thing to see than every close. */

</script>

{#if open}
  <div
    class="sheet-scrim"
    role="presentation"
    data-sheet-scrim
    onclick={(e) => {
      if (e.target === e.currentTarget) close();
    }}
    {@attach lockBackground}
  >
    <div
      class="sheet-scrim-tint scrim-withdraw"
      data-sheet-tint
      transition:scrimFade
    ></div>
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
    >
      <div
        class="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabindex="-1"
        data-sheet
        in:sheetRise
        out:sheetRise
        {@attach focusInitial}
        {@attach ownSheet}
      >
        <div class="sheet-handle"></div>
        {@render children()}
      </div>
    </div>
  </div>
{/if}

<style>
  /* The tint and the withdrawal ride a layer of the scrim's own rather than
     the scrim itself, and that is redesign ticket 38 rather than tidiness:
     an element's opacity applies to everything inside it, and the sheet is
     inside the scrim. Fading the scrim faded the sheet with it, so a sheet
     that had stopped fading in its own transition still arrived translucent
     - measured on the flipbook, the list behind it legible through it
     halfway up its travel. The fan's scrim (QuickAdd) has no such problem
     because the fan is its sibling; a sheet's is its child.

     `pointer-events: none` keeps the layer out of the way of the tap that
     dismisses: the scrim closes on a click whose target is the scrim
     itself, and a layer over it would be that target instead. */
  .sheet-scrim-tint {
    position: absolute;
    inset: 0;
    pointer-events: none;
    /* .scrim-withdraw declares CSS transition: opacity; override to none so Svelte's
       scrimFade WAAPI animation controls opacity without CSS transition interference. */
    transition: none;
  }
</style>
