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
  import { EASE_OUT_CSS, isReducedMotion } from '$lib/motion/tokens';
  import { fitReadArrival, playAfterPaint, readRevealDuration } from '$lib/motion/screenArrival';

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

  // Once shown, keep the answer visible during later refreshes.
  let ready = $state(false);
  $effect.pre(() => {
    if (answered) ready = true;
  });

  let painted = false;
  $effect(() => {
    requestAnimationFrame(() => setTimeout(() => (painted = true)));
  });

  /* A skeleton block (Skeleton.svelte, `block`) is about 166px with its gap,
     so this many fill the room; the last one is clipped at the edge. */
  const SKELETON_BLOCK_PX = 166;

  function fadeIn(node: HTMLElement) {
    if (!painted) {
      for (const animation of node.getAnimations({ subtree: true })) {
        if (animation.effect?.getComputedTiming().iterations !== Infinity) animation.finish();
      }
      return;
    }
    fitReadArrival(node.getAnimations({ subtree: true }));
    const duration = readRevealDuration('--dur-fast');
    if (duration === 0) return;
    const animation = node.animate([{ opacity: 0 }, { opacity: 1 }], { duration, easing: EASE_OUT_CSS });
    playAfterPaint(node, [animation]);
    return { destroy: () => animation.cancel() };
  }

  let wrapper: HTMLElement;
  let restingHeight = $state(0);
  $effect(() => {
    if (ready) onrest?.(restingHeight);
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
    if (ready && before === null && wrapper) {
      const box = wrapper.getBoundingClientRect();
      before = box.height;
      beforeTop = box.top - edgeAbove();
      beforeMargin = parseFloat(getComputedStyle(wrapper).marginBottom) || 0;
    }
  });
  $effect(() => {
    if (!ready || before === null || before < 0) return;
    const from = before;
    before = -1;
    if (!painted) return;
    const box = wrapper.getBoundingClientRect();
    const to = box.height;
    if (isReducedMotion()) return;
    const duration = readRevealDuration('--dur-med');
    /* `fill: 'forwards'` on every margin travel below, released once it has
       safely finished (ux-carpet ticket 233). Without `fill`, a `.animate()`
       call reverts its property to the stylesheet's own value the instant
       it finishes - natively, on the compositor, independent of the main
       thread - which is normally invisible, since these margins are chosen
       to already land where the resting layout would put them once
       `maskHeight`'s own clip comes off. But that native revert and
       `maskHeight`'s `settle()` (its own `.finished` handler, a *JS*
       promise a busy main thread can leave queued) are two independent
       cleanups with no ordering between them: on a main thread busy with
       ten parallel reads answering at once during boot, on Measurements'
       empty state, the compositor's revert could land a frame before
       `settle()` gets to run - the margin's compensation gone but the clip
       still up, showing the wrong one of two otherwise-equivalent
       positions for exactly one painted frame. A cast of
       `/body/measurements` on an empty, previously-populated journal
       (localStorage's `measurements-now` reserve carried a real height
       over) caught the button's row 20px too high for one frame at ~400ms,
       back on the next.

       `fill: 'forwards'` alone would trade that race for a standing one:
       held forever, a margin here would keep outranking a later plain CSS
       change to the same property - this block's own content "has motion
       of its own after it arrives" (a size record added or the last one
       removed flips `.read-reserve:has(...)`), and nothing else re-runs
       this effect to re-animate it. `releaseWhenDone` below cancels each animation
       after both the margin and height mask finish. Native start times can
       differ by a frame, so the margin's own promise may resolve while the
       height still blocks the child's margin from collapsing out. Waiting
       for the mask's cleanup keeps Home's 20px gap from dipping to the next
       heading's 16px for one frame. Cancellation then gives CSS control
       back, so later content changes can still adjust the margin. */
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
       frame of the swap (ux-carpet ticket 205). The block starts where it
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
       (below), so a last block asking for something else - hair progress's
       photos, 16 - does not change the gap at rest. The difference travels
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
    travel = maskHeight(wrapper, from, duration, owner.signal);
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
    <div class="read-reserve-hold" out:crossfade style:height="{estimate}px" data-read-reserve-hold>
      <Skeleton variant="block" count={Math.max(1, Math.ceil(estimate / SKELETON_BLOCK_PX))} />
    </div>
  {:else if ready}
    <div class="read-reserve-body" use:fadeIn bind:clientHeight={restingHeight} data-read-reserve-body>
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
     as its own children, whatever margin the last one asks for (ux-carpet
     ticket 205). Empty, it keeps the screen's 20, which the swap's margin
     travel below counts on. */
  .read-reserve:has(> .read-reserve-body > :global(*)) {
    margin-bottom: 0;
  }

  /* The blocks inside keep the screen's own floor: app.css spaces them
     beside `.screen > *`, at the same specificity, so a block's own margin
     wins or loses exactly as it would as the screen's child (ux-carpet
     ticket 211: a section title's own 12 had been losing to a scoped 20). */

  /* An inline-level last block keeps nothing under it: its margin cannot
     collapse out through this one (app.css, ticket 195's exception). */
  .read-reserve-body > :global(:is(.segmented-wrap, .btn):last-child) {
    margin-bottom: 0;
  }
</style>
