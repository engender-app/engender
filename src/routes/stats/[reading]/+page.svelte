<script lang="ts">
  /* One reading of the Look back door, on a screen of its own (phase 11
     ticket 07). The door is a grid of tiles, each stating one figure for
     the span; this is where the full card draws, with its controls - the
     second scale, the metric picker, the words card's era and mode picker,
     the constellation's scrub and play. Seven readings share the route,
     since they are one screen showing a different card and nothing about
     the header, the span or the floor differs between them.

     The span comes in on the query the tile wrote (lookBackReadings.ts,
     the same `from`/`to` /wrapped/range and /body-map read), and is
     written under the title in the rail's own words, so the screen says
     what it is a reading of. A direct visit with no query, or a key no
     reading answers to, says so rather than drawing the wrong thing.

     `page.params.reading` is read as a derived value and not captured
     once: SvelteKit reuses this component across a same-route navigation
     between two keys, and a plain const would go stale. */
  import { page } from '$app/state';
  import { m } from '$lib/paraglide/messages';
  import { todayEpochDay } from '$lib/data/epochDay';
  import { liveQuery } from '$lib/data/live/journal.svelte';
  import { isReading, spanFromSearch, type Reading } from '$lib/data/lookBackReadings';
  import { spanLabel } from '$lib/data/spanLabel';
  import { WRAPPED_ENTRY_FLOOR } from '$lib/data/wrapped';
  import { crossfade } from '$lib/motion/reveal';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';
  import Notice from '$lib/components/kit/Notice.svelte';
  import WordsReading from '$lib/components/WordsReading.svelte';
  import DayByDayReading from '$lib/components/readings/DayByDayReading.svelte';
  import DaysReading from '$lib/components/readings/DaysReading.svelte';
  import HighestReading from '$lib/components/readings/HighestReading.svelte';
  import PlaneReading from '$lib/components/readings/PlaneReading.svelte';
  import TagsReading from '$lib/components/readings/TagsReading.svelte';
  import ThemesReading from '$lib/components/readings/ThemesReading.svelte';

  const TITLE: Record<Reading, () => string> = {
    'day-by-day': () => m.stats_day_by_day(),
    plane: () => m.stats_constellation(),
    days: () => m.stats_reading_days(),
    words: () => m.words_reading_title(),
    tags: () => m.stats_tags_moved(),
    highest: () => m.stats_highest_days(),
    themes: () => m.safe_space_chart_themes_title()
  };

  let today = $derived(todayEpochDay());
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
    subtitle={reading ? label : undefined}
    screen={reading ? `stats-${reading}` : 'stats-reading'}
    back="/stats"
  />

  {#if !reading}
    <Notice
      icon="info"
      key="stats-reading-unknown"
      title={m.stats_reading_unknown_title()}
      text={m.stats_reading_unknown_body()}
      action={{ label: m.nav_lookback(), href: '/stats' }}
    />
  {:else if recapQuery.loading}
    <div out:crossfade><Skeleton variant="block" count={1} /></div>
  {:else if reading === 'day-by-day'}
    <DayByDayReading {span} {today} {enoughEntries} />
  {:else if reading === 'plane'}
    <PlaneReading {span} />
  {:else if reading === 'days'}
    <DaysReading {span} {enoughEntries} />
  {:else if reading === 'words'}
    <WordsReading />
  {:else if reading === 'tags'}
    <TagsReading {span} spanLabel={label} />
  {:else if reading === 'highest'}
    <HighestReading {span} {today} {enoughEntries} />
  {:else}
    <ThemesReading {span} />
  {/if}
</div>
