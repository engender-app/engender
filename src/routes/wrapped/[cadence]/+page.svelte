<script lang="ts">
  /* The wrapped screens (phase 4 features ticket 01, rebuilt by phase 5 UX
     ticket 23, which also closes specs 06 and 07).

     One route for four views. Three of them are the completed cadences -
     all three ask the journal the same question, `recap(from, to)` over a
     finished period, and differ only in which period that is and how the
     answer is laid out. The fourth is `range`, an arbitrary period somebody
     picked, which is what the deleted `/recap` screen used to be: it read
     the same seam, had no gate and no floor, and stepped through a carousel.
     Wrapped is the survivor because it has a name in the glossary, a card on
     Home, notifications, a share card and an Android launch route, and
     because recap re-implemented display logic this route already had.

     A range gets the gate and the floor too. A person who has turned
     wrapped off has said they do not want a retrospective, and a second
     surface quietly ignoring that was a bug rather than a feature.

     Nothing here is stored and nothing is cached (ADR-0010, CONTEXT:
     Wrapped). Opening this screen recomputes the period from the entries,
     tags, milestones and photos in the journal at that moment, so editing an
     entry from last week and coming back shows the edit rather than a
     snapshot taken when the week ended. That is still true of the four extra
     reads spec 06 adds.

     The layout split is two components: WrappedCompact for a week, a month
     or a range, WrappedYear for a year. */
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { m } from '$lib/paraglide/messages';
  import { fmtDay, fmtDuration, fmtMonthName } from '$lib/data/dates';
  import { calendarDuration, dateInputValueFromEpochDay, todayEpochDay } from '$lib/data/epochDay';
  import { liveQuery } from '$lib/data/live/journal.svelte';
  import { prefs } from '$lib/data/prefs/store.svelte';
  import { metricKey } from '$lib/data/prefs/catalogue';
  import { vocabulary } from '$lib/data/vocabulary/vocabulary';
  import { smartBack } from '$lib/navigation/smart-back';
  import { nameTagInsights, recapDimChange, recapTopTags } from '$lib/data/recapDisplay';
  import { wrappedStreaks, wrappedTagInsights, wrappedTallyCounts } from '$lib/data/wrappedSections';
  import {
    WRAPPED_RANGE_CHOICES,
    parseWrappedRangeParams,
    resolveWrappedRange,
    wrappedRangeCadence,
    wrappedRangeQuery,
    type WrappedRangeChoice
  } from '$lib/data/wrappedRange';
  import {
    WRAPPED_CADENCES,
    WRAPPED_ENTRY_FLOOR,
    completedWrappedPeriod,
    type WrappedCadence
  } from '$lib/data/wrapped';
  import type { DayAverage } from '$lib/data/journal/stats';
  import Icon from '$lib/components/Icon.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import Sheet from '$lib/components/Sheet.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import ListRow from '$lib/components/kit/ListRow.svelte';
  import Notice from '$lib/components/kit/Notice.svelte';
  import WrappedCompact from '$lib/components/WrappedCompact.svelte';
  import WrappedYear from '$lib/components/WrappedYear.svelte';

  const today = todayEpochDay();
  const todayInput = dateInputValueFromEpochDay(today);

  /* Validated against the cadences rather than cast: the segment comes out
     of a URL, which a bookmark, a typo or an old link can put anything in.
     `range` is a fourth accepted segment and not a cadence - a cadence names
     a completed calendar period, and the launcher's own allow-list
     (android/launch-routes.ts) still accepts exactly the three. */
  let view = $derived(page.params.cadence ?? '');
  let cadence = $derived(
    (WRAPPED_CADENCES as readonly string[]).includes(view) ? (view as WrappedCadence) : null
  );
  let isRange = $derived(view === 'range');

  /* The picked range lives in the URL rather than in component state, the
     same way a cadence does, so it survives a reload, a back gesture and a
     shared link. */
  let picked = $derived(
    parseWrappedRangeParams(
      page.url.searchParams.get('named'),
      page.url.searchParams.get('from'),
      page.url.searchParams.get('to'),
      today
    )
  );

  let period = $derived(cadence ? completedWrappedPeriod(cadence, today) : null);
  let range = $derived(isRange ? picked.range : period ? { start: period.start, end: period.end } : null);

  /* The four tabs. Ordered shortest first, the way a person thinks about
     looking back, with the arbitrary range last because it is the one that
     asks a question rather than naming a period.

     Home offers one cadence - whichever is freshest - so without this the
     other views would exist and be linked from nowhere, which is the
     regression SH-001 already fixed once for Timeline. */
  const VIEW_TABS: { key: string; label: () => string }[] = [
    { key: 'week', label: () => m.wrapped_cadence_week() },
    { key: 'month', label: () => m.wrapped_cadence_month() },
    { key: 'year', label: () => m.wrapped_cadence_year() },
    { key: 'range', label: () => m.wrapped_cadence_range() }
  ];

  const RANGE_LABEL: Record<WrappedRangeChoice, () => string> = {
    prevMonth: () => m.recap_period_previous_month(),
    prevYear: () => m.recap_period_previous_year(),
    d7: () => m.recap_period_7d(),
    d30: () => m.recap_period_30d(),
    d90: () => m.recap_period_90d(),
    ytd: () => m.recap_period_ytd(),
    custom: () => m.recap_period_custom()
  };

  let rangePicker = $state(false);
  /* Bound to the two date fields while the sheet is open. Seeded from the
     URL so reopening the sheet on a custom range shows the range that is
     on screen rather than two empty fields. */
  let customStart = $state('');
  let customEnd = $state('');
  $effect(() => {
    customStart = picked.customStart;
    customEnd = picked.customEnd;
  });

  function chooseRange(choice: WrappedRangeChoice) {
    /* Two of the seven are periods that already have a screen. Sending the
       person there rather than drawing the same period a second way is what
       keeps one period at one URL. */
    const goesToCadence = wrappedRangeCadence(choice);
    if (goesToCadence) {
      rangePicker = false;
      goto(`/wrapped/${goesToCadence}`);
      return;
    }
    if (choice === 'custom') {
      /* The custom range needs both boundaries, so the sheet stays open on
         the fields until it has them. */
      if (!resolveWrappedRange('custom', today, { start: customStart, end: customEnd })) {
        goto(`/wrapped/range${wrappedRangeQuery('custom', { start: customStart, end: customEnd })}`, {
          replaceState: true,
          keepFocus: true,
          noScroll: true
        });
        return;
      }
      rangePicker = false;
      goto(`/wrapped/range${wrappedRangeQuery('custom', { start: customStart, end: customEnd })}`);
      return;
    }
    rangePicker = false;
    goto(`/wrapped/range${wrappedRangeQuery(choice)}`);
  }

  /* The preference is read inside every query rather than around them, so
     that turning wrapped off stops the reads themselves: `run` is called
     synchronously, which makes `prefs.wrappedEnabled` a dependency, and the
     branch means no SQL is ever issued while it is false. Home goes further
     and does not mount its card at all. */
  let on = $derived(prefs.wrappedEnabled);

  let recapQuery = liveQuery(['entry', 'tag', 'milestone', 'dimension', 'photo'], (j) =>
    on && range ? j.stats.recap(range.start, range.end) : Promise.resolve(null)
  );
  let recap = $derived(recapQuery.value);

  let moodTrendQuery = liveQuery(['entry'], (j) =>
    on && range ? j.stats.dayAverages('mood', range.start, range.end) : Promise.resolve([])
  );
  let moodTrend = $derived((moodTrendQuery.value ?? []) as DayAverage[]);

  /* The four reads spec 06 adds. Tag insights follow the selected metric,
     the same one the stats hub's own insight card reads: which scale "better
     or worse days" is measured on is one preference with one control, and it
     is set on the screen that draws the scales. */
  let insightsQuery = liveQuery(['entry', 'tag'], (j) =>
    on && range ? j.stats.tagInsights(metricKey(prefs), range.start, range.end) : Promise.resolve([])
  );

  let tallyQuery = liveQuery(['tally'], async (j) => {
    if (!on || !range) return null;
    const [misgendered, correctlyGendered] = await Promise.all([
      j.stats.tallyTrend('misgendered', range.start, range.end),
      j.stats.tallyTrend('correctly_gendered', range.start, range.end)
    ]);
    return { misgendered, correctlyGendered };
  });

  let bestEverQuery = liveQuery(['entry'], (j) =>
    on ? j.stats.bestStreakEver(today) : Promise.resolve(0)
  );

  let insights = $derived(nameTagInsights(wrappedTagInsights(insightsQuery.value ?? []) ?? []));
  let tally = $derived(
    tallyQuery.value ? wrappedTallyCounts(tallyQuery.value.misgendered, tallyQuery.value.correctlyGendered) : null
  );
  let streaks = $derived(recap ? wrappedStreaks(recap, bestEverQuery.value ?? 0) : null);

  /* Both templates take the dimension and the tags already named, so neither
     of them has to know that a built-in tag stores a key and takes its
     wording from the catalogue at display time (ticket 05). */
  let dimChange = $derived(recap ? recapDimChange(recap) : null);
  let topTags = $derived(recap ? recapTopTags(recap) : []);

  /* A month, a week and a range are named differently rather than through
     one sentence with the period injected: Polish inflects the month name,
     and the week is named by its two dates instead of by a noun at all
     (docs/ui-copy.md). */
  let rangeName = $derived(
    picked.choice === 'custom' && picked.range
      ? `${fmtDay(picked.range.start, { day: 'numeric', month: 'short' })} - ${fmtDay(picked.range.end, {
          day: 'numeric',
          month: 'short'
        })}`
      : RANGE_LABEL[picked.choice]()
  );

  let title = $derived.by(() => {
    if (isRange) return m.recap_range_title({ period: rangeName });
    if (!period) return m.wrapped();
    if (period.cadence === 'week') return m.wrapped_week_title();
    if (period.cadence === 'month')
      return m.wrapped_month_title({ month: fmtMonthName(period.year, period.month ?? 0) });
    return m.wrapped_year_title({ year: String(period.year) });
  });

  let subtitle = $derived.by(() => {
    if (isRange) {
      return range
        ? m.wrapped_week_range({
            from: fmtDay(range.start, { day: 'numeric', month: 'short' }),
            to: fmtDay(range.end, { day: 'numeric', month: 'short' })
          })
        : m.recap_open_range();
    }
    if (!period) return '';
    if (period.cadence === 'week') {
      return m.wrapped_week_range({
        from: fmtDay(period.start, { day: 'numeric', month: 'short' }),
        to: fmtDay(period.end, { day: 'numeric', month: 'short' })
      });
    }
    return period.cadence === 'month' ? m.wrapped_month_intro() : m.wrapped_year_intro();
  });

  /* The share button (ticket 18) only appears once there is a real wrapped
     on screen to share - the same floor the content below it is gated on, so
     the button never opens onto the "not much to look back on yet" notice or
     the off/unknown states. Cadences only: the share screen builds its card
     from a completed period it resolves itself (spec 07 leaves the share
     card unchanged), and there is nothing there for a picked range to be. */
  let canShare = $derived(on && !!cadence && !!recap && recap.entryCount >= WRAPPED_ENTRY_FLOOR);

  /* The journey anchor (phase 5 ticket 25, ADR-0010): independent of the
     period a wrapped screen happens to be showing, so it reads the same
     whichever tab is open - recomputed from the anchor's own date rather than
     anything the recap query returns. */
  let anchor = $derived(vocabulary.journeyAnchor);
  let anchorDuration = $derived(
    anchor ? { name: anchor.name, duration: fmtDuration(calendarDuration(anchor.epochDay, today)) } : null
  );

  let loading = $derived(
    recapQuery.loading || moodTrendQuery.loading || insightsQuery.loading || tallyQuery.loading
  );
</script>

<div class="screen">
  <ScreenHeader title={m.wrapped()} screen="wrapped" back={() => smartBack('/')}>
    {#snippet actions()}
      {#if canShare}
        <a class="icon-btn press" href="/wrapped/{cadence}/share" aria-label={m.wrapped_share_open()}>
          <Icon name="share" size={22} />
        </a>
      {/if}
    {/snippet}
  </ScreenHeader>

  {#if on && (cadence || isRange)}
    <!-- Links rather than buttons, and a nav rather than a radiogroup: each
         view is its own screen at its own URL, so switching between them is
         navigation and belongs in history. -->
    <nav class="segmented wrapped-cadences" data-wrapped-cadences aria-label={m.wrapped_cadence_group()}>
      {#each VIEW_TABS as tab (tab.key)}
        <a
          class="segment"
          class:is-active={view === tab.key}
          aria-current={view === tab.key ? 'page' : undefined}
          href="/wrapped/{tab.key}">{tab.label()}</a
        >
      {/each}
    </nav>
  {/if}

  {#if !on}
    <Notice
      icon="info"
      key="wrapped-off"
      title={m.wrapped_off_title()}
      text={m.wrapped_off_body()}
      action={{ label: m.nav_settings(), href: '/settings' }}
      role:aria-live="polite"
    />
  {:else if !cadence && !isRange}
    <Notice icon="info" key="wrapped-unknown" title={m.wrapped_unknown_title()} text={m.wrapped_unknown_body()} />
  {:else}
    {#if isRange}
      <!-- Which range is on screen, as the one row that changes it. A filter
           that opens a panel taller than the screen scrolls away the thing it
           filters (DIRECTION.md, the calendar's own lesson), so the choices
           are a sheet and this row is the visible record of what is on. -->
      <ListCard>
        <ListRow
          key="wrapped-range"
          icon="curve"
          title={RANGE_LABEL[picked.choice]()}
          subtitle={picked.range
            ? m.wrapped_week_range({
                from: fmtDay(picked.range.start, { day: 'numeric', month: 'short' }),
                to: fmtDay(picked.range.end, { day: 'numeric', month: 'short' })
              })
            : m.recap_custom_range_required()}
          onclick={() => (rangePicker = true)}
        />
      </ListCard>
    {/if}

    {#if isRange && !picked.range}
      <!-- A half-finished custom range: the picker is the screen until it
           has both boundaries. -->
      <Notice icon="info" key="wrapped-range-incomplete" title={m.recap_custom_range_required()} />
      <!-- Held whole rather than filled in as the queries land: every figure
           below is a number, and a 0 that becomes 31 a moment later reads as
           a wrong answer rather than a pending one. -->
    {:else if loading}
      <Skeleton variant="block" count={1} />
    {:else if !recap || recap.entryCount < WRAPPED_ENTRY_FLOOR}
      <!-- The same floor Home applies before offering the card, and now the
           same one a picked range gets. Reachable anyway through a bookmark
           or a hand-typed URL, and saying why is better than a screen of
           zeroes. -->
      <div class="wrapped-thin" data-wrapped-thin>
        <h2 class="wrapped-title" data-wrapped-title>{m.wrapped_thin_title()}</h2>
        <p class="muted">
          {m.wrapped_thin_body({ count: recap?.entryCount ?? 0, floor: String(WRAPPED_ENTRY_FLOOR) })}
        </p>
      </div>
    {:else if cadence === 'year'}
      <WrappedYear
        year={period?.year ?? 0}
        intro={subtitle}
        {recap}
        {moodTrend}
        {dimChange}
        {topTags}
        {anchorDuration}
        {insights}
        {tally}
        {streaks}
      />
    {:else}
      <WrappedCompact
        {title}
        {subtitle}
        {recap}
        {moodTrend}
        {dimChange}
        {topTags}
        {anchorDuration}
        {insights}
        {tally}
        {streaks}
      />
    {/if}
  {/if}

  <Sheet open={rangePicker} title={m.wrapped_cadence_group()} onClose={() => (rangePicker = false)}>
    <div class="stack-3">
      <ListCard>
        {#each WRAPPED_RANGE_CHOICES as choice (choice)}
          <ListRow
            key={`range-${choice}`}
            title={RANGE_LABEL[choice]()}
            chevron={false}
            onclick={() => chooseRange(choice)}
          >
            {#snippet trailing()}
              {#if isRange && picked.choice === choice}<Icon name="check" size={20} />{/if}
            {/snippet}
          </ListRow>
        {/each}
      </ListCard>

      {#if picked.choice === 'custom'}
        <div class="wrapped-range-dates">
          <label for="wrapped-range-start">{m.recap_custom_start_label()}</label>
          <input
            class="input"
            id="wrapped-range-start"
            type="date"
            bind:value={customStart}
            max={todayInput}
            aria-label={m.recap_custom_start_label()}
            onchange={() => chooseRange('custom')}
          />
          <label for="wrapped-range-end">{m.recap_custom_end_label()}</label>
          <input
            class="input"
            id="wrapped-range-end"
            type="date"
            bind:value={customEnd}
            min={customStart || undefined}
            max={todayInput}
            aria-label={m.recap_custom_end_label()}
            onchange={() => chooseRange('custom')}
          />
        </div>
      {/if}
    </div>
  </Sheet>
</div>
