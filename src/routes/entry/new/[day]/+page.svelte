<script lang="ts">
  import { page } from '$app/state';
  import EntryEditor from '$lib/components/EntryEditor.svelte';
  import { todayEpochDay } from '$lib/data/epochDay';

  let epochDay = $derived(
    page.params.day === 'today' ? todayEpochDay() : Number(page.params.day)
  );
  let seedMood = $derived.by(() => {
    const raw = page.url.searchParams.get('seedMood');
    if (raw == null) return null;
    const mood = Number(raw);
    return Number.isInteger(mood) && mood >= 1 && mood <= 5 ? mood : null;
  });
</script>

{#key epochDay}
  <EntryEditor {epochDay} {seedMood} />
{/key}
