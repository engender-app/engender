<script lang="ts" generics="T">
  import type { Snippet } from 'svelte';
  import { m } from '$lib/paraglide/messages';
  import Notice from './Notice.svelte';
  import Skeleton from '../Skeleton.svelte';
  import { gateBranch } from './readGate';
  import type { LiveList } from '$lib/data/live/journal.svelte';
  import { crossfade, resize } from '$lib/motion/reveal';
  import { EASE_OUT_CSS, NIL_OPACITY } from '$lib/motion/tokens';
  import { fitReadArrival, playAfterPaint, readRevealDuration } from '$lib/motion/screenArrival';
  import { holdForArrival } from '$lib/motion/arrivalHold.svelte';

  let {
    read,
    variant = 'line',
    count = 3,
    rows,
    empty,
    failed
  }: {
    /** The read being waited on, from `liveList` (journal.svelte.ts). */
    read: LiveList<T>;
    /** The placeholder's shape, as Skeleton means it. */
    variant?: 'card' | 'block' | 'line';
    count?: number;
    /** What the screen draws when the read has rows.

        Handed them, so a snippet cannot render a different list than the one
        the gate branched on. Most screens take no parameter: they already
        hold a `$derived` of the same read for a count or a sheet elsewhere in
        the file, and a snippet may declare fewer parameters than it is
        offered. It is the screens with nothing but the list that take it. */
    rows: Snippet<[T[]]>;
    /** What the screen says when the read came back with nothing. */
    empty: Snippet;
    /** Optional domain-specific explanation; retry remains shared. */
    failed?: Snippet;
  } = $props();

  let branch = $derived(gateBranch(read));

  /* The answer fades in over the skeleton fading out. The skeleton's `out:crossfade` only ever handled the leaving
     half: whatever replaced it was inserted at full opacity, so a whole
     screen's worth of headings, lines and rows appeared in one frame on
     top of a placeholder still on its way out - measured on Care's cold
     load at 1x and 4x CPU, opacity 1 on the first frame every run. No
     `in:` transition can do this, because a transition needs one element
     and `rows` hands this wrapper several siblings that `.screen >
     .screen-part > *` spaces individually, so each arriving child is
     faded here instead. An `$effect` runs after the DOM update and before
     the next paint, so the first frame that shows the answer already has
     it at the start of the fade. Only the swap out of loading: a gate that
     mounts on a warm answer has nothing to cross from. */
  let part = $state<HTMLElement>();
  let wasLoading: boolean | undefined;
  /* What the gate draws: the read's own branch, except that an answer too
     late in an Android tab arrival to reveal within it keeps the skeleton
     until the field stops (screenArrival.ts). */
  const released = holdForArrival(() => branch !== 'loading', () => wasLoading === true);
  let shown = $derived(released() ? branch : 'loading');
  let revealVersion = 0;
  /* Hide the answer before Svelte inserts it. Android can paint one frame
     before a new Web Animation starts, exposing content through the skeleton. */
  $effect.pre(() => {
    const loading = shown === 'loading';
    if (wasLoading === true && !loading && part) {
      part.dataset.gateRevealing = '';
      revealVersion += 1;
    }
  });
  $effect(() => {
    const loading = shown === 'loading';
    if (wasLoading === true && !loading && part) {
      fitReadArrival(part.getAnimations({ subtree: true }));
      const duration = readRevealDuration('--dur-fast');
      if (duration > 0) {
        const version = revealVersion;
        const revealedPart = part;
        const animations: Animation[] = [];
        for (const child of part.children) {
          if ((child as HTMLElement).dataset.gateSkeleton !== undefined) continue;
          animations.push(child.animate([{ opacity: NIL_OPACITY }, { opacity: 1 }], { duration, easing: EASE_OUT_CSS, fill: 'forwards' }));
        }
        playAfterPaint(part, animations, { fitArrival: true });
        void Promise.allSettled(animations.map((animation) => animation.finished)).then(() => {
          if (version === revealVersion) delete revealedPart.dataset.gateRevealing;
          for (const animation of animations) animation.cancel();
        });
      } else {
        delete part.dataset.gateRevealing;
      }
    }
    wasLoading = loading;
  });
</script>

<!-- The skeleton and whatever replaces it share one wrapper,
     so the swap between them is a resize this persistent node can watch
     rather than a mount/unmount neither `resize` nor a transition can
     see: `out:crossfade` already takes the skeleton out of flow the
     instant content lands, and until now nothing animated the height
     that left behind, so the block's real size arrived in the same
     frame and shoved every settled sibling under it. `screen-part`
     rather than a bare div because this wrapper now sits where a
     caller's own one used to (see each `rows`/`empty` snippet below) -
     `.screen > .screen-part > *` (app.css) is what gives their content
     its floor. -->
<div class="screen-part" use:resize={shown} bind:this={part}>
  {#if shown === 'loading'}
    <div out:crossfade data-gate-skeleton><Skeleton {variant} {count} /></div>
  {:else}
    {#if shown === 'failed' || shown === 'stale'}
      <div role="status">
        {#if shown === 'failed' && failed}
          {@render failed()}
        {/if}
        <Notice
          title={shown === 'stale' ? m.read_refresh_failed() : failed ? undefined : m.read_failed()}
          text={shown === 'stale' ? m.read_stale_body() : undefined}
          action={{ label: m.read_retry(), onclick: () => read.retry() }}
        />
      </div>
    {/if}
    {#if shown === 'rows' || (shown === 'stale' && read.rows.length > 0)}
      {@render rows(read.rows)}
    {:else if shown === 'empty'}
      <!-- The empty state leaves the flow as the first row arrives
           (pre-release 18, item 60). In flow, its notice closed below
           the list that had just been drawn, so everything under the gate
           went down by the list's height and back up by the notice's
           (112px, then 154px, on the first question to raise). Out of
           flow, it fades over the rows and the wrapper's `resize` travels
           once, from the notice's height to the list's. -->
      <div class="gate-empty" out:crossfade>{@render empty()}</div>
    {/if}
  {/if}
</div>

<style>
  :global(.screen-part[data-gate-revealing] > :not([data-gate-skeleton])) {
    opacity: 0;
  }
  /* The empty state's wrapper stands where its blocks stood, so they keep
     the floor app.css gives a screen part's children (the wrapper's own 20
     and its last child's collapse into one, as they did on the part). */
  :global(:is(.screen, .read-reserve-body) > .screen-part > .gate-empty > *) {
    margin-bottom: var(--space-5);
  }
  :global(:is(.screen, .read-reserve-body) > .screen-part > .gate-empty > .kit-heading) {
    margin-bottom: var(--space-3);
  }
  :global(:is(.screen, .read-reserve-body) > .screen-part > .gate-empty > :is(.segmented-wrap, .btn):last-child) {
    margin-bottom: 0;
  }
</style>
