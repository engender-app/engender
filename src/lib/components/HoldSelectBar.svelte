<script lang="ts">
  /* The bar a held photograph raises (pre-release-human 12): Cancel, how
     many are picked, and Delete. Delete asks first, then deletes every
     picked photograph in one deletion with the app's 10-second undo for
     the batch (deleteUndo.ts).

     It takes the floating bar's place, over it, rather than being the
     app's foot (SaveBar). The foot changes the scroll region's room as it
     arrives, and on a grid scrolled to its end that moved every tile 92px
     in the frame the hold fired - measured, under the held finger. The
     floating bar's room is reserved already (--nav-clearance), so a bar
     drawn where it stands covers nothing new and moves nothing. The tabs
     under it are not wanted while picking; Cancel and Back leave first,
     the way a photo app's selection bar does.

     While picking, Back and Escape leave picking rather than the screen:
     the screen registers as the surface on top (overlayLock.ts), with the
     bar as part of it, since the bar is hosted in the frame outside the
     screen's own node. */
  import { m } from '$lib/paraglide/messages';
  import type { Journal } from '$lib/data/journal/journal';
  import { offerUndo, undoable } from '$lib/stores/deleteUndo';
  import { oneAtATime } from '$lib/stores/writeOutcome';
  import { hostAppOverlay, registerOverlay, registerOverlayRegion } from './overlayLock';
  import { EASE_OUT, crossfadeDuration, fadeOnly, isReducedMotion, motionDuration } from '$lib/motion/tokens';
  import type { TransitionConfig } from 'svelte/transition';
  import ConfirmDeleteSheet from './kit/ConfirmDeleteSheet.svelte';
  import type { HoldSelection } from './kit/holdSelect.svelte';

  let {
    selection,
    scope,
    remove
  }: {
    selection: HoldSelection;
    /** The screen the grid is on: what Back closes picking on. */
    scope: HTMLElement | undefined;
    /** Deletes these photographs through `journal`, the deletion's own
        transaction: every write goes through it, none nests another. */
    remove: (journal: Journal, ids: string[]) => Promise<void>;
  } = $props();

  let bar = $state<HTMLElement>();
  let asking = $state(false);
  /* The count the question was asked with, held so the closing sheet does
     not change its own words to "0" as the selection clears under it. */
  let askedCount = $state(0);
  let deleting = $state(false);
  let failed = $state(false);

  $effect(() => {
    if (!selection.active || !scope || !bar) return;
    const leave = () => {
      if (!deleting) selection.clear();
    };
    const unregister = registerOverlay(scope, { dismiss: leave });
    const unregisterBar = registerOverlayRegion(scope, bar, { dismiss: leave });
    return () => {
      unregisterBar();
      unregister();
    };
  });

  /* Rule 10: a solid thing arrives from its own edge. The bar's edge is
     the window's bottom, so it rises from below it and falls back, by its
     own height and the gap it floats above the edge by. */
  function rise(_node: Element, { leaving = false } = {}): TransitionConfig {
    /* Reduced motion keeps the arrival as a crossfade rather than a cut;
       the bar leaves faster than it came, since by then it is answered. */
    if (isReducedMotion()) return fadeOnly(crossfadeDuration());
    const duration = motionDuration(leaving ? '--dur-fast' : '--dur-med');
    return {
      duration,
      easing: EASE_OUT,
      css: (t) => `transform: translateY(calc(${1 - t} * (100% + var(--nav-float-gap) + var(--inset-bottom))))`
    };
  }

  const removeOnce = oneAtATime(() => {}, (busy) => (deleting = busy));
  async function confirm() {
    const ids = [...selection.ids];
    if (!ids.length) return;
    failed = false;
    let deletion: Awaited<ReturnType<typeof undoable>> | undefined;
    if (!(await removeOnce(async () => { deletion = await undoable((j) => remove(j, ids)); }, ''))) {
      failed = true;
      return;
    }
    asking = false;
    selection.clear();
    offerUndo(deletion!, m.record_deleted());
  }
</script>

{#if selection.active}
  <div class="hold-bar" bind:this={bar} data-hold-select-bar {@attach hostAppOverlay} in:rise out:rise={{ leaving: true }}>
    <button class="btn btn-ghost press" data-hold-select-cancel onclick={() => selection.clear()}>
      <span>{m.cancel()}</span>
    </button>
    <p class="small hold-count" role="status" data-hold-select-count>{m.pj_selected_count({ count: selection.ids.length })}</p>
    <button class="btn btn-danger press" data-hold-select-delete disabled={selection.ids.length === 0} onclick={() => { failed = false; askedCount = selection.ids.length; asking = true; }}>
      <span>{m.delete()}</span>
    </button>
  </div>
{/if}

<ConfirmDeleteSheet
  open={asking}
  title={m.photos_select_delete_sheet()}
  question={m.photos_select_delete_q({ count: askedCount })}
  hint={m.photos_select_delete_hint()}
  confirmLabel={m.delete()}
  cancelLabel={m.keep_it()}
  confirmAttrs={{ 'data-hold-select-confirm': '' }}
  busy={deleting}
  {failed}
  onConfirm={confirm}
  onCancel={() => (asking = false)}
/>

<style>
  /* The floating bar's own box (app.css, .app-nav): the same place, edge,
     ground and float, one layer over it. */
  .hold-bar {
    position: absolute;
    left: calc(var(--nav-float-gap) + var(--inset-left));
    right: calc(var(--nav-float-gap) + var(--inset-right));
    bottom: calc(var(--nav-float-gap) + var(--inset-bottom));
    min-height: var(--nav-bar-height, var(--bottom-nav-height));
    border-radius: var(--r-block);
    background: var(--surface);
    border: 1px solid var(--outline);
    box-shadow: var(--shadow-float);
    padding: var(--nav-bar-pad);
    display: flex;
    align-items: center;
    gap: var(--space-2);
    z-index: 31;
  }
  .hold-count { flex: 1; margin: 0; text-align: center; min-width: 0; }
  .hold-bar .btn { flex-shrink: 0; }
</style>
