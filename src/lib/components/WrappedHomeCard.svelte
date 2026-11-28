<script lang="ts">
  /* Use wrapped.ts to select the longest cadence still fresh. Year runs
     through January, last month through the first fortnight, then last week.
     Apply the entry floor before rendering. Home checks the preference
     before mounting so a disabled Wrapped issues no query. OnThisDayHomeCard
     has its own gate, query and floor. */
  import { m } from '$lib/paraglide/messages';
  import { fmtMonthName } from '$lib/data/dates';
  import { currentDay } from '$lib/stores/today.svelte';
  import { liveQuery, liveQueryWatchingOnly } from '$lib/data/live/journal.svelte';
  import { WRAPPED_ENTRY_FLOOR, offeredWrappedPeriod } from '$lib/data/wrapped';
  import { resurfacing } from '$lib/unprompted/resurfacing';
  import Tile from './kit/Tile.svelte';
  import { joinReadGroup } from './kit/readGroup.svelte';

  const period = $derived(offeredWrappedPeriod(currentDay()));

  let consentQuery = liveQuery((j) => resurfacing('wrapped-home-card', j));
  let allowed = $derived(consentQuery.value?.mayResurface(period) ?? false);

  /* The recap seam, the same one the wrapped screen reads, so the count on
     the card and the count on the screen cannot disagree. Narrowed to entry
     writes on purpose, which is why this asks for its tables where no other
     screen does: a recap reads dimension values, tags, milestones and photos
     too, and `entryCount` is the one field this card uses - attaching a photo
     or renaming a milestone cannot change it. */
  let recapQuery = liveQueryWatchingOnly(['entry'], (j) =>
    allowed ? j.stats.recap(period.start, period.end) : Promise.resolve(null)
  );
  let entryCount = $derived(recapQuery.value?.entryCount ?? 0);
  /* Whether there is a card is settled once these answer (ReadGroup). */
  joinReadGroup(() => !recapQuery.loading && !consentQuery.loading);

  let title = $derived(
    period.cadence === 'week'
      ? m.wrapped_home_week()
      : period.cadence === 'month'
        ? m.wrapped_home_month({ month: fmtMonthName(period.year, period.month ?? 0) })
        : m.wrapped_home_year({ year: String(period.year) })
  );
</script>

<!-- No skeleton while the count is on its way: this card is an offer, and an
     offer that flickers into place is worse than one that arrives a moment
     late. -->
{#if allowed && !recapQuery.loading && entryCount >= WRAPPED_ENTRY_FLOOR}
  <Tile
    {title}
    value={String(entryCount)}
    note={m.wrapped_stat_entries()}
    href={`/wrapped/${period.cadence}`}
    key="wrapped"
    data-wrapped-card=""
  />
{/if}
