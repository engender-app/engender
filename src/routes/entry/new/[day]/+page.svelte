<script lang="ts">
  import { page } from '$app/state';
  import EntryEditor from '$lib/components/EntryEditor.svelte';
  import { todayEpochDay } from '$lib/data/db.svelte';

  let epochDay = $derived(
    page.params.day === 'today' ? todayEpochDay() : Number(page.params.day)
  );
</script>

{#key epochDay}
  <EntryEditor {epochDay} />
{/key}
