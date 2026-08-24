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
  /* Quick add's photo option (phase 5 ticket 18, spec 04). A photo is
     recorded on an entry, so the surface that records one is this editor,
     and "seeded where the surface supports seeding" means opening it with
     the picker already up rather than making the person find the button.

     Deliberately not in src/lib/android/fixtures/launch-routes.json: that
     fixture is the allowlist for routes an outside intent may deep-link to
     (ADR-0028), and this param is reached from inside the app only. The
     fixture is untouched by this ticket. */
  let seedPhoto = $derived(page.url.searchParams.get('seedPhoto') === '1');
</script>

{#key epochDay}
  <EntryEditor {epochDay} {seedMood} {seedPhoto} />
{/key}
