<script lang="ts">
  /* Reserve the caller's last resting height until its reads settle, then
     fade in the content. Zero reserves no space. Once ready is true, keep
     it true to prevent the placeholder returning. onrest stores the new
     height for the next visit.

     out:crossfade lifts the placeholder out of flow beneath the arriving
     content, which fades in at the same top while staying in flow.
     maskHeight animates the difference once at the swap. A persistent
     resize wrapper would lag and clip later child motions. */
  import type { Snippet } from 'svelte';
  import type { TransitionConfig } from 'svelte/transition';
  import Skeleton from '../Skeleton.svelte';
  import { crossfade, maskHeight } from '$lib/motion/reveal';
  import { EASE_OUT_CSS, NIL_OPACITY, isReducedMotion } from '$lib/motion/tokens';
  import { fitReadArrival, playAfterPaint, readRevealDuration } from '$lib/motion/screenArrival';
  import { holdForArrival } from '$lib/motion/arrivalHold.svelte';
  import { useDoorActivity } from '$lib/navigation/doorActivity.svelte';

  const isDoorActive = useDoorActivity();

  let {
    ready: answered,
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
    id?: string;
    [attr: `data-${string}`]: unknown;
  } = $props();

  let painted = false;
  $effect(() => {
    requestAnimationFrame(() => setTimeout(() => (painted = true)));
  });

  /* Once shown, keep the answer visible during later refreshes. An answer
     too late in an Android tab arrival to reveal within it waits for the
     field to stop (screenArrival.ts). */
  const released = holdForArrival(() => answered, () => painted);
  let ready = $state(false);
  $effect.pre(() => {
    if (released()) ready = true;
  });

  /* The hold only crossfades out if it was ever painted. Reads that answer
     before the first frame (a revisit served from memory) would otherwise
     fade a never-seen skeleton out under content that is already drawn. */
  function holdOut(node: Element, params?: unknown, options?: { direction?: 'in' | 'out' | 'both' }): TransitionConfig {
    return painted ? crossfade(node, params, options) : { duration: 0 };
  }

  /* A skeleton block (Skeleton.svelte, `block`) is about 166px with its gap,
     so this many fill the room; the last one is clipped at the edge. */
  const SKELETON_BLOCK_PX = 166;

  function fadeIn(node: HTMLElement) {
    if (!isDoorActive()) return;
    if (!painted) {
      for (const animation of node.getAnimations({ subtree: true })) {
        if (animation.effect?.getComputedTiming().iterations !== Infinity) animation.finish();
      }
      return;
    }
    fitReadArrival(node.getAnimations({ subtree: true }));
    const duration = readRevealDuration('--dur-fast');
    if (duration === 0) return;
    const animation = node.animate([{ opacity: NIL_OPACITY }, { opacity: 1 }], { duration, easing: EASE_OUT_CSS });
    playAfterPaint(node, [animation], { fitArrival: true });
    return { destroy: () => animation.cancel() };
  }

  let wrapper: HTMLElement;
  let restingHeight = $state<number>();
  const rememberHeight = (height: number) => {
    if (isDoorActive()) restingHeight = height;
  };
  $effect(() => {
    if (isDoorActive() && ready && restingHeight !== undefined) onrest?.(restingHeight);
  });

  /* The height on screen the moment before the swap, read before the DOM
     changes and spent the moment after, in the same flush, so the frame the
     browser paints next is already the travel's first. */
  /** The bottom margin that leaves `box` through its bare bottom edge: its
      last child's, and that child's last child's, as far down as nothing
      holds it in - the largest of them, since they collapse into one. */
  const collapsedBottom = (box: Element | null): number => {
    let most = 0;
    for (let at = box?.lastElementChild; at; at = at.lastElementChild) {
      const style = getComputedStyle(at);
      most = Math.max(most, parseFloat(style.marginBottom) || 0);
      const holds =
        style.display !== 'block' ||
        style.overflow !== 'visible' ||
        (parseFloat(style.paddingBottom) || 0) > 0 ||
        (parseFloat(style.borderBottomWidth) || 0) > 0;
      if (holds) break;
    }
    return most;
  };

  let before: number | null = null;
  let beforeTop = 0;
  /* Where the block above this one ends, so a move that block makes in the
     same flush (Home's reserves open together) is not read as this one's. */
  const edgeAbove = () => {
    const above = wrapper.previousElementSibling ?? wrapper.parentElement;
    if (!above) return 0;
    const box = above.getBoundingClientRect();
    return above === wrapper.parentElement ? box.top : box.bottom;
  };
  let beforeMargin = 0;
  $effect.pre(() => {
    if (!isDoorActive()) {
      before = ready ? -1 : null;
      return;
    }
    if (ready && before === null && wrapper) {
      const box = wrapper.getBoundingClientRect();
      before = box.height;
      beforeTop = box.top - edgeAbove();
      beforeMargin = parseFloat(getComputedStyle(wrapper).marginBottom) || 0;
    }
  });
  $effect(() => {
    if (!isDoorActive()) return;
    if (!ready || before === null || before < 0) return;
    const from = before;
    before = -1;
    if (!painted) return;
    const box = wrapper.getBoundingClientRect();
    const to = box.height;
    if (isReducedMotion()) return;
    const duration = readRevealDuration('--dur-med');
    /* Hold each animated margin with fill: 'forwards'. Otherwise the
       compositor can reset it before the main thread removes maskHeight's
       clip, showing one wrong frame. Native start times can also differ by
       a frame. releaseWhenDone waits for both animations and mask cleanup
       before cancelling the margin animation. This keeps Home's 20px gap
       from briefly dipping to 16px and returns control to CSS for later
       content changes. */
    const owner = new AbortController();
    const margins: Animation[] = [];
    const cleanup = () => {
      owner.abort();
      for (const animation of margins) animation.cancel();
    };
    let travel = Promise.resolve();
    const releaseWhenDone = (animation: Animation) => {
      margins.push(animation);
      animation.finished.then(() => travel).then(() => animation.cancel()).catch(() => {});
      return animation;
    };
    /* The content's first block may bring a top margin the placeholder did
       not have, and it collapses out through this block's bare top edge:
       the doses log's first line moved the whole block 4px down in the
       frame of the swap. The block starts where it
       stood and travels the difference, as a top margin that cancels it. */
    const shift = box.top - edgeAbove() - beforeTop;
    if (Math.abs(shift) >= 1 && from >= 1 && to >= 1) {
      releaseWhenDone(
        wrapper.animate([{ marginTop: `${-shift}px` }, { marginTop: '0px' }], {
          duration,
          easing: EASE_OUT_CSS,
          fill: 'forwards'
        })
      );
    }
    /* Holding, this block carries the screen's 20 under it; answered, its
       content's last block carries its own and this one carries none
       (below), so a last block asking for something else - a photo row, 16 - does not change the gap at rest. The difference travels
       rather than landing in the frame of the swap. While `maskHeight`
       holds a height, the last block's margin cannot collapse out through
       this one, so the travel ends at that margin, which is what the gap
       becomes once the height lets go; with no height to travel it ends at
       this block's own, and the collapse does the rest. */
    const afterMargin = parseFloat(getComputedStyle(wrapper).marginBottom) || 0;
    const travels = Math.abs(to - from) >= 1;
    const handed = collapsedBottom(wrapper.querySelector('[data-read-reserve-body]'));
    const end = travels ? Math.max(afterMargin, handed) : afterMargin;
    if (Math.abs(afterMargin - beforeMargin) >= 1) {
      releaseWhenDone(
        wrapper.animate([{ marginBottom: `${beforeMargin}px` }, { marginBottom: `${end}px` }], {
          duration,
          easing: EASE_OUT_CSS,
          fill: 'forwards'
        })
      );
    }
    if (!travels) return cleanup;
    travel = maskHeight(wrapper, from, duration, { signal: owner.signal });
    /* A block that had nothing in it, or is left with nothing, also gains
       or loses its own margin: empty, its margins collapse through it into
       its neighbours'; holding a height, they do not. That is the screen's
       20 arriving or going in one frame at one end of the travel, so the
       margin travels too, from minus itself - which cancels the 20 of the
       block above, adjoining it - to its resting nothing. */
    const margin = from < 1 ? beforeMargin : afterMargin;
    if (margin > 0 && (from < 1 || to < 1)) {
      const hidden = { marginTop: `${-margin}px` };
      const shown = { marginTop: '0px' };
      releaseWhenDone(
        wrapper.animate(from < 1 ? [hidden, shown] : [shown, hidden], {
          duration,
          easing: EASE_OUT_CSS,
          fill: 'forwards'
        })
      );
    }
    return cleanup;
  });
</script>

<div class="read-reserve" bind:this={wrapper} {...rest}>
  <!-- One `{#if}` chain rather than a nested `{#if estimate > 0}`: a local
       transition only plays when its own block goes, so a placeholder one
       block down was cut, at full opacity, when the outer block went. -->
  {#if !ready && estimate > 0}
    <div class="read-reserve-hold" out:holdOut style:height="{estimate}px" data-read-reserve-hold>
      <Skeleton variant="block" count={Math.max(1, Math.ceil(estimate / SKELETON_BLOCK_PX))} />
    </div>
  {:else if ready}
    <div class="read-reserve-body" use:fadeIn bind:clientHeight={null, rememberHeight} data-read-reserve-body>
      {@render children()}
    </div>
  {/if}
</div>

<style>
  .read-reserve-hold {
    overflow: clip;
  }

  /* Answered and not empty, the block hands its spacing to what it holds:
     the last block's own bottom margin collapses out through this one's
     bare edge, so the screen lays out exactly as it did with those blocks
     as its own children, whatever margin the last one asks for. Empty, it keeps the screen's 20, which the swap's margin
     travel below counts on. */
  .read-reserve:has(> .read-reserve-body > :global(*)) {
    margin-bottom: 0;
  }

  /* An inline-level last block keeps nothing under it: its margin cannot collapse out
     through this one (app.css). */
  .read-reserve-body > :global(:is(.segmented-wrap, .btn):last-child) {
    margin-bottom: 0;
  }
</style>
