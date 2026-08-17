<script lang="ts">
  /* On-this-day (phase 4 features ticket 03). One screen, however many of
     the three lookbacks - a month, six months, a year - clear the good-day
     bar today; a lookback that does not clear it is left out entirely
     rather than shown with a caveat (CONTEXT: Good day is an absolute
     rule, not a suggestion).

     Presentation is WrappedCompact (ticket 01), reused rather than
     duplicated: `recap(day, day)` and `dayAverages('mood', day, day)` are
     the same seam a wrapped week reads, just over a range that happens to
     be one day wide. A day's stats are naturally thinner than a week's -
     `bestStreak` rarely rises past 1, `dimChange` needs two dimension-
     carrying entries the same day to say anything - and WrappedCompact
     already leaves an empty section out rather than rendering it hollow,
     which is exactly the right behaviour here too. */
  import { m } from '$lib/paraglide/messages';
  import { fmtDay } from '$lib/data/dates';
  import { todayEpochDay } from '$lib/data/epochDay';
  import { liveQuery } from '$lib/data/live/journal.svelte';
  import { prefs } from '$lib/data/prefs/store.svelte';
  import { smartBack } from '$lib/navigation/smart-back';
  import { recapDimChange, recapTopTags } from '$lib/data/recapDisplay';
  import { onThisDayCandidates, type OnThisDayLookback } from '$lib/data/on-this-day';
  import type { DayAverage, Recap } from '$lib/data/journal/stats';
  import Icon from '$lib/components/Icon.svelte';
  import PrideAurora from '$lib/components/PrideAurora.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';
  import WrappedCompact from '$lib/components/WrappedCompact.svelte';

  const today = todayEpochDay();
  const candidates = onThisDayCandidates(today);

  const LOOKBACK_TITLE: Record<OnThisDayLookback, () => string> = {
    year: () => m.on_this_day_year_title(),
    sixMonths: () => m.on_this_day_six_months_title(),
    month: () => m.on_this_day_month_title()
  };

  interface QualifyingDay {
    key: OnThisDayLookback;
    epochDay: number;
    recap: Recap;
    moodTrend: DayAverage[];
  }

  /* The preference is read inside the query, before the first await, so
     that turning on-this-day off stops the reads themselves rather than
     just hiding what they returned (same rule wrapped's own route
     follows). */
  let daysQuery = liveQuery(['entry', 'tag', 'milestone', 'dimension', 'photo'], async (j) => {
    if (!prefs.onThisDayEnabled) return [];
    const results = await Promise.all(
      candidates.map(async (c): Promise<QualifyingDay | null> => {
        if (!(await j.stats.isGoodDay(c.epochDay))) return null;
        const [recap, moodTrend] = await Promise.all([
          j.stats.recap(c.epochDay, c.epochDay),
          j.stats.dayAverages('mood', c.epochDay, c.epochDay)
        ]);
        return { key: c.key, epochDay: c.epochDay, recap, moodTrend };
      })
    );
    return results.filter((d): d is QualifyingDay => d !== null);
  });

  /* recapDimChange/recapTopTags are the same transform the wrapped route
     applies to its own recap - one per period there, one per day here. */
  let days = $derived(
    (daysQuery.value ?? []).map((d) => ({
      ...d,
      title: LOOKBACK_TITLE[d.key](),
      subtitle: fmtDay(d.epochDay, { day: 'numeric', month: 'long', year: 'numeric' }),
      dimChange: recapDimChange(d.recap),
      topTags: recapTopTags(d.recap)
    }))
  );
</script>

<div class="screen">
  <PrideAurora />
  <header class="screen-header">
    <button class="icon-btn" aria-label={m.back()} onclick={() => smartBack('/')}><Icon name="arrowLeft" /></button>
    <h1 class="screen-title">{m.on_this_day()}</h1>
    <div class="header-action"></div>
  </header>

  {#if !prefs.onThisDayEnabled}
    <div class="notice notice-info" role="status">
      <Icon name="info" size={20} />
      <div class="notice-body">
        <span class="notice-title">{m.on_this_day_off_title()}</span>
        {m.on_this_day_off_body()} <a href="/settings">{m.nav_settings()}</a>
      </div>
    </div>
  {:else if daysQuery.loading}
    <Skeleton variant="block" count={1} />
  {:else if !days.length}
    <div class="notice notice-info" role="status">
      <Icon name="info" size={20} />
      <div class="notice-body">
        <span class="notice-title">{m.on_this_day_none_title()}</span>
        {m.on_this_day_none_body()}
      </div>
    </div>
  {:else}
    {#each days as d (d.key)}
      <section class="on-this-day-day">
        <WrappedCompact
          title={d.title}
          subtitle={d.subtitle}
          recap={d.recap}
          moodTrend={d.moodTrend}
          dimChange={d.dimChange}
          topTags={d.topTags}
        />
      </section>
    {/each}
  {/if}
</div>
