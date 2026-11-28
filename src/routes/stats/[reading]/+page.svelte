<script lang="ts">
  /* Four readings share the span, header and entry floor. Read from/to
     from the tile's query (lookBackReadings.ts). Report a missing span
     or unsupported reading key. Derive page.params.reading because
     SvelteKit reuses this component across reading keys. */
  import { page } from '$app/state';
  import { m } from '$lib/paraglide/messages';
  import { currentDay } from '$lib/stores/today.svelte';
  import { liveQuery } from '$lib/data/live/journal.svelte';
  import { isReading, spanFromSearch, type Reading } from '$lib/data/lookBackReadings';
  import { spanLabel } from '$lib/data/spanLabel';
  import { WRAPPED_ENTRY_FLOOR } from '$lib/data/wrapped';
  import { crossfade, resize } from '$lib/motion/reveal';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';
  import Notice from '$lib/components/kit/Notice.svelte';
  import ReadGroup from '$lib/components/kit/ReadGroup.svelte';
  import { vocabulary } from '$lib/data/vocabulary/vocabulary';
  import DayByDayReading from '$lib/components/readings/DayByDayReading.svelte';
  import PlaneReading from '$lib/components/readings/PlaneReading.svelte';
  import TagsReading from '$lib/components/readings/TagsReading.svelte';
  import CostReading from '$lib/components/readings/CostReading.svelte';

  const TITLE: Record<Reading, () => string> = {
    'day-by-day': () => m.stats_day_by_day(),
    plane: () => m.stats_constellation(),
    tags: () => m.stats_tags_moved(),
    cost: () => m.stats_cost()
  };

  let today = $derived(currentDay());
  let key = $derived(page.params.reading);
  let reading = $derived<Reading | null>(isReading(key) ? key : null);
  let span = $derived(spanFromSearch(page.url.searchParams, today));
  let label = $derived(spanLabel(span, today));

  /* The one floor every summary panel shares, read once here and handed
     down (WRAPPED_ENTRY_FLOOR, the bar a retrospective clears). */
  let recapQuery = liveQuery((j) => j.stats.recap(span.start, span.end));
  let enoughEntries = $derived((recapQuery.value?.entryCount ?? 0) >= WRAPPED_ENTRY_FLOOR);
</script>

<div class="screen">
  <ScreenHeader
    title={reading ? TITLE[reading]() : m.nav_lookback()}
    screen={reading ? `stats-${reading}` : 'stats-reading'}
    back="/stats"
  />

  <!-- One placeholder from the first frame to the card. The
       screen waits on the recap, then mounts the reading, whose own reads
       used to show through as they settled: its chart card's own skeleton,
       then "Not enough data in this range yet." at full opacity for three
       or four frames on a journal with months of data, then the chart. The
       vocabulary mirror is waited on too, since the readings pick their
       scales from it. The reading now
       mounts inside a ReadGroup whose skeleton is the same block as the
       screen's own, so the two skeletons hand over without a visible
       change and the card fades in once, whole.

       Mounting the reading at once, in parallel with the recap, was tried
       and measured slower on the phone - the card at 600-820ms against
       185-290ms - because every read shares one SQLite worker and the
       recap then queued behind the reading's own. -->
  <div class="screen-part" use:resize>
  {#if !reading}
    <Notice
      icon="info"
      key="stats-reading-unknown"
      title={m.stats_reading_unknown_title()}
      action={{ label: m.nav_lookback(), href: '/stats' }}
    />
  {:else if recapQuery.loading}
    <div out:crossfade><Skeleton variant="block" count={1} /></div>
  {:else}
  <!-- Keyed: SvelteKit reuses this page between two readings, and a group
       is one-way, so the second reading would otherwise arrive through a
       group that had already shown. -->
  {#key reading}
  <ReadGroup answered={vocabulary.ready}>
  {#if reading === 'day-by-day'}
    <DayByDayReading {span} {today} {enoughEntries} />
  {:else if reading === 'plane'}
    <PlaneReading {span} />
  {:else if reading === 'tags'}
    <TagsReading {span} spanLabel={label} {enoughEntries} />
  {:else}
    <CostReading {span} />
  {/if}
  </ReadGroup>
  {/key}
  {/if}
  </div>
</div>
