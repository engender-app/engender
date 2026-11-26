<script lang="ts" generics="T">
  /* Render the log in batches so the scrollbar reflects the rows present
     (ADR-0069). The sentinel adds rows without an entrance animation.
     Keep the end control for keyboard use and lists with autoGrow=false.
     Find-in-page and print see only mounted rows. Restore the batch count
     for the path and list key before restoring scroll.

     The caller owns row markup and keys. Keep the animation wrapper outside
     the card. Adjacent rows need to remain siblings for .kit-row + .kit-row
     to draw the hairline, even across batches. */
  import type { Snippet } from 'svelte';
  import { page } from '$app/state';
  import { m } from '$lib/paraglide/messages';
  import { rememberBatches, restoredBatches } from '$lib/navigation/scroll-region';
  import ListCard from './ListCard.svelte';
  import { batchesFor, nextCount, remainingCount, shownCount } from './batchedList';
  import type { Role } from '$lib/theme/roles';
  import { disclose } from '$lib/motion/reveal';

  let {
    items,
    key,
    role,
    rows,
    focusIndex = null,
    autoGrow = true
  }: {
    /** Every row the screen has, already read and already ordered. Nothing
        here asks the journal for anything: what is paged is the DOM. */
    items: T[];
    /** This list's own name, for the walkthrough handle and for what is
        remembered about it. A screen with two batched lists gives them two
        names, the same way search pages its two reads with two counters. */
    key: string;
    /** A role from $lib/theme/roles.ts, passed straight to the card. */
    role?: Role;
    /** False for a log that grows only when its control is pressed: no
        scroll sentinel, and the control discloses on the way in and gives
        back its own spacing on the way out, so the card's foot does not
        jump when the last batch arrives. The dose log uses it (after-release
        05); true keeps the scroll-grown behaviour every other list has. */
    autoGrow?: boolean;
    /** The screen's rows, rendered over the slice that is showing. */
    rows: Snippet<[T[]]>;
    /** The index in `items` a deep link named, if the screen found one
         - the screen's own question, since it
        already knows which row an id resolves to in its own ordered array.
        Expands the mounting render to include it in one step, over
        `restoredBatches` rather than replacing it: whichever asks for more
        wins. Never fed back into `rememberBatches` - a link landing on batch
        five must not leave the list on batch five after the person leaves
        and comes back with no link in hand. */
    focusIndex?: number | null;
  } = $props();

  /* Read once rather than tracked. This component's whole life is one visit
     to one screen, and a path that changed under it would mean the screen
     had been replaced - at which point Svelte has already destroyed this. */
  const path = page.url.pathname;

  /* The initial value is the point: what this list mounted at is what it
     was left at, and a later `key` would be a different list - and a deep
     link past that count is rendered in one step rather than one batch at a
     time. */
  // svelte-ignore state_referenced_locally
  let batches = $state(
    focusIndex !== null ? Math.max(restoredBatches(path, key), batchesFor(focusIndex)) : restoredBatches(path, key)
  );
  let shown = $derived(items.slice(0, shownCount(batches, items.length)));
  let remaining = $derived(remainingCount(batches, items.length));

  /* When focusIndex resolves asynchronously after mount, expand batches so
     the target row is rendered in the DOM for scrollToHash. */
  $effect(() => {
    if (focusIndex !== null && focusIndex !== undefined && focusIndex >= 0) {
      const needed = batchesFor(focusIndex);
      if (needed > batches) {
        batches = needed;
      }
    }
  });

  /* Built here rather than in the markup so the kit's own rule can see it:
     tests/kit-surfaces.test.ts reads a component's markup for bare copy and
     cannot tell a message call carrying an argument object from a string. */
  let moreLabel = $derived(m.list_more({ count: nextCount(batches, items.length) }));

  let sentinel = $state<HTMLElement>();

  function grow() {
    if (remaining === 0) return;
    batches += 1;
    /* Written on every growth rather than on the way out, because the way
       out is not a single moment this can see: a screen can leave by a
       navigation, by the app being backgrounded, or by the tab closing. */
    rememberBatches(path, key, batches);
  }

  /* Rooted at the scroll region rather than at the viewport: the app scrolls
     inside its own frame, and the demo bar's phone preview and the
     walkthrough's frame are both cases where the window is a different box
     from the one the list is scrolling in.

     The margin is what makes this read as a list that is simply long rather
     than as one that loads - half a screen of lead, so a slow scroll never
     reaches the end of what is rendered, and not so much that arriving on
     the screen immediately pulls three batches.

     Re-created as the list grows rather than kept: the effect reads
     `remaining`, so it tears down once the list is exhausted and there is
     nothing left to watch for. */
  $effect(() => {
    if (!autoGrow || !sentinel || remaining === 0) return;
    if (typeof IntersectionObserver === 'undefined') return;

    const root = sentinel.closest<HTMLElement>('[data-app-scroll-region]');
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) grow();
      },
      { root, rootMargin: '50%' }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  });
</script>

<div class="batched" class:batched-manual={!autoGrow} data-batched-list={key}>
  <ListCard {role}>
    {@render rows(shown)}
  </ListCard>

  <!-- What the scroll is watched for. Empty and hidden: it is a position in
       the layout, not content, and a screen reader has no use for it. -->
  {#if autoGrow}
    <div class="batched-edge" bind:this={sentinel} aria-hidden="true"></div>
  {/if}

  <!-- Kept even though the sentinel exists, and not a fallback for it. It is
       what a keyboard reaches, it is the same control search already ships,
       and it is the way out for anyone whose next row is not findable by the
       browser's own find because it has not rendered yet. -->
  {#if remaining > 0}
    <button class="btn btn-soft" data-batched-more={key} onclick={grow} transition:disclose={{ skip: autoGrow }}>
      <span>{moreLabel}</span>
    </button>
  {/if}
</div>

<style>
  /* The gap the card and the control would have had as siblings of the
     screen, now that a wrapper holds them both. */
  .batched {
    display: grid;
    gap: var(--space-4);
  }

  .batched-manual {
    gap: 0;
  }

  .batched-manual > button {
    margin-top: var(--space-4);
  }
</style>
