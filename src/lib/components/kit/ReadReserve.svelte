<script lang="ts">
  /* A block of a screen that holds its room while its reads answer, then
     crossfades its content in (phase 12 ux-carpet ticket 183).

     ReadGate's idea for a block that is not one read: Home's today tier,
     agenda, notices and tiles answer out of a dozen-odd reads, and drawn the
     frame they answered they shoved everything under them 400 to 980px in
     one frame. Alicja's call on the ticket was "reserve + fade": hold a
     placeholder at the block's resting height so nothing below moves, fade
     the real block in over it, and where the guess was wrong, let the
     difference travel rather than jump.

     The caller owns the guess and the gate. `estimate` is what the block
     rested at last time (0 reserves nothing, which is also what a block
     that was empty last time wants); `ready` is the caller's own answer to
     "have the reads agreed", and must not fall back to false once true, or
     the placeholder comes back over settled content. `onrest` hands back
     the height the content is resting at, for the next visit's guess.

     The placeholder leaves by `out:crossfade`, lifted out of flow and
     fading underneath; the content arrives in flow at the same top and
     fades up over `--dur-fast`. `crossfade` is not used on the way in (it
     would take the arriving block out of flow, see its own comment in
     motion/reveal.ts).

     The travel is `maskHeight`, once, at the swap - not `resize` watching
     for good, as ReadGate's wrapper does. Everything inside this block has
     motion of its own after it arrives (a tile closing, the fold opening, a
     notice dismissed), and a `resize` wrapper around that lags it under
     `overflow: hidden`, which is what hid ReadGate's pager for a whole
     growth (phase 12 ticket 23). The one change this block owns is the
     swap, so that is the one it animates. */
  import type { Snippet } from 'svelte';
  import Skeleton from '../Skeleton.svelte';
  import { crossfade, maskHeight } from '$lib/motion/reveal';
  import { EASE_OUT_CSS, fadeOnly, isReducedMotion, motionDuration } from '$lib/motion/tokens';

  let {
    ready,
    estimate,
    onrest,
    children,
    ...rest
  }: {
    ready: boolean;
    /** Pixels to hold while not ready. */
    estimate: number;
    onrest?: (px: number) => void;
    children: Snippet;
    [attr: `data-${string}`]: unknown;
  } = $props();

  /* A skeleton block (Skeleton.svelte, `block`) is about 166px with its gap,
     so this many fill the room; the last one is clipped at the edge. */
  const SKELETON_BLOCK_PX = 166;

  const fadeIn = (_node: Element) => fadeOnly(motionDuration('--dur-fast'));

  let wrapper: HTMLElement;
  let restingHeight = $state(0);
  $effect(() => {
    if (ready) onrest?.(restingHeight);
  });

  /* The height on screen the moment before the swap, read before the DOM
     changes and spent the moment after, in the same flush, so the frame the
     browser paints next is already the travel's first. */
  let before: number | null = null;
  $effect.pre(() => {
    if (ready && before === null && wrapper) before = wrapper.getBoundingClientRect().height;
  });
  $effect(() => {
    if (!ready || before === null || before < 0) return;
    const from = before;
    before = -1;
    const to = wrapper.getBoundingClientRect().height;
    if (isReducedMotion() || Math.abs(to - from) < 1) return;
    const duration = motionDuration('--dur-med');
    maskHeight(wrapper, from, duration);
    /* A block that had nothing in it, or is left with nothing, also gains
       or loses its own margin: empty, its margins collapse through it into
       its neighbours'; holding a height, they do not. That is the screen's
       20 arriving or going in one frame at one end of the travel, so the
       margin travels too, from minus itself - which cancels the 20 of the
       block above, adjoining it - to its resting nothing. */
    const margin = parseFloat(getComputedStyle(wrapper).marginBottom) || 0;
    if (margin > 0 && (from < 1 || to < 1)) {
      const hidden = { marginTop: `${-margin}px` };
      const shown = { marginTop: '0px' };
      wrapper.animate(from < 1 ? [hidden, shown] : [shown, hidden], { duration, easing: EASE_OUT_CSS });
    }
  });
</script>

<div class="read-reserve" bind:this={wrapper} {...rest}>
  <!-- One `{#if}` chain rather than a nested `{#if estimate > 0}`: a local
       transition only plays when its own block goes, so a placeholder one
       block down was cut, at full opacity, when the outer block went. -->
  {#if !ready && estimate > 0}
    <div class="read-reserve-hold" out:crossfade style:height="{estimate}px" data-read-reserve-hold>
      <Skeleton variant="block" count={Math.max(1, Math.ceil(estimate / SKELETON_BLOCK_PX))} />
    </div>
  {:else if ready}
    <div class="read-reserve-body" in:fadeIn bind:clientHeight={restingHeight} data-read-reserve-body>
      {@render children()}
    </div>
  {/if}
</div>

<style>
  .read-reserve-hold {
    overflow: clip;
  }

  /* The blocks inside keep the screen's own floor (app.css, `.screen > *`):
     20 under each, the last one's collapsing out through this block into
     whatever follows, so the screen lays out exactly as it did when they
     were the screen's own children, and each block's own collapse still
     finds the neighbouring margins it measures. */
  .read-reserve-body > :global(*) {
    margin-bottom: var(--space-5);
  }
</style>
