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
  /* The appointment debrief offer's deep link (phase 6 ticket 08, rekeyed
     to an appointment id by ticket 58), the same query-param shape
     `seedMood` already has. An empty param is treated as absent rather than
     passed through - the offer's own predicate is the source of truth for
     which appointment this can legitimately be, and a bad param should open
     a blank entry, not a broken one. */
  let debriefForAppointment = $derived.by(() => {
    const raw = page.url.searchParams.get('debriefFor');
    return raw ? raw : undefined;
  });
</script>

{#key epochDay}
  <EntryEditor {epochDay} {seedMood} {debriefForAppointment} />
{/key}
