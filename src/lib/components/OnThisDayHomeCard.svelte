<script lang="ts">
  /* Home's link into on-this-day (phase 4 features ticket 03).

     One card for however many of the three lookbacks qualify today - the
     ticket does not ask for exactly one, and ranking them the way wrapped
     ranks cadences would invent an ordering rule this feature has no use
     for. The good-day check for each lookback is the only thing this card
     needs to know before deciding whether to show itself at all.

     Rendered only when on-this-day is on: Home gates on the preference
     before mounting this, so the query below does not exist while the
     feature is off - the same split wrapped's own card makes. */
  import { m } from '$lib/paraglide/messages';
  import { todayEpochDay } from '$lib/data/epochDay';
  import { liveQuery } from '$lib/data/live/journal.svelte';
  import { onThisDayCandidates } from '$lib/data/on-this-day';
  import Icon from './Icon.svelte';

  const candidates = onThisDayCandidates(todayEpochDay());

  /* Invalidated on entry or tag writes: those are the only two things the
     good-day rule reads (day average mood, the euphoria tag). */
  let goodDaysQuery = liveQuery(['entry', 'tag'], async (j) => {
    const results = await Promise.all(candidates.map((c) => j.stats.isGoodDay(c.epochDay)));
    return candidates.filter((_, i) => results[i]);
  });
  let qualifying = $derived(goodDaysQuery.value ?? []);
</script>

<!-- No skeleton while the check is on its way, for the same reason
     wrapped's card has none: an offer that flickers into place is worse
     than one that arrives a moment late. -->
{#if !goodDaysQuery.loading && qualifying.length}
  <a class="card spread on-this-day-home-card" href="/on-this-day" data-on-this-day-card>
    <span class="on-this-day-home-mark"><Icon name="clock" size={20} /></span>
    <span class="row-text">
      <span class="row-title">{m.on_this_day()}</span>
      <span class="row-subtitle">{m.on_this_day_home_sub()}</span>
    </span>
    <Icon name="chevronRight" size={20} />
  </a>
{/if}
