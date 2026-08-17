<script lang="ts">
  /* The wrapped screens (phase 4 features ticket 01). One route for all
     three cadences, because all three ask the journal the same question -
     `recap(from, to)` over a finished period - and differ only in which
     period that is and how the answer is laid out. The layout split is two
     components: WrappedCompact for a week or a month, WrappedYear for a
     year.

     Nothing here is stored and nothing is cached (ADR-0010, CONTEXT:
     Wrapped). Opening this screen recomputes the period from the entries,
     tags, milestones and photos that are in the journal at that moment, so
     editing an entry from last week and coming back shows the edit rather
     than a snapshot taken when the week ended.

     `/recap` is untouched by this. It owns the manual period picker and its
     own step-through presentation; this route is a second reader of the same
     seam, not a replacement for it. */
  import { page } from '$app/state';
  import { m } from '$lib/paraglide/messages';
  import { fmtDay, fmtMonthName } from '$lib/data/dates';
  import { todayEpochDay } from '$lib/data/epochDay';
  import { liveQuery } from '$lib/data/live/journal.svelte';
  import { prefs } from '$lib/data/prefs/store.svelte';
  import { smartBack } from '$lib/navigation/smart-back';
  import { vocabulary } from '$lib/data/vocabulary/vocabulary';
  import {
    WRAPPED_CADENCES,
    WRAPPED_ENTRY_FLOOR,
    completedWrappedPeriod,
    type WrappedCadence
  } from '$lib/data/wrapped';
  import type { DayAverage } from '$lib/data/journal/stats';
  import Icon from '$lib/components/Icon.svelte';
  import PrideAurora from '$lib/components/PrideAurora.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';
  import WrappedCompact from '$lib/components/WrappedCompact.svelte';
  import WrappedYear from '$lib/components/WrappedYear.svelte';

  const today = todayEpochDay();

  /* Validated against the cadences rather than cast: the segment comes out
     of a URL, which a bookmark, a typo or an old link can put anything in. */
  let cadence = $derived(
    (WRAPPED_CADENCES as readonly string[]).includes(page.params.cadence ?? '')
      ? (page.params.cadence as WrappedCadence)
      : null
  );
  let period = $derived(cadence ? completedWrappedPeriod(cadence, today) : null);

  /* Home offers one cadence - whichever is freshest - so without this the
     other two screens would exist and be linked from nowhere, which is the
     regression SH-001 already fixed once for Timeline. Ordered shortest
     first, the way a person thinks about looking back. */
  const CADENCE_TABS: { key: WrappedCadence; label: () => string }[] = [
    { key: 'week', label: () => m.wrapped_cadence_week() },
    { key: 'month', label: () => m.wrapped_cadence_month() },
    { key: 'year', label: () => m.wrapped_cadence_year() }
  ];

  /* The preference is read inside the query rather than around it, so that
     turning wrapped off stops the read itself: `run` is called synchronously,
     which makes `prefs.wrappedEnabled` a dependency, and the branch means no
     recap SQL is ever issued while it is false. Home goes further and does
     not mount its card at all. */
  let recapQuery = liveQuery(['entry', 'tag', 'milestone', 'dimension', 'photo'], (j) =>
    prefs.wrappedEnabled && period ? j.stats.recap(period.start, period.end) : Promise.resolve(null)
  );
  let recap = $derived(recapQuery.value);

  let moodTrendQuery = liveQuery(['entry'], (j) =>
    prefs.wrappedEnabled && period
      ? j.stats.dayAverages('mood', period.start, period.end)
      : Promise.resolve([])
  );
  let moodTrend = $derived((moodTrendQuery.value ?? []) as DayAverage[]);

  /* A month and a week are named differently rather than through one
     sentence with the period injected: Polish inflects the month name, and
     the week is named by its two dates instead of by a noun at all
     (docs/ui-copy.md). */
  let title = $derived.by(() => {
    if (!period) return m.wrapped();
    if (period.cadence === 'week') return m.wrapped_week_title();
    if (period.cadence === 'month')
      return m.wrapped_month_title({ month: fmtMonthName(period.year, period.month ?? 0) });
    return m.wrapped_year_title({ year: String(period.year) });
  });
  let subtitle = $derived.by(() => {
    if (!period) return '';
    if (period.cadence === 'week') {
      return m.wrapped_week_range({
        from: fmtDay(period.start, { day: 'numeric', month: 'short' }),
        to: fmtDay(period.end, { day: 'numeric', month: 'short' })
      });
    }
    return period.cadence === 'month' ? m.wrapped_month_intro() : m.wrapped_year_intro();
  });

  /* Both templates take the dimension and the tags already named, so neither
     of them has to know that a built-in tag stores a key and takes its
     wording from the catalogue at display time (ticket 05). */
  let dimChange = $derived.by(() => {
    const change = recap?.biggestDimensionChange;
    if (!change) return null;
    return {
      name: vocabulary.dimensions.find((d) => d.key === change.key)?.name ?? change.key,
      from: change.from,
      to: change.to
    };
  });
  let topTags = $derived(
    (recap?.topTags ?? []).map((t) => ({ label: vocabulary.tag(t.id)?.label ?? t.id, count: t.count }))
  );
</script>

<div class="screen">
  <PrideAurora />
  <header class="screen-header">
    <button class="icon-btn" aria-label={m.back()} onclick={() => smartBack('/')}><Icon name="arrowLeft" /></button>
    <h1 class="screen-title">{m.wrapped()}</h1>
    <div class="header-action"></div>
  </header>

  {#if prefs.wrappedEnabled && cadence}
    <!-- Links rather than buttons, and a nav rather than a radiogroup: each
         cadence is its own screen at its own URL, so switching between them
         is navigation and belongs in history. `/recap`'s picker is a
         radiogroup because it changes one screen's range in place. -->
    <nav class="segmented wrapped-cadences" aria-label={m.wrapped_cadence_group()}>
      {#each CADENCE_TABS as tab (tab.key)}
        <a
          class="segment"
          class:is-active={cadence === tab.key}
          aria-current={cadence === tab.key ? 'page' : undefined}
          href="/wrapped/{tab.key}">{tab.label()}</a
        >
      {/each}
    </nav>
  {/if}

  {#if !prefs.wrappedEnabled}
    <div class="notice notice-info" role="status">
      <Icon name="info" size={20} />
      <div class="notice-body">
        <span class="notice-title">{m.wrapped_off_title()}</span>
        {m.wrapped_off_body()} <a href="/settings">{m.nav_settings()}</a>
      </div>
    </div>
  {:else if !period}
    <div class="notice notice-info" role="status">
      <Icon name="info" size={20} />
      <div class="notice-body">
        <span class="notice-title">{m.wrapped_unknown_title()}</span>
        {m.wrapped_unknown_body()}
      </div>
    </div>
    <!-- Held whole rather than filled in as the two queries land, for the
         reason /recap holds its own: every figure below is a number, and a
         0 that becomes 31 a moment later reads as a wrong answer rather than
         a pending one. -->
  {:else if recapQuery.loading || moodTrendQuery.loading}
    <Skeleton variant="block" count={1} />
  {:else if !recap || recap.entryCount < WRAPPED_ENTRY_FLOOR}
    <!-- The same floor Home applies before offering the card. Reachable
         anyway through a bookmark or a hand-typed URL, and saying why is
         better than a screen of zeroes. -->
    <div class="wrapped-thin">
      <h2 class="wrapped-title">{m.wrapped_thin_title()}</h2>
      <p class="muted">
        {m.wrapped_thin_body({ count: recap?.entryCount ?? 0, floor: String(WRAPPED_ENTRY_FLOOR) })}
      </p>
    </div>
  {:else if cadence === 'year'}
    <WrappedYear
      year={period.year}
      intro={subtitle}
      {recap}
      {moodTrend}
      {dimChange}
      {topTags}
    />
  {:else}
    <WrappedCompact {title} {subtitle} {recap} {moodTrend} {dimChange} {topTags} />
  {/if}
</div>
