<script lang="ts">
  /* What a printed page says about where it came from: the mark and the
     name, together (ticket 50, Alicja 2026-09-21). Both printing surfaces
     take it - the clinician summary, which goes to a stranger, and the
     journal book, which is a keepsake somebody may still be holding years
     from now. Neither is a screen: a reader has no tab strip, no launcher
     and no About sheet to look the app up in, so the sheet has to name
     itself.

     One ink, and the mark's own edge is that ink. There is no variant of
     the mark without its square - "THE STROKE IS AN INTEGRAL PART OF THE
     LOGO! THERE IS NO LOGO WITHOUT THE STROKE!" - so the printed mark is
     the same drawing as the icon, in one colour, with no ground under it
     because paper is the ground.

     Absent under disguise, name included, leaving each page its own title
     in type (ADR-0014). A letterhead reading "Notes" over a clinical
     summary would be a stranger thing than none, and this is the surface
     that most obviously leaves the device.

     Print-only: `.print-heading`, which is where both callers put it, is
     display:none until app.css's print block turns it on. */
  import Mark from './Mark.svelte';
  import { m } from '$lib/paraglide/messages';
  import { prefs } from '$lib/data/prefs/store.svelte';

  let { size = 36 }: { size?: number } = $props();
</script>

{#if !prefs.disguise}
  <div class="print-lockup">
    <Mark {size} mono />
    <span translate="no">{m.app_name()}</span>
  </div>
{/if}
