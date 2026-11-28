<script lang="ts">
  /* Share the mark and name across printed surfaces. Keep the mark's integral square stroke
     in one ink and use the paper as its ground. Omit the entire letterhead under disguise.
     app.css shows print-heading only when printing. */
  import Mark from './Mark.svelte';
  import { appWordmark } from '$lib/disguise/identity';
  import { m } from '$lib/paraglide/messages';
  import { prefs } from '$lib/data/prefs/store.svelte';

  let { size = 32 }: { size?: number } = $props();
</script>

{#if !prefs.disguise}
  <div class="print-lockup lockup">
    <Mark {size} mono />
    <span class="lockup-word" translate="no">{appWordmark(prefs.disguise, m.app_name(), m.disguise_name())}</span>
  </div>
{/if}
