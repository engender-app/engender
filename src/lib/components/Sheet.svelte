<script lang="ts">
  import { fade, fly } from 'svelte/transition';
  import type { Snippet } from 'svelte';
  import { motionDistance, motionDuration } from '$lib/motion/tokens';

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
     out of it, and closing dropped focus to the document. `inert` on `.app`'s
     other children keeps assistive tech and Tab out of the background
     regardless of how deep in that subtree the sheet itself lives (the
     `.contains` check below skips whichever child holds it); the scroll
     lock stops `.app-main` moving underneath a sheet that does not cover it
     edge to edge; focus returns to whatever opened the sheet on close. */
  function lockBackground(scrimNode: HTMLElement) {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const root = document.querySelector('.app');
    const restoreInert: HTMLElement[] = [];
    if (root) {
      for (const child of Array.from(root.children) as HTMLElement[]) {
        if (child.contains(scrimNode) || child.hasAttribute('inert')) continue;
        child.setAttribute('inert', '');
        restoreInert.push(child);
      }
    }
    const mainEl = document.querySelector<HTMLElement>('.app-main');
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
    class="sheet-scrim is-open"
    role="presentation"
    transition:fade={{ duration: motionDuration('--dur-med', 240) }}
    onclick={(e) => {
      if (e.target === e.currentTarget) close();
    }}
    {@attach lockBackground}
  >
    <div
      class="sheet"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      tabindex="-1"
      transition:fly={{ y: motionDistance('--motion-distance-md', 24), duration: motionDuration('--dur-med', 240) }}
      {@attach focusInitial}
    >
      <div class="sheet-handle"></div>
      {@render children()}
    </div>
  </div>
{/if}
