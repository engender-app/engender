<script lang="ts">
  /* Draw a rounded square to signal multiple choices. Borrow the
     selected chip fill, edge and ink so the surrounding row stays still.
     The mark is aria-hidden. The full row owns role="checkbox",
     aria-checked, the press and the single tab stop. Check uses the
     check icon name, avoiding the chart kit's tick vocabulary. */

  let { checked = false }: { checked?: boolean } = $props();
</script>

<span class="kit-check" class:is-ticked={checked} aria-hidden="true">
  <!-- The same path, stroke width, cap and join as icons.ts's `check`, so
       the mark on a ticked row and the mark everywhere else in the app
       cannot drift apart. Inlined rather than drawn through Icon because
       the draw below needs the path's own length, and 22 is that length:
       sqrt(50) for the short arm and sqrt(221) for the long one. -->
  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor"
       stroke-width="2" stroke-linecap="round" stroke-linejoin="round" focusable="false">
    <path class="kit-check-mark" d="m4.5 12.5 5 5 10-11" pathLength="22" />
  </svg>
</span>
