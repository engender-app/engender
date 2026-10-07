<script lang="ts">
  import { page } from '$app/state';
  import EntryEditor from '$lib/components/EntryEditor.svelte';
  import { m } from '$lib/paraglide/messages';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import Notice from '$lib/components/kit/Notice.svelte';
  import { parseDayParam } from '$lib/data/dayParam';
  import { currentDay } from '$lib/stores/today.svelte';
  import { untrack } from 'svelte';
  import { isEntrySection } from '$lib/data/entrySections';

  /* `today` in the address is resolved when the address changes, not at
     midnight: the editor below is keyed by this day, and moving it would
     throw away what is being written. */
  let epochDay = $derived(parseDayParam(page.params.day, untrack(currentDay)));
  let available = $derived(epochDay !== null && epochDay <= currentDay());
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
  /* A chip section to open on arrival (after-release 27, audit UX-03):
     Getting started and the empty photo library send a first photo here
     with Photos already open, since the library itself owns no photos
     (ADR-0085). Anything that is not a section name opens nothing. */
  let openSection = $derived.by(() => {
    const raw = page.url.searchParams.get('open');
    return isEntrySection(raw) ? raw : undefined;
  });
  let debriefForAppointment = $derived.by(() => {
    const raw = page.url.searchParams.get('debriefFor');
    return raw ? raw : undefined;
  });
</script>

{#if available && epochDay !== null}
  {#key epochDay}
    <EntryEditor {epochDay} {seedMood} {debriefForAppointment} {openSection} />
  {/key}
{:else}
  <div class="screen" data-screen>
    <ScreenHeader title={m.new_entry()} screen="entry" back="/calendar" />
    <Notice key="entry-unavailable" title={m.source_record_unavailable()} />
  </div>
{/if}
