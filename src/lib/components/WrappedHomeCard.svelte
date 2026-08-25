<script lang="ts">
  /* Home's link into a wrapped (phase 4 features ticket 01).

     One card, for the longest cadence still inside its freshness window -
     the ranking lives in wrapped.ts, where it can be checked against a
     calendar without a browser. Home shows the year through January, last
     month for the first fortnight of a month, and last week the rest of the
     time.

     Rendered only when wrapped is on: Home gates on the preference before
     mounting this, so the query below does not exist while the feature is
     off. That is the difference the ticket asks for between turning a
     feature off and hiding its card.

     The entry floor is applied here rather than in the wrapped screen's
     favour, because "there is not enough in last week to be worth reading"
     is a reason to say nothing on Home, not a reason to offer a card that
     apologises when you open it.

     One of Home's two look-back tiles since phase 5 ticket 21, where it was
     a full-width card with a gradient wash. The gradient is gone with every
     other one, and the tile is what DIRECTION.md's slop audit left standing:
     an offer that carries its own data and no icon disc - the count is the
     reading, drawn at display size with the flag as a bar under it, and
     `wrapped_stat_entries` is the label the wrapped screen already puts on
     that same number. Its sibling is
     OnThisDayHomeCard, and the two share nothing but the grid they sit in -
     each keeps its own preference gate, its own query and its own floor,
     which is what lets one be silenced without touching the other. */
  import { m } from '$lib/paraglide/messages';
  import { fmtMonthName } from '$lib/data/dates';
  import { todayEpochDay } from '$lib/data/epochDay';
  import { liveQuery } from '$lib/data/live/journal.svelte';
  import { WRAPPED_ENTRY_FLOOR, offeredWrappedPeriod } from '$lib/data/wrapped';
  import Tile from './kit/Tile.svelte';

  const period = offeredWrappedPeriod(todayEpochDay());

  /* The recap seam, the same one the wrapped screen reads, so the count on
     the card and the count on the screen cannot disagree. Invalidated on
     entry writes only: `entryCount` is the one field this card uses, and
     attaching a photo or renaming a milestone cannot change it. */
  let recapQuery = liveQuery(['entry'], (j) => j.stats.recap(period.start, period.end));
  let entryCount = $derived(recapQuery.value?.entryCount ?? 0);

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
{#if !recapQuery.loading && entryCount >= WRAPPED_ENTRY_FLOOR}
  <Tile
    {title}
    value={String(entryCount)}
    note={m.wrapped_stat_entries()}
    href={`/wrapped/${period.cadence}`}
    key="wrapped"
    data-wrapped-card=""
  />
{/if}
