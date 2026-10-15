<script lang="ts">
  import { fly } from 'svelte/transition';
  import { toasts, toastLifetime, dismissToast } from '$lib/stores/toasts.svelte';
  import { motionDistance, motionDuration } from '$lib/motion/tokens';
  import { measureTops, travelFrom, type RowTop } from '$lib/motion/reorder.svelte';

  /* Two toasts up at once each keep their place and their action (UI 47,
     audit U32: a second delete laid its toast exactly over the first one's
     Restore). They stack away from the edge they rise from, so the one
     already up never moves while somebody is reaching for it: at the
     bottom the newest goes above, at the top (a failure over a sheet) it
     goes below. Each stack is in the order it is drawn, top to bottom, so
     Tab and a screen reader meet the toasts the way the eye does.

     The two stacks are the shell's children now rather than each toast, so
     a sheet's lockBackground (overlayLock.ts) makes them inert with the
     rest of the background for as long as it is open. A toast still shows
     over the scrim (z-index 50 against 40) and still speaks through the
     announcer; its action waits for the sheet to close, as a toast already
     up when the sheet opened always did. */
  const lowered = $derived(toasts.filter((t) => !t.raised).reverse());
  const raised = $derived(toasts.filter((t) => t.raised));

  let lowStack = $state<HTMLElement>();
  let highStack = $state<HTMLElement>();
  const rows = () =>
    [lowStack, highStack].flatMap((stack) => (stack ? [...stack.querySelectorAll<HTMLElement>('[data-toast]')] : []));
  const keyOf = (el: HTMLElement) => el.dataset.toastId ?? '';

  /* A toast that leaves takes the room it stood in with it, and the ones
     behind it travel into the gap (reorder.svelte.ts's measure, write,
     release) rather than jumping when its fade-out ends. The leaving one is
     still in the DOM for that fade, so it is lifted out of the stack's flow
     where it stands first: in flow it would hold the gap open until its
     last frame and give it up in one. */
  let before: RowTop[] = [];
  $effect.pre(() => {
    void toasts.map((t) => t.id);
    before = measureTops(rows(), keyOf);
  });
  $effect(() => {
    const live = new Set(toasts.map((t) => String(t.id)));
    const all = rows();
    for (const el of all) if (!live.has(keyOf(el))) holdWhereItStands(el);
    travelFrom(all.filter((el) => live.has(keyOf(el))), keyOf, before);
  });

  function holdWhereItStands(el: HTMLElement) {
    if (el.style.position === 'absolute') return;
    const was = el.getBoundingClientRect();
    el.style.transition = 'none';
    el.style.width = `${el.offsetWidth}px`;
    el.style.position = 'absolute';
    const now = el.getBoundingClientRect();
    el.style.translate = `${was.left - now.left}px ${was.top - now.top}px`;
  }
</script>

{#snippet item(t: (typeof toasts)[number])}
  <div
    class="toast is-open"
    data-toast
    data-toast-id={t.id}
    data-toast-kind={t.kind}
    transition:fly={{ y: (t.raised ? -1 : 1) * motionDistance('--motion-distance-sm'), duration: motionDuration('--dur-med') }}
  >
    <span>{t.message}</span>
    {#if t.actionLabel}
      <button
        class="toast-action"
        data-toast-action
        onclick={() => {
          dismissToast(t.id);
          t.onAction?.();
        }}>{t.actionLabel}</button
      >
    {/if}
  </div>
{/snippet}

<div class="toast-stack" bind:this={lowStack}>
  {#key toastLifetime.generation}
    {#each lowered as t (t.id)}{@render item(t)}{/each}
  {/key}
</div>
<div class="toast-stack is-raised" bind:this={highStack}>
  {#key toastLifetime.generation}
    {#each raised as t (t.id)}{@render item(t)}{/each}
  {/key}
</div>

<style>
  /* Where toasts are drawn: a column of them, so a second one stands beside
     the first instead of on top of its action. Centred by its two insets
     rather than by left: 50% and a -50% translate (after-release 17,
     U2/UI-19). The translate was the transform the arrival composes with,
     and at desktop width it centred the toast on the window, 105px off the
     column it belongs to; an inset can take the rail's width instead
     (+layout.svelte sets it, the one file that knows whether a rail is
     drawn), and the right one the scroll region's scrollbar gutter
     (+layout.svelte measures that too). The gap is wider than the 10px a
     toast rises on arrival, so one arriving never passes over its
     neighbour. */
  .toast-stack {
    position: absolute;
    left: 0;
    right: var(--scroll-gutter, 0px);
    bottom: var(--nav-clearance);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-3);
    z-index: 50;
    pointer-events: none;
  }
  @container app (min-width: 1024px) {
    .toast-stack { bottom: var(--space-6); }
  }
  /* A failure said while a sheet stays open (after-release 06): at the top,
     over the dimmed screen, rather than on the sheet's own buttons. It comes
     down from the edge it sits at. */
  .is-raised {
    top: calc(var(--inset-top) + var(--space-4));
    bottom: auto;
  }
</style>
