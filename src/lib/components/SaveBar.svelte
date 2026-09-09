<script lang="ts">
  /* The app's foot: the one commitment a deep screen asks for, on the
     window's bottom edge above the floating bar (carpet 26).

     Written where its buttons are and hosted by the frame. `hostSaveBar`
     moves this node out of the scroll region into the app column, so the
     column reserves its room by being its flex sibling and nothing on the
     screen can end up under it at any scroll position - which is the whole
     of the defect this replaces ($lib/stores/saveBar.svelte has the
     measurements). The drawing lives in app.css with the frame's other
     furniture; what is here is the arrangement, which is the one thing that
     differs between the eight screens that have a foot.

     Three arrangements, and no fourth without a reason: `one` control at
     full width (six of the eight), `row` for two of equal weight side by
     side (a take to discard or keep - neither is the primary), and `stack`
     for a primary with a way past it under it, which is rule 12's foot in
     setup and rule 15's on a gate. */
  import type { Snippet } from 'svelte';
  import { navigating } from '$app/state';
  import { footFall, footRise } from '$lib/motion/foot';
  import { hostSaveBar } from '$lib/stores/saveBar.svelte';

  let {
    children,
    arrange = 'one'
  }: { children: Snippet; arrange?: 'one' | 'row' | 'stack' } = $props();
</script>

<!-- `|global` on both halves, and it is load-bearing rather than tidy: a
     transition is local by default, so it plays only when the block that
     holds it is the block whose condition changed. The block that mounts
     and unmounts a foot is always in the screen - `{#if pair}`, a tab, an
     editor's loading gate - which is an ancestor of this one, so without
     the modifier neither half ever ran and Svelte left the node where the
     action had moved it. Measured: two feet stacked in the column and 128px
     of nothing between the region and the lower one
     (tests/foot-motion-gallery.mjs, first run).

     The travel is skipped while a navigation is in flight: Svelte runs an
     out-transition when the page unmounts this node too, and on a
     navigation the foot belongs to the screen's own snapshot rather than to
     a second movement of its own ($lib/motion/foot, and the same escape
     `disclose` documents). -->
<div
  class="app-savebar savebar-{arrange}"
  data-app-savebar
  use:hostSaveBar
  in:footRise|global={{ skip: !!navigating.to }}
  out:footFall|global={{ skip: !!navigating.to }}
>
  {@render children()}
</div>
