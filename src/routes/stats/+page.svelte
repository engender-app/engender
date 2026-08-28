<script lang="ts">
  /* The Stats hub, rebuilt on the chart kit (phase 5 UX ticket 23).

     What it used to be: one white card per metric, each holding the same
     sparkline, then five more cards and four "here is a screen" links. On a
     journal with three active dimensions that is four identical charts
     stacked before anything else is said, which is the specific failure
     DIRECTION.md's decision 2b exists to prevent.

     The shape now is four chart kinds and a list. One area chart with a
     picker for which scale it plots, so the number of charts stops growing
     with the number of dimensions; horizontal bars for where each scale sat
     over the period; a distribution for how many days landed on each mood;
     a second bar set for the tags, whose bars open the entries behind them.
     Then the patterns, and a list card into the six deeper screens.

     Two disclaimers survive as paragraphs under their cards, which looks
     like the explanatory-paragraph habit DIRECTION.md's chart rules refuse
     and is its opposite: `insights_note` says which tags were left out and
     `custom_interval_sub` says that folding a history by an interval does
     not mean a cycle exists. A finding is the app telling you what a
     reading means; these are the app declining to.

     `/recap` is gone (spec 07). Its two links here reach the wrapped for
     the same periods, and its arbitrary range is a wrapped of its own. */
  import { m } from '$lib/paraglide/messages';
  import { fmtDay, fmtDuration, fmtMonthName } from '$lib/data/dates';
  import {
    calendarDuration,
    localDateFromEpochDay,
    previousCalendarMonthRange,
    previousCalendarYearRange,
    todayEpochDay
  } from '$lib/data/epochDay';
  import { liveList, liveQuery } from '$lib/data/live/journal.svelte';
  import { prefs, selectMetric } from '$lib/data/prefs/store.svelte';
  import { isPausedOn } from '$lib/data/journalingPause';
  import { atGrain, type Grain } from '$lib/charts/grain';
  import { metricStandings, moodDistribution } from '$lib/data/statsCharts';
  import { nativeValue, signedValue, tagInsightRows } from '$lib/data/wrappedDisplay';
  import { moodName } from '$lib/data/vocabulary/labels';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import Segmented from '$lib/components/Segmented.svelte';
  import Sheet from '$lib/components/Sheet.svelte';
  import EntryCard from '$lib/components/EntryCard.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';
  import AreaChart from '$lib/components/kit/AreaChart.svelte';
  import BarRows from '$lib/components/kit/BarRows.svelte';
  import type { BarRow } from '$lib/components/kit/barRow';
  import ChartCard from '$lib/components/kit/ChartCard.svelte';
  import ChartEmpty from '$lib/components/kit/ChartEmpty.svelte';
  import ChartPicker from '$lib/components/kit/ChartPicker.svelte';
  import Distribution from '$lib/components/kit/Distribution.svelte';
  import PairedDots from '$lib/components/kit/PairedDots.svelte';
  import type { PairedRow } from '$lib/components/kit/pairedRow';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import ListRow from '$lib/components/kit/ListRow.svelte';
  import SectionHeading from '$lib/components/kit/SectionHeading.svelte';
  import { vocabulary } from '$lib/data/vocabulary/vocabulary';
  import type { DayAverage } from '$lib/data/journal/stats';
  import type { CorrelationCard } from '$lib/data/correlationCards';
  import ReadGate from '$lib/components/kit/ReadGate.svelte';

  const RANGES = [7, 14, 30, 90, 180, 365];
  /** How many entries the sheet behind a tag insight lists. */
  const INSIGHT_ENTRIES = 20;
  /** How many tags the insight chart draws. Bars, not rows: past a handful
      the shortest ones are a stub each and the card is a list again. */
  const INSIGHT_BARS = 6;

  /* Which stripe each area of the screen takes (DIRECTION.md, "flag colour
     reaches the whole app, categorically").

     Every chart shares role 0, and that is the brief's own exception rather
     than a shortcut: "colour that carries a value takes role 0", because
     roles run a flag's colours before its shades and index 0 is the only one
     guaranteed to be a colour on all 8 palettes. Read in reading order, the
     tag insights landed on trans's white band, and a chart of white bars on
     a dark card reads as a set of disabled bars rather than as the flag.
     Home's week strip took the same exception for the same reason.

     The lists take the stripes after it, where an achromatic band is not a
     problem: a tinted disc and a row wash carry no reading, and ticket 20
     already gave every tinted shape a hairline so it stays a shape.

     The mood distribution takes no role at all: it is drawn on mood's own
     ramp (ADR-0025), the one colour system here that is not the flag's, and
     a stripe on that card would put two scales on one surface. */
  const AREA_ROLE = { charts: 0, patterns: 1, lookBack: 2 };

  let range = $state(30);

  /* A range is a length on screen and two epoch days to the journal, which
     never reads the clock for a domain answer (ticket 10). Inclusive of both
     ends, so "7 days" is today and the six before it - and read on recompute
     rather than captured, so a session open across midnight moves on. */
  let today = $derived(todayEpochDay());
  let from = $derived(today - range + 1);

  /* The journey anchor (phase 5 ticket 25, ADR-0010): recomputed on every
     render from the anchor's own date, nothing cached - so switching or
     clearing it in settings shows up here the same instant it does on
     wrapped. */
  let anchor = $derived(vocabulary.journeyAnchor);
  let anchorDuration = $derived(anchor ? fmtDuration(calendarDuration(anchor.epochDay, today)) : null);

  let metrics = $derived([
    { key: 'mood', name: m.mood(), min: 1, max: 5 },
    ...vocabulary.activeDimensions.map((d) => ({ key: d.key, name: d.name, min: d.min, max: d.max }))
  ]);
  let metricOptions = $derived(metrics.map((mt) => ({ value: mt.key, label: mt.name })));
  let shown = $derived(metrics.find((mt) => mt.key === vocabulary.activeMetric) ?? metrics[0]);

  let streakQuery = liveQuery((j) => j.stats.streak(today));
  let streak = $derived(streakQuery.value ?? 0);

  /* The streak line goes quiet while a pause covers today, the same rule
     Home's does (phase 5 features ticket 21): it is a nudge, and a frozen
     number with nothing to explain it is worse than no number. */
  let pausesQuery = liveList((j) => j.journalingPauses.getPauses());
  let pausedToday = $derived(isPausedOn(pausesQuery.rows, today));

  /* One query for every metric on screen rather than one per chart: the
     day-by-day chart plots one at a time but the bars card needs all of
     them, and asking per card would mean a round trip per active dimension
     every time the range changes. */
  let seriesQuery = liveQuery(async (j) => {
    const keys = metrics.map((mt) => mt.key);
    const [rangeFrom, rangeTo] = [from, today];
    const series = await Promise.all(keys.map((key) => j.stats.dayAverages(key, rangeFrom, rangeTo)));
    return new Map(keys.map((key, i) => [key, series[i]]));
  });
  /* One default for the whole answer: a metric with no days in range is a
     missing key in a Map that exists, not a missing Map, and defaulting at
     the lookup made the two look like the same thing. */
  let series = $derived(seriesQuery.value ?? new Map<string, DayAverage[]>());
  let seriesFor = $derived((key: string): DayAverage[] => series.get(key) ?? []);

  let insightsQuery = liveList((j) => j.stats.tagInsights(vocabulary.activeMetric, from, today));
  let insights = $derived(insightsQuery.rows);

  let lastMonth = $derived(previousCalendarMonthRange(today));
  let lastYear = $derived(previousCalendarYearRange(today).year);

  let valueSheet = $state(false);
  let insightSheet = $state<{ label: string; id: string } | null>(null);

  // Native units both ways (ADR-0012), from $lib/data/wrappedDisplay so this
  // screen and the two wrapped presentations write a number the same way.
  // Keyed off a metric key rather than the selected preference, so a
  // correlation card spanning several metrics can call it too.
  const fmtNativeValue = nativeValue;

  /* Where each scale sat over the period. The bar's length is where the
     average lands inside that metric's own range and the number beside it is
     native, which is the only honest way to put mood's 1-to-5 and a
     dimension's 0-to-100 on one card (../lib/data/statsCharts.ts). */
  let scaleRows = $derived<BarRow[]>(
    metricStandings(
      metrics.map((mt) => ({ key: mt.key, range: { min: mt.min, max: mt.max } })),
      seriesFor
    ).map((standing) => {
      const metric = metrics.find((mt) => mt.key === standing.key);
      return {
        key: standing.key,
        name: metric?.name ?? standing.key,
        note: m.n_days({ n: standing.days }),
        /* A scale nothing was logged against says so in its note ("0
           days") and leaves the value empty. A dash here would be a glyph
           standing in for a sentence, and docs/ui-copy.md has no dashes in
           it. */
        value: standing.value === null ? '' : fmtNativeValue(standing.key, standing.value),
        amount: standing.share
      };
    })
  );

  let moodSteps = $derived(
    moodDistribution(seriesFor('mood')).map((step) => ({ ...step, name: moodName(step.step) }))
  );

  /* The same rows wrapped draws, from the same module: length from the size
     of the movement and never from its direction, since the two ends of a
     scale are not better and worse. */
  let insightRows = $derived(
    tagInsightRows(
      insights.slice(0, INSIGHT_BARS).map((insight) => ({
        id: insight.id,
        label: vocabulary.tag(insight.id)?.label ?? insight.id,
        count: insight.count,
        withAvg: insight.withAvg,
        withoutAvg: insight.withoutAvg,
        delta: insight.withAvg - insight.withoutAvg
      })),
      vocabulary.activeMetric
    )
  );

  /* The values sheet, in the same bars as everything else on the screen. The
     bar's length is where the day sits in the metric's own range, which is
     what makes a quiet week visible as a run of short bars. */
  let valueRows = $derived<BarRow[]>(
    seriesFor(shown.key)
      .toReversed()
      .map((point) => ({
        key: String(point.day),
        name: fmtDay(point.day, { weekday: 'short', day: 'numeric', month: 'short' }),
        note: point.count > 1 ? m.avg_of({ count: String(point.count) }) : undefined,
        value: fmtNativeValue(shown.key, point.value),
        amount: (point.value - shown.min) / Math.max(shown.max - shown.min, 1)
      }))
  );

  let insightEntriesQuery = liveList((j) => {
    const sheet = insightSheet;
    if (!sheet) return Promise.resolve([]);
    return j.entries.entriesWithTag(sheet.id, INSIGHT_ENTRIES);
  });
  let insightEntries = $derived(insightEntriesQuery.rows);

  /* Correlation cards (phase 4 ticket 21) - a deliberate reversal of
     phase 3's explicit exclusion of correlation analysis, not scope
     drift the phase 3 decision missed. Ranked and capped by the journal
     area itself; this screen only renders what it returns. */
  let correlationCardsQuery = liveList((j) =>
    j.correlationCards.getCards(from, today)
  );
  let correlationCards = $derived(correlationCardsQuery.rows);

  /* Interval mood pattern (phase 5 ticket 09) - two bucket-and-average
     shapes over a cyclical position, kept apart from correlation cards on
     purpose (../lib/data/intervalMoodPattern.ts). Neither card names a
     target or a verdict: both say only where days fell.

     Both read across the journal's whole history rather than the segmented
     range above (the same Number.MIN_SAFE_INTEGER convention stats.ts's
     bestStreakEver uses for "ever"), not just the visible window: an
     injection interval is commonly 14-28 days, so a completed one rarely
     recurs three times inside even the 90-day preset. */
  let intervalMoodQuery = liveList((j) =>
    j.intervalMoodPattern.dayOfInterval(Number.MIN_SAFE_INTEGER, today)
  );
  let intervalMoodPattern = $derived(intervalMoodQuery.rows);

  let customIntervalLength = $state(28);
  // A boundary clamp, not a save-time validation: the field can sit blank or
  // negative mid-edit, and the chart underneath has to show something for
  // every keystroke rather than the query throwing on a bad value.
  let safeCustomIntervalLength = $derived(
    Number.isFinite(customIntervalLength) && customIntervalLength >= 2 ? Math.floor(customIntervalLength) : 28
  );
  let customIntervalQuery = liveList((j) =>
    j.intervalMoodPattern.byCustomInterval(Number.MIN_SAFE_INTEGER, today, safeCustomIntervalLength)
  );

  const metricName = (key: string) => vocabulary.metricDimension(key)?.name ?? m.mood();

  const occurrenceLabel = (card: CorrelationCard) =>
    card.occurrence.kind === 'doseDay'
      ? m.correlation_card_dose_day()
      : (vocabulary.tag(card.occurrence.id)?.label ?? card.occurrence.id);

  /* One paired-dot row per card: where the days it happened sat, where the
     rest sat, and the distance between them. Not bars - a bar answers "how
     much" and measures every row against the longest one, which is what made
     six of them read as busy and as a third copy of the same shape. Each
     row's track is its own metric's range, so a mood card and a dimension
     card need nothing in common to sit next to each other. */
  const metricBounds = (key: string) => {
    const dimension = vocabulary.metricDimension(key);
    return dimension ? { min: dimension.min, max: dimension.max } : { min: 1, max: 5 };
  };

  let correlationRows = $derived<PairedRow[]>(
    correlationCards.map((card) => {
      const bounds = metricBounds(card.metric);
      return {
        key: `${card.occurrence.kind}-${card.occurrence.kind === 'tag' ? card.occurrence.id : 'dose'}-${card.metric}`,
        name: occurrenceLabel(card),
        with: card.withAvg,
        without: card.withoutAvg,
        ...bounds,
        gap: signedValue(card.withAvg - card.withoutAvg, (v) => fmtNativeValue(card.metric, v)),
        note: `${metricName(card.metric)} · ${m.insight_row_sub({
          count: String(card.count),
          with: fmtNativeValue(card.metric, card.withAvg),
          without: fmtNativeValue(card.metric, card.withoutAvg)
        })}`
      };
    })
  );

  /* A position on a cycle is not a day, so the two pattern charts label
     their ends with the position rather than with a date, and they are
     already one point per position - there is nothing to bucket. */
  const positionPoints = (pattern: { position: number; value: number }[]) =>
    pattern.map((p) => ({ x: p.position, y: p.value }));
  const positionLabel = (point: { x: number }) => m.range_days({ days: String(point.x) });

  /* The day-by-day chart fits the card, so what changes with the range is
     how coarsely it reads: 30 days day by day, a year week by week
     ($lib/charts/grain). The grain decides how the scrubbed position is
     named too - a week's reading is a week, and dating it to its Monday
     alone would be a day standing in for seven. */
  let plotted = $derived(
    atGrain(
      seriesFor(shown.key).map((p) => ({ x: p.day, y: p.value })),
      range
    )
  );

  const GRAIN_SPAN: Record<Grain, number> = { day: 0, week: 6, month: 27 };
  const grainLabel = (grain: Grain) => (point: { x: number }) => {
    const short = { day: 'numeric', month: 'short' } as const;
    if (grain === 'day') return fmtDay(point.x, { weekday: 'short', ...short });
    if (grain === 'month') return fmtDay(point.x, { month: 'long', year: 'numeric' });
    return `${fmtDay(point.x, short)} - ${fmtDay(point.x + GRAIN_SPAN.week, short)}`;
  };
</script>

<div class="screen">
  <ScreenHeader title={m.nav_stats()} subtitle={m.stats_range_sub({ days: String(range) })} screen="stats" />

  <Segmented
    name={m.stats_range_group()}
    options={RANGES.map((r) => ({ value: String(r), label: m.range_days({ days: String(r) }) }))}
    value={String(range)}
    onChange={(v) => (range = Number(v))}
    compact
    key="stats-range"
  />

  <!-- The two facts that used to be a card each: how long since the day the
       journey is anchored on, and the run of days ending today. A plain line
       rather than two accent numbers on two surfaces, which is the template
       the slop audit took off Home. -->
  {#if anchorDuration || (streak > 1 && !pausedToday)}
    <p class="stats-caption" data-stats-caption>
      {#if anchorDuration}{m.journey_anchor_since({ name: anchor?.name ?? '' })}: {anchorDuration}{/if}
      {#if anchorDuration && streak > 1 && !pausedToday}<span aria-hidden="true"> · </span>{/if}
      {#if streak > 1 && !pausedToday}{streak} {m.streak_row()}{/if}
    </p>
  {/if}

  <!-- One chart for every scale, with the picker choosing which. The choice
       is the stored metric preference, the same one Home's week strip and
       the calendar's month grid shade by, so the app is showing one scale at
       a time rather than asking three times which one. -->
  <ChartCard
    heading={m.stats_day_by_day()}
    kind="day-by-day"
    role={roleAt(activeFlag.roles, AREA_ROLE.charts)}
  >
    {#snippet control()}
      <ChartPicker
        key="stats-metric"
        label={m.stats_day_by_day()}
        value={shown.key}
        options={metricOptions}
        onPick={(value) => selectMetric(value === 'mood' ? null : value)}
      />
    {/snippet}
    {#if seriesQuery.loading}
      <Skeleton variant="block" />
    {:else}
      <AreaChart
        points={plotted.points}
        min={shown.min}
        max={shown.max}
        from={fmtDay(from, { day: 'numeric', month: 'short' })}
        to={fmtDay(today, { day: 'numeric', month: 'short' })}
        formatValue={(v) => fmtNativeValue(shown.key, v)}
        scrubLabel={grainLabel(plotted.grain)}
        ariaLabel={m.values_title({ name: shown.name })}
      />
    {/if}
  </ChartCard>
  <!-- Every reading in the range, as text. The chart's gutter says what the
       ends of the scale are and the marks carry the shape; this is the one
       place an exact number for a given day can be read, and it is also the
       path a screen reader takes through the series. -->
  <button class="stats-open" data-values-open onclick={() => (valueSheet = true)}>
    {m.stats_values_open()}
  </button>

  <ChartCard
    heading={m.stats_scales_now()}
    kind="scales"
    role={roleAt(activeFlag.roles, AREA_ROLE.charts)}
  >
    {#if seriesQuery.loading}
      <Skeleton variant="line" count={3} />
    {:else}
      <BarRows rows={scaleRows} />
    {/if}
  </ChartCard>

  <ChartCard heading={m.stats_mood_days()} kind="mood-days">
    {#if seriesQuery.loading}
      <Skeleton variant="block" />
    {:else}
      <Distribution steps={moodSteps} />
    {/if}
  </ChartCard>

  <ChartCard heading={m.tag_insights()} kind="tag-insights" role={roleAt(activeFlag.roles, AREA_ROLE.charts)}>
    <ReadGate read={insightsQuery} variant="line" count={3}>
      {#snippet rows()}
        <BarRows
          rows={insightRows}
          onPick={(key) =>
            (insightSheet = { id: key, label: vocabulary.tag(key)?.label ?? key })}
        />
      {/snippet}
      {#snippet empty()}
        <ChartEmpty>{m.insights_empty()}</ChartEmpty>
      {/snippet}
    </ReadGate>
  </ChartCard>
  {#if insightRows.length}
    <p class="stats-note">{m.insights_note()}</p>
  {/if}

  <!-- The correlation cards, as bars. They were rows of three stacked lines
       each - a name, "tends to appear with higher Mood on the same day", and
       the two averages - which read as busy and unfinished at six of them
       (Alicja, 2026-08-25), and the middle line was the app interpreting a
       reading, which PRODUCT.md says it never does. The bar carries the
       movement, the note carries which scale and how many entries, and the
       sentence is gone: "+1.6" says what "tends to appear with higher" said,
       without a verdict on top of it. -->
  <ChartCard
    heading={m.correlation_cards_title()}
    kind="correlations"
    role={roleAt(activeFlag.roles, AREA_ROLE.charts)}
  >
    <ReadGate read={correlationCardsQuery} variant="line" count={3}>
      {#snippet rows()}
        <PairedDots rows={correlationRows} />
      {/snippet}
      {#snippet empty()}
        <ChartEmpty>{m.correlation_cards_empty()}</ChartEmpty>
      {/snippet}
    </ReadGate>
  </ChartCard>

  <ChartCard
    heading={m.interval_mood_title()}
    kind="interval-mood"
    role={roleAt(activeFlag.roles, AREA_ROLE.patterns)}
  >
    <ReadGate read={intervalMoodQuery} variant="block" count={3}>
      {#snippet rows()}
        <AreaChart
          points={positionPoints(intervalMoodPattern)}
          min={1}
          max={5}
          formatValue={(v) => v.toFixed(1)}
          scrubLabel={positionLabel}
          ariaLabel={m.interval_mood_chart_aria({
            count: String(intervalMoodPattern.length),
            from: String(intervalMoodPattern[0].position),
            to: String(intervalMoodPattern[intervalMoodPattern.length - 1].position)
          })}
        />
      {/snippet}
      {#snippet empty()}
        <ChartEmpty>{m.interval_mood_empty()}</ChartEmpty>
      {/snippet}
    </ReadGate>
  </ChartCard>
  <p class="stats-note">{m.interval_mood_sub()}</p>

  <!-- The interval length is this chart's one control, so it sits on the
       heading's line where the metric picker sits on the chart above rather
       than as a labelled field in a card of its own. -->
  <ChartCard heading={m.custom_interval_title()} kind="custom-interval">
    {#snippet control()}
      <span class="stats-interval">
        <label class="visually-hidden" for="custom-interval-length">{m.custom_interval_length_label()}</label>
        <input
          class="stats-interval-input"
          type="number"
          min="2"
          id="custom-interval-length"
          name="custom-interval-length"
          inputmode="numeric"
          data-interval-length
          bind:value={customIntervalLength}
        />
      </span>
    {/snippet}
    <ReadGate read={customIntervalQuery} variant="block" count={3}>
      {#snippet rows(customIntervalPattern)}
        <AreaChart
          points={positionPoints(customIntervalPattern)}
          min={1}
          max={5}
          formatValue={(v) => v.toFixed(1)}
          scrubLabel={positionLabel}
          ariaLabel={m.custom_interval_chart_aria({
            days: String(safeCustomIntervalLength),
            count: String(customIntervalPattern.length),
            from: String(customIntervalPattern[0].position),
            to: String(customIntervalPattern[customIntervalPattern.length - 1].position)
          })}
        />
      {/snippet}
      {#snippet empty()}
        <ChartEmpty>{m.custom_interval_empty()}</ChartEmpty>
      {/snippet}
    </ReadGate>
  </ChartCard>
  <p class="stats-note">{m.custom_interval_sub()}</p>

  <!-- The six deeper screens as one list rather than six cards. Four
       same-size icon-plus-heading-plus-text tiles were what the slop audit
       took off this screen; a destination with nothing to show on it is a
       row. The two former recap links are the wrapped for the same two
       periods (spec 07), and the third row is the arbitrary range recap
       used to own. -->
  <SectionHeading text={m.stats_look_back()} />
  <ListCard role={roleAt(activeFlag.roles, AREA_ROLE.lookBack)}>
    <ListRow
      key="wrapped-month"
      icon="sparkle"
      title={m.wrapped_month_title({ month: fmtMonthName(lastMonth.year, lastMonth.month) })}
      href="/wrapped/month"
    />
    <ListRow key="wrapped-year" icon="sparkle" title={m.wrapped_year_title({ year: String(lastYear) })} href="/wrapped/year" />
    <ListRow key="wrapped-range" icon="curve" title={m.wrapped_range_title()} href="/wrapped/range" />
    <ListRow
      key="body-map"
      icon="grid"
      title={m.body_map_title()}
      subtitle={m.body_map_sub()}
      href="/body-map"
    />
    <ListRow
      key="tally"
      icon="columns"
      title={m.tally_trend_title()}
      subtitle={m.tally_trend_sub()}
      href="/tally"
    />
    <ListRow
      key="compare"
      icon="shuffle"
      title={m.compare_title()}
      subtitle={m.compare_sub()}
      href="/compare"
    />
  </ListCard>

  <!-- Every reading in the range, as numbers. It was three columns of text
       per row, which is a table of one column that matters (Alicja,
       2026-08-25: "crowded and boring"). It is the bar rows the rest of the
       screen is drawn in: the date names the row, the value is the reading,
       and the bar puts it where it sits in the scale - so a run of quiet days
       is visible in the list and not only in the chart above it. Newest
       first, because that is the end of the range you came from. -->
  <Sheet open={valueSheet} title={shown.name} onClose={() => (valueSheet = false)}>
    <BarRows rows={valueRows} />
    <button class="btn btn-ghost" onclick={() => (valueSheet = false)}>
      <span>{m.done()}</span>
    </button>
  </Sheet>

  <Sheet open={insightSheet !== null} title={insightSheet?.label ?? ''} onClose={() => (insightSheet = null)}>
    {#if insightSheet}
      <h3>{insightSheet.label}</h3>
      <div class="stack-3">
        {#each insightEntries as e (e.id)}
          <EntryCard entry={e} />
        {/each}
      </div>
      <button class="btn btn-ghost" onclick={() => (insightSheet = null)}>
        <span>{m.done()}</span>
      </button>
    {/if}
  </Sheet>
</div>
