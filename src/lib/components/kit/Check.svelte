<script lang="ts">
  /* The box on a tickable row (phase 5 ticket 35).

     Named Check after the mark it draws, which is `check` in icons.ts. Not
     Tick: the chart kit owns that word for the axis furniture it refuses to
     draw, and a `.kit-*tick` class fails kit-surfaces.test.ts.

     A rounded square and never a circle. A circle is a radio button in every
     reference there is, and "pick exactly one of these" is the signal this
     ticket exists to remove from the screen where somebody chooses which
     scales they log.

     It carries the row's state on its own, and the row around it does not
     change. Three of five rows filled with a soft accent wash would be a
     loud card and a hard one to scan; a filled box against an outlined one
     is the difference a checkbox is for. Ticked wears exactly the treatment
     `.tag-chip.is-selected` wears - soft fill, accent edge, `--on-accent-soft`
     ink - because that is this app's settled answer for a control that is
     on, and it is already proven across the eight palettes on both themes.

     Decoration, not a control: `aria-hidden`, no tab stop, no press handler
     of its own. The row is the checkbox and carries `role="checkbox"` and
     `aria-checked`, so the whole width of the row is the target and a
     keyboard gets one stop per scale rather than two. */

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
