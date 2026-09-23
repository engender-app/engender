<script lang="ts">
  /* A block of a screen that holds its room while its reads answer, then
     crossfades its content in (phase 12 ux-carpet ticket 183).

     ReadGate's shape for a block that is not one read: Home's today tier,
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

     One persistent wrapper for both halves, as ReadGate has since ticket
     144, so `resize` sees the swap as a change of height it can travel
     rather than a mount it cannot. The placeholder leaves by `out:crossfade`,
     lifted out of flow and fading underneath; the content arrives in flow
     at the same top and fades up over `--dur-fast`. `crossfade` is not used
     on the way in (it would take the arriving block out of flow, see its
     own comment in motion/reveal.ts). */
  import type { Snippet } from 'svelte';
  import Skeleton from '../Skeleton.svelte';
  import { crossfade, resize } from '$lib/motion/reveal';
  import { fadeOnly, motionDuration } from '$lib/motion/tokens';

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

  let restingHeight = $state(0);
  $effect(() => {
    if (ready) onrest?.(restingHeight);
  });
</script>

<div class="read-reserve" use:resize {...rest}>
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

  /* The blocks inside carry the screen's own 20 between them. They are no
     longer children of `.screen` (app.css's floor is `.screen > *`), and the
     space goes above each block after the first rather than below each, so
     the body's own edges carry no margin and its height is the whole of
     what the next visit reserves. */
  .read-reserve-body > :global(* + *) {
    margin-top: var(--space-5);
  }
</style>
