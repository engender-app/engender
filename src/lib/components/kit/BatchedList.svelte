<script lang="ts" generics="T">
  /* A list card that renders a batch at a time and grows as it is scrolled
     (phase 8 features ticket 66, ADR-0069).

     Why not simply render the whole log: on web the app draws a real
     scrollbar, on `[data-app-scroll-region]` rather than on the window, and a
     few hundred rows give it a thumb a few pixels tall. Growing the rendered
     count keeps that bar honest about what is there. It is also why this is
     not a virtual list - windowing renders a fixed count inside a spacer of
     the full height, which gives the tiny thumb from the first frame and
     makes the complaint permanent.

     SCREENS.md rules infinite scroll out for `/search`, and that stands: a
     person searching their own history is looking for one day, not grazing.
     A log is grazing, which is the whole of the distinction (ADR-0069).
     DIRECTION.md tier 4 refuses scroll-triggered reveals, and this is not
     one: what the scroll triggers is rendering, and the rows are simply
     there when they arrive. Whether the card's height travels as they do is
     ticket 68's measurement.

     The caller keeps its own `{#each}` and its own key, over the slice this
     hands it. That is deliberate rather than a row-shaped prop: the rows are
     the screen's, they carry `{@const}` and handles and half a dozen kit
     props, and a component that owned them would be re-describing every list
     in the app.

     The wrapper element around the card is load-bearing twice over. The
     card's hairline is `.kit-row + .kit-row`, an adjacent-sibling rule, so
     anything wrapped *inside* the card - a batch, say - loses the line where
     one batch meets the next, and `display: contents` does not rescue that,
     because sibling combinators read the DOM tree rather than the box tree.
     And ticket 68 needs somewhere to hang a height animation that is not
     `ListCard` itself, which every settings row in the app would otherwise
     inherit. */
  import type { Snippet } from 'svelte';
  import { page } from '$app/state';
  import { m } from '$lib/paraglide/messages';
  import { rememberBatches, restoredBatches } from '$lib/navigation/scroll-region';
  import ListCard from './ListCard.svelte';
  import { nextCount, remainingCount, shownCount } from './batchedList';
  import type { Role } from '$lib/theme/roles';

  let {
    items,
    key,
    role,
    rows
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
    /** The screen's rows, rendered over the slice that is showing. */
    rows: Snippet<[T[]]>;
  } = $props();

  /* Read once rather than tracked. This component's whole life is one visit
     to one screen, and a path that changed under it would mean the screen
     had been replaced - at which point Svelte has already destroyed this. */
  const path = page.url.pathname;

  /* The initial value is the point: what this list mounted at is what it
     was left at, and a later `key` would be a different list. */
  // svelte-ignore state_referenced_locally
  let batches = $state(restoredBatches(path, key));
  let shown = $derived(items.slice(0, shownCount(batches, items.length)));
  let remaining = $derived(remainingCount(batches, items.length));

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
    if (!sentinel || remaining === 0) return;
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

<div class="batched" data-batched-list={key}>
  <ListCard {role}>
    {@render rows(shown)}
  </ListCard>

  <!-- What the scroll is watched for. Empty and hidden: it is a position in
       the layout, not content, and a screen reader has no use for it. -->
  <div class="batched-edge" bind:this={sentinel} aria-hidden="true"></div>

  <!-- Kept even though the sentinel exists, and not a fallback for it. It is
       what a keyboard reaches, it is the same control search already ships,
       and it is the way out for anyone whose next row is not findable by the
       browser's own find because it has not rendered yet. -->
  {#if remaining > 0}
    <button class="btn btn-soft" data-batched-more={key} onclick={grow}>
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
</style>
