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
  import { hostSaveBar } from '$lib/stores/saveBar.svelte';

  let {
    children,
    arrange = 'one'
  }: { children: Snippet; arrange?: 'one' | 'row' | 'stack' } = $props();
</script>

<!-- The rise and the fall belong to the host rather than to `in:`/`out:`
     here, and that is a measurement rather than a preference: a Svelte
     outro holds the whole `{#if}` branch it sits in on screen until it
     finishes, which made a tab keep its old content for 380ms and then cut
     ($lib/motion/foot has the note and the flipbook frames). `cuts` is
     asked at the moment each end runs, so a navigation gets a cut and an
     in-screen change gets the travel. -->
<div
  class="app-savebar savebar-{arrange}"
  data-app-savebar
  use:hostSaveBar={{ cuts: () => !!navigating.to }}
>
  {@render children()}
</div>
