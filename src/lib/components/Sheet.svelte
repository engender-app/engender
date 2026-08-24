<script lang="ts">
  import { fade } from 'svelte/transition';
  import type { Snippet } from 'svelte';
  import { motionDuration } from '$lib/motion/tokens';
  import { sheetRise } from '$lib/motion/navigation';

  let {
    open = $bindable(false),
    title = '',
    onClose,
    children,
  }: { open?: boolean; title?: string; onClose?: () => void; children: Snippet } = $props();

  let sheetEl: HTMLElement | null = null;

  function close() {
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
     thing it opened to warn about (ticket 15, F22). */
  function focusInitial(node: HTMLElement) {
    sheetEl = node;
    const field = node.querySelector<HTMLElement>('input, select, textarea');
    (field ?? node).focus();
    return () => {
      sheetEl = null;
    };
  }

  /* SF-001: every confirmation in the app is a sheet, and without this the
     background stayed reachable behind an open dialog - Tab walked straight
     out of it, and closing dropped focus to the document. `inert` on the app
     shell's other children keeps assistive tech and Tab out of the
     background regardless of how deep in that subtree the sheet itself
     lives (the `.contains` check below skips whichever child holds it); the
     scroll lock stops the scroll region moving underneath a sheet that does
     not cover it edge to edge; focus returns to whatever opened the sheet on
     close. Queries `data-app-root`/`data-app-scroll-region` rather than
     `.app`/`.app-main` so this stays wired to the shell even if those
     presentational class names ever change. */
  function lockBackground(scrimNode: HTMLElement) {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const root = document.querySelector('[data-app-root]');
    const restoreInert: HTMLElement[] = [];
    if (root) {
      for (const child of Array.from(root.children) as HTMLElement[]) {
        if (child.contains(scrimNode) || child.hasAttribute('inert')) continue;
        child.setAttribute('inert', '');
        restoreInert.push(child);
      }
    }
    const mainEl = document.querySelector<HTMLElement>('[data-app-scroll-region]');
    const previousOverflow = mainEl?.style.overflow ?? '';
    if (mainEl) mainEl.style.overflow = 'hidden';

    return () => {
      restoreInert.forEach((el) => el.removeAttribute('inert'));
      if (mainEl) mainEl.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }

  function trapFocus(e: KeyboardEvent) {
    if (!sheetEl) return;
    const focusables = Array.from(
      sheetEl.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
    );
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  function onWindowKeydown(e: KeyboardEvent) {
    if (!open) return;
    if (e.key === 'Escape') {
      close();
    } else if (e.key === 'Tab') {
      trapFocus(e);
    }
  }
</script>

<svelte:window onkeydown={onWindowKeydown} />

{#if open}
  <div
    class="sheet-scrim scrim-withdraw is-open"
    role="presentation"
    transition:fade={{ duration: motionDuration('--dur-med', 240) }}
    onclick={(e) => {
      if (e.target === e.currentTarget) close();
    }}
    {@attach lockBackground}
  >
    <div
      class="sheet-drag"
      role="presentation"
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
        transition:sheetRise
        {@attach focusInitial}
      >
        <div class="sheet-handle"></div>
        {@render children()}
      </div>
    </div>
  </div>
{/if}
