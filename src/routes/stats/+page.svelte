<script lang="ts">
  /* The Stats hub: an index of the person's own data (phase 8 UX ticket 03,
     ADR-0056), on the chart kit phase 5's ticket 23 built.

     What it was before this: nine of the journal's sixty-four tables and
     three link-outs. Twelve areas own a chart on their own screen and this
     one had no idea those charts existed, so somebody using most of the app
     got a slice of their data and no word about the rest. At the same time
     five of its own panels rendered for somebody who had never used the
     feature they described - a zero-length bar per ticked scale, five mood
     columns labelled zero, an empty values sheet, and two folds explaining
     the dosing interval to a person who had never logged a dose.

     Two blocks now, and one emptiness rule across both.

     The top block is the reads nothing else can do, because they cross
     areas: day by day with a second scale on the plot, where each scale sat,
     how the days fall across the mood scale, what gets written about, which
     tags move a scale, what shows up together, the highest days on the
     person's own euphoria reading, the constellation, and the two folds. It
     renders whatever the journal holds and says "not enough data" where it
     holds too little, because it is the tab's own content and somebody
     arriving on day two should see what the tab becomes.

     Under it was an index: one row per area the person uses, in the More
     hub's four groups and order. Ticket 99 item 36 took it off - "stats
     shouldnt have the 'more' list at the end. it is only the stats tab" -
     which reverses that half of ADR-0056. Discovery is the hub's job, and
     this tab is the numbers. What is left below the charts is the
     look-back list, which points at wrapped and the body map: destinations
     no hub row covers.

     One floor, an existing constant and not restated: a summary panel needs
     `WRAPPED_ENTRY_FLOOR` entries in range, and the two folds want the same
     five as positions of their own all-history output. ADR-0056's other
     floor, `MIN_PLOT_POSITIONS`, went off this screen with the area charts
     and still governs the trends on the screens that own them.

     One disclaimer still hangs under its card rather than inside it, and it
     is the explanatory-paragraph habit's opposite: `insights_note` says
     which tags were left out. A finding is the app telling you what a
     reading means; that is the app declining to. The two folds' own lines
     moved inside their cards, where they are gated on the read that draws
     the chart.

     `/recap` is gone (spec 07). Its two links here reach the wrapped for
     the same periods, and its arbitrary range is a wrapped of its own. */
  import { goto } from '$app/navigation';
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
  import { alignSeries, atGrain, type Grain } from '$lib/charts/grain';
  import { metricStandings, moodDistribution } from '$lib/data/statsCharts';
  import { nativeValue, signedValue, spreadNote, tagInsightRows } from '$lib/data/wrappedDisplay';
  import { moodName } from '$lib/data/vocabulary/labels';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import Segmented from '$lib/components/Segmented.svelte';
  import Sheet from '$lib/components/Sheet.svelte';
  import EntryCard from '$lib/components/EntryCard.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';
  import AreaChart from '$lib/components/kit/AreaChart.svelte';
  import GenderConstellationChart from '$lib/components/GenderConstellationChart.svelte';
  import BarRows from '$lib/components/kit/BarRows.svelte';
  import type { BarRow } from '$lib/components/kit/barRow';
  import ChartCard from '$lib/components/kit/ChartCard.svelte';
  import ChartEmpty from '$lib/components/kit/ChartEmpty.svelte';
  import ChartPicker from '$lib/components/kit/ChartPicker.svelte';
  import OrderedStrip from '$lib/components/kit/OrderedStrip.svelte';
  import PairedDots from '$lib/components/kit/PairedDots.svelte';
  import type { PairedRow } from '$lib/components/kit/pairedRow';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import ListRow from '$lib/components/kit/ListRow.svelte';
  import SectionHeading from '$lib/components/kit/SectionHeading.svelte';
  import { vocabulary } from '$lib/data/vocabulary/vocabulary';
  import type { DayAverage } from '$lib/data/journal/stats';
  import { plotPoints, type ConstellationPoint } from '$lib/data/constellationData';
  import type { CorrelationCard } from '$lib/data/correlationCards';
  import ReadGate from '$lib/components/kit/ReadGate.svelte';
  import Donut from '$lib/components/kit/Donut.svelte';
  import { WRAPPED_ENTRY_FLOOR } from '$lib/data/wrapped';
  import { rankHighestDays } from '$lib/data/highestDays';
  import type { Part } from '$lib/charts/parts';

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

  /* What was happening around these readings (ticket 23). One query for the
     screen, and only the values chart draws it: the interval-mood chart
     below plots a position in the dosing interval rather than a date, so a
     day has nowhere to sit on it. */
  let annotationsQuery = liveList((j) => j.chartAnnotations.getAnnotations(from, today, today));

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

  /* A second scale on the same chart (phase 6 ticket 12). The manual,
     hypothesis-driven companion to the app noticing things for you:
     somebody who suspects two of their scales move together can look,
     rather than wait.

     Opt-in and empty by default. A second picker sitting on the card
     whatever anyone asked for would put a comparison in front of every
     person who opened the screen, and a comparison is a question somebody
     has to have first. `seriesQuery` already fetches every scale's series in
     one go, so choosing one costs no query.

     Held to the scales that still exist, the same rule the constellation's
     two axes follow: a scale unticked in settings, or the one the primary
     picker has just moved onto, drops the comparison rather than leaving the
     chart pointed at something nobody logs. */
  let compareKey = $state('');
  let comparing = $state(false);
  $effect(() => {
    if (compareKey && !metrics.some((mt) => mt.key === compareKey && mt.key !== shown.key)) {
      compareKey = '';
    }
  });
  let compared = $derived(metrics.find((mt) => mt.key === compareKey));
  let compareOptions = $derived([
    { value: '', label: m.stats_compare_none() },
    ...metricOptions.filter((option) => option.value !== shown.key)
  ]);

  /* Where the picked metric's days ran between, for the sheet below (phase
     6 unprompted ticket 11). One read for the shown metric rather than one
     per metric the way the averages are read: the sheet is the only place on
     this screen that prints a single day, and the bars, the distribution and
     the insights all speak for a period. */
  let spreadsQuery = liveList((j) => j.stats.daySpread(shown.key, from, today));
  /* Empty while the read is in flight, and that is the point rather than an
     accident: an unloaded range and a range of single-entry days come back
     identically empty, so a row saying nothing extra would claim the day
     covered no ground before the answer arrived. The calendar holds the
     same line for the same reason. */
  let spreadByDay = $derived(
    spreadsQuery.loading
      ? new Map<number, (typeof spreadsQuery.rows)[number]>()
      : new Map(spreadsQuery.rows.map((point) => [point.day, point]))
  );

  /* The values sheet, in the same bars as everything else on the screen. The
     bar's length is where the day sits in the metric's own range, which is
     what makes a quiet week visible as a run of short bars.

     This list is the whole non-visual path to the chart's numbers: the plot
     is one image to a screen reader, and a scrub is a way of reading a
     picture. So when a second scale joins the chart it joins this too, as
     the day's note - otherwise the second line would be a reading only
     somebody who can see it can have. A day that covered ground says so in
     the same note, in the same words the calendar reads out over that day's
     cell: the two surfaces draw one day from one pair of reads, and a person
     who checks one against the other has to find the same answer. Days the second scale carries and the
     first does not get a row of their own, with an empty bar: the chart
     draws that stretch, and a list that quietly dropped it would disagree
     with the picture it is standing in for. */
  let shownByDay = $derived(new Map(seriesFor(shown.key).map((point) => [point.day, point])));
  let comparedByDay = $derived(
    compared ? new Map(seriesFor(compared.key).map((point) => [point.day, point])) : null
  );
  let valueDays = $derived(
    [...new Set([...shownByDay.keys(), ...(comparedByDay?.keys() ?? [])])].sort((a, b) => b - a)
  );
  let valueRows = $derived<BarRow[]>(
    valueDays.map((day) => {
      const point = shownByDay.get(day);
      const second = comparedByDay?.get(day);
      const notes = [
        point && point.count > 1 ? m.avg_of({ count: String(point.count) }) : null,
        spreadNote(shown.key, spreadByDay.get(day)),
        compared && second
          ? m.values_second({
              name: compared.name,
              value: fmtNativeValue(compared.key, second.value)
            })
          : null
      ].filter(Boolean);
      return {
        key: String(day),
        name: fmtDay(day, { weekday: 'short', day: 'numeric', month: 'short' }),
        note: notes.length ? notes.join(' · ') : undefined,
        /* Empty rather than a dash on a day this scale was not logged, the
           same way a scale with no days shows an empty value in the bars
           above: docs/ui-copy.md has no dashes in it. */
        value: point ? fmtNativeValue(shown.key, point.value) : '',
        amount: point ? (point.value - shown.min) / Math.max(shown.max - shown.min, 1) : 0
      };
    })
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

     Both ask across the journal's whole history rather than the segmented
     range above (Number.MIN_SAFE_INTEGER as the lower bound, which is what
     "ever" means on an epoch-day column), not just the visible window: an
     injection interval is commonly 14-28 days, so a completed one rarely
     recurs three times inside even the 90-day preset. "Ever" is capped to a
     lookback window at the journal/intervalMoodPattern.ts seam instead of
     actually reaching a decade back (phase 8 audit ticket 16) - this screen
     still asks the same question, it just no longer pays for the answer
     literally. */
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

  /* Waited out the same way /search's query is (phase 8 audit ticket 15,
     ticket 16 here): the liveList closure below reads a $state before its
     first await, which by the reactivity contract (journal.svelte.ts) makes
     that read a dependency - so reading safeCustomIntervalLength directly
     would re-run byCustomInterval's whole-history fold on every keystroke,
     a fresh 102KB read per digit typed. No cleared-value case to special-case
     the way /search's does: every value here is already a valid interval
     length, clamped above, so there is nothing to land early on. */
  const CUSTOM_INTERVAL_DEBOUNCE_MS = 250;
  let debouncedCustomIntervalLength = $state(28);
  $effect(() => {
    const length = safeCustomIntervalLength;
    const timer = setTimeout(() => {
      debouncedCustomIntervalLength = length;
    }, CUSTOM_INTERVAL_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  });

  let customIntervalQuery = liveList((j) =>
    j.intervalMoodPattern.byCustomInterval(Number.MIN_SAFE_INTEGER, today, debouncedCustomIntervalLength)
  );
  let customIntervalPattern = $derived(customIntervalQuery.rows);

  /* ---------------------------------------------------------------------
     The recap, for two things at once (ADR-0056).

     `entryCount` is the floor every summary panel on this screen is held to
     - WRAPPED_ENTRY_FLOOR, the same bar a retrospective clears before the
     app offers one - and `topTags` is the donut's whole data source. One
     read answers both, which is why the screen pays for a recap rather than
     counting entries itself: nothing here folds a figure the module that
     owns it does not already produce (ADR-0010). */
  let recapQuery = liveQuery((j) => j.stats.recap(from, today));
  let entryCount = $derived(recapQuery.value?.entryCount ?? 0);
  /* Under the floor and while the read is in flight both read as "not
     enough", and the difference is carried by the skeleton the ReadGate
     draws rather than by a second empty state. */
  let enoughEntries = $derived(entryCount >= WRAPPED_ENTRY_FLOOR);

  /* Share by tag, the donut's first consumer anywhere in the tree - the case
     ADR-0058 named when it minted the form and left unbuilt. Tags have no
     order, so a ring is the right drawing and the ordered strip beside it
     would be inventing a sequence. The ring's own module caps, sorts and
     gathers the remainder; nothing about that is decided here.

     `tagShare` and not the recap's `topTags`, which is what this drew first
     and was wrong: that read ends `LIMIT 3`, and a parts-of-a-whole form
     computes each share against the sum of what it is handed, so three tags
     came out drawn as a full circle with every share inflated and the
     remainder slice unreachable. Capping is the ring's job and it can only
     do it over the whole. */
  let tagShareQuery = liveList((j) => j.stats.tagShare(from, today));
  let tagParts = $derived<Part[]>(
    tagShareQuery.rows.map((tag) => ({
      key: tag.id,
      name: vocabulary.tag(tag.id)?.label ?? tag.id,
      amount: tag.count
    }))
  );
  /* The whole the ring is a ring of: tag uses, not entries. An entry carrying
     two tags is one entry and two uses, so the centre has to count what the
     arcs add up to or the hole disagrees with the ring around it. */
  let tagUses = $derived(tagParts.reduce((sum, part) => sum + part.amount, 0));

  /* The highest days on the person's own euphoria reading (phase 8 features
     ticket 20), which shipped its ranking and left the panel here.

     `rankHighestDays` rather than `highestDays`: the async half asks the day
     assembler for each ranked day, which is ten days times nineteen areas of
     bounded reads, and every one of those answers is already a tap away
     behind the row. So the panel ranks what `seriesQuery` fetched for the
     range - no read of its own at all - and the row opens the day.

     Gated on the dimension being one the person keeps. Nothing falls back to
     mood: naming which scale a "high day" is measured on is the module's own
     decision and there is no second scale it means. */
  const HIGHEST_METRIC = 'euphoria_dysphoria';
  let euphoriaScale = $derived(metrics.find((mt) => mt.key === HIGHEST_METRIC));
  let highestRows = $derived<BarRow[]>(
    euphoriaScale
      ? rankHighestDays(today, seriesFor(HIGHEST_METRIC)).map((point) => ({
          key: String(point.day),
          name: fmtDay(point.day, { weekday: 'short', day: 'numeric', month: 'short' }),
          note: point.count > 1 ? m.avg_of({ count: String(point.count) }) : undefined,
          value: fmtNativeValue(HIGHEST_METRIC, point.value),
          amount:
            (point.value - euphoriaScale.min) / Math.max(euphoriaScale.max - euphoriaScale.min, 1)
        }))
      : []
  );

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
        note: `${vocabulary.metricNameOf(card.metric)} · ${m.insight_row_sub({
          count: String(card.count),
          with: fmtNativeValue(card.metric, card.withAvg),
          without: fmtNativeValue(card.metric, card.withoutAvg)
        })}`
      };
    })
  );

  /* A position on a cycle is not a day, so the two pattern charts label
     their ends with the position rather than with a date, and they are
     already one point per position - there is nothing to bucket.

     The axis is the position too, and it was missing (Alicja, on the shots):
     both folds drew a value gutter and no ends at all, so the one thing the
     picture is keyed on went unnamed. `interval_day_n` is what the two aria
     labels have always said out loud - "day {from} to day {to}" - now
     written on the chart as well, and the scrub reads the same words as the
     ends it sits between. Not `range_days`, which is the segmented control's
     compact form and rendered "1d" where this wants "Day 1". */
  const positionPoints = (pattern: { position: number; value: number }[]) =>
    pattern.map((p) => ({ x: p.position, y: p.value }));
  const positionLabel = (point: { x: number }) => m.interval_day_n({ n: String(point.x) });
  const positionEnds = (pattern: { position: number }[]) => ({
    from: m.interval_day_n({ n: String(pattern[0].position) }),
    to: m.interval_day_n({ n: String(pattern[pattern.length - 1].position) })
  });

  /* What a fold has to hold before it is drawn.

     Not the range floor the summary panels use, which is what these two were
     wrongly behind: the card says it reads the whole journal and the gate was
     counting entries in the last thirty days, so a long dose history with a
     quiet month hid both cards. And not the bare trend floor either - two
     positions is one straight segment, which is what this drew for somebody
     with a couple of entries and is the empty-chart complaint this whole
     ticket opens with.

     `WRAPPED_ENTRY_FLOOR` positions of the fold's own all-history output:
     five places inside the interval that carry a reading. An existing
     constant, applied to the thing the card actually draws. */
  const foldDrawable = (pattern: readonly unknown[]) => pattern.length >= WRAPPED_ENTRY_FLOOR;

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


  /* Bucketed on its own and then read onto the first series' positions. The
     chart places its points by index, so two series bucketed separately
     would be stretched to the same width whatever their own counts - and
     "do these two move together" is exactly the reading that gets wrong. */
  let comparePlotted = $derived(
    compared
      ? atGrain(
          seriesFor(compared.key).map((p) => ({ x: p.day, y: p.value })),
          range
        )
      : null
  );
  let aligned = $derived(
    comparePlotted ? alignSeries(plotted.points, comparePlotted.points) : null
  );
  /* A scale nothing was logged on over this range has no line to draw. The
     chart would take the overlay, place nothing, and leave a legend naming a
     line that is not there - so the second series is not handed over at all
     and the screen says why instead. Read off the aligned values rather than
     off the query, because a scale can hold readings that all fall outside
     the range the screen is showing. */
  let comparedHasReadings = $derived(aligned?.some((row) => row.b !== null) ?? false);
  /* Named after both scales while both are on the chart: the numbers are
     one series read two ways - the plot and the hidden list under it - and
     a name that mentioned one of them would be hiding the other's. */
  let valuesLabel = $derived(
    compared && comparedHasReadings
      ? m.values_two_title({ first: shown.name, second: compared.name })
      : m.values_title({ name: shown.name })
  );
  /* One role along from the card's own, so the two lines are two stripes of
     the same flag and a palette switch recolours both. */
  let compareRole = $derived(roleAt(activeFlag.roles, AREA_ROLE.charts + 1));

  /* The constellation (phase 5 deepening ticket 19, ADR-0048). Gated on
     data and on nothing else: the card exists once the journal holds a
     presentation, and there is no preference to turn it on, because a
     feature useful to a specific handful of people should cost everyone
     else nothing. For anyone with no modes this screen is what it was.

     Its two axes are the person's own scales, defaulting to the first two
     they have ticked. No dimension key is written here or in the chart:
     naming two would be the app telling a nonbinary reader which two
     numbers matter, which is the one thing PRODUCT.md rules out.

     It reads the screen's range like every other card here, rather than the
     whole history the two interval charts take: the range picker says how
     much journal, and the chart's own scrubber says where in it. */
  let xKey = $state('');
  let yKey = $state('');

  /* Held to the ticked scales on the way out, the same rule `activeMetric`
     follows: unticking the scale an axis was on drops that axis to the
     first one still ticked rather than leaving the chart pointed at
     something the person no longer logs. */
  $effect(() => {
    const active = vocabulary.activeDimensions;
    if (active.length < 2) return;
    if (!active.some((d) => d.key === xKey)) xKey = active[0].key;
    if (!active.some((d) => d.key === yKey) || yKey === xKey) {
      yKey = (active.find((d) => d.key !== xKey) ?? active[0]).key;
    }
  });

  let xScale = $derived(vocabulary.activeDimensions.find((d) => d.key === xKey));
  let yScale = $derived(vocabulary.activeDimensions.find((d) => d.key === yKey));
  let hasConstellation = $derived(vocabulary.presentations.length > 0);
  let canPlot = $derived(hasConstellation && xScale !== undefined && yScale !== undefined);

  /* Picking a scale that is already on the other axis swaps the two rather
     than refusing: with exactly two ticked there is nothing else to pick,
     and flipping the plot is what somebody doing that meant. */
  const pickX = (key: string) => {
    if (key === yKey) yKey = xKey;
    xKey = key;
  };
  const pickY = (key: string) => {
    if (key === xKey) xKey = yKey;
    yKey = key;
  };

  let constellationQuery = liveList((j) => {
    const [x, y] = [xKey, yKey];
    if (!canPlot) return Promise.resolve([]);
    return j.stats.constellationReadings(x, y, from, today);
  });
  /* Kept beside the plotted points rather than folded into them: a position
     is 0 to 1 and a readout is native units (ADR-0012), and the chart is
     handed the first while the sentence a screen reader hears is built from
     the second. */
  let readings = $derived(new Map(constellationQuery.rows.map((r) => [r.id, r])));
  let constellationPoints = $derived(
    xScale && yScale
      ? plotPoints(constellationQuery.rows, { min: xScale.min, max: xScale.max }, { min: yScale.min, max: yScale.max })
      : []
  );
  /* Every mode, hidden ones included. A hidden presentation drops out of
     the chip that offers it and never out of the entries that carry it
     (CONTEXT: "Hidden"), so a point logged under one keeps its colour. */
  let constellationModes = $derived(
    vocabulary.presentations.map((presentation) => ({
      id: presentation.id,
      name: presentation.name,
      role: roleAt(activeFlag.roles, presentation.roleIndex)
    }))
  );
  const constellationDay = (day: number) => fmtDay(day, { day: 'numeric', month: 'short' });
  const constellationReading = (point: ConstellationPoint) => {
    const raw = readings.get(point.id);
    return m.constellation_reading_aria({
      date: fmtDay(point.day, { weekday: 'long', day: 'numeric', month: 'long' }),
      xName: xScale?.name ?? '',
      x: fmtNativeValue(xKey, raw?.x ?? 0),
      yName: yScale?.name ?? '',
      y: fmtNativeValue(yKey, raw?.y ?? 0)
    });
  };

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

  <!-- The journey anchor, which used to be a card: how long since the day
       the journey is anchored on, as a plain line rather than an accent
       number on a surface of its own - the template the slop audit took off
       Home. The run of days ending today sat beside it until phase 8 UX
       ticket 01 deleted the streak. -->
  {#if anchorDuration}
    <p class="stats-caption" data-stats-caption>
      {m.journey_anchor_since({ name: anchor?.name ?? '' })}: {anchorDuration}
    </p>
  {/if}

  <!-- The reads nothing else in the app can do, because they cross areas
       (ADR-0056). This block renders whatever the journal holds and says so
       when it holds too little: it is the tab's own content, and somebody
       arriving on day two should see what the tab becomes rather than a
       blank page. The index below it is the opposite rule. -->
  <SectionHeading text={m.stats_group_cross()} />

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
        points={aligned ? aligned.map((row) => ({ x: row.x, y: row.a })) : plotted.points}
        min={shown.min}
        max={shown.max}
        name={shown.name}
        overlay={aligned && compared && comparedHasReadings
          ? {
              values: aligned.map((row) => row.b),
              min: compared.min,
              max: compared.max,
              name: compared.name,
              formatValue: (v) => fmtNativeValue(compared.key, v),
              role: compareRole
            }
          : undefined}
        from={fmtDay(from, { day: 'numeric', month: 'short' })}
        to={fmtDay(today, { day: 'numeric', month: 'short' })}
        formatValue={(v) => fmtNativeValue(shown.key, v)}
        scrubLabel={grainLabel(plotted.grain)}
        annotations={annotationsQuery.rows}
        ariaLabel={valuesLabel}
      />
      {#if compared && !comparedHasReadings}
        <p class="stats-inline-note">{m.stats_compare_empty()}</p>
      {/if}
      <!-- The second scale, offered rather than presented: a comparison is a
           question somebody has to have first, so until they ask there is a
           line of text here and no second control on the card. Nothing to
           offer at all where the journal holds one scale. -->
      {#if metrics.length > 1 && plotted.points.length}
        <!-- The offer and the picker it becomes, in one row that does not
             move. The constellation's own axis row, because it is the same
             kind of control in the same place: one setting for the picture
             above it, under the plot because the card's heading line already
             holds the chart's own picker.

             The offer stays inside that row rather than sitting where the
             card's other text action sits. Right-aligned under the plot it
             was the twin of "All values" below the card - same weight, same
             colour, two different right edges - and those two are not peers:
             one reconfigures the chart above it and the other opens a sheet
             about something else. -->
        <div class="stats-axes">
          <p class="stats-axis">
            {#if comparing || compared}
              <span id="stats-compare">{m.stats_compare_label()}</span>
              <ChartPicker
                key="stats-compare"
                labelledBy="stats-compare"
                value={compareKey}
                options={compareOptions}
                onPick={(value) => {
                  compareKey = value;
                  comparing = value !== '';
                }}
              />
            {:else}
              <button class="stats-compare-add" data-compare-open onclick={() => (comparing = true)}>
                {m.stats_compare_open()}
              </button>
            {/if}
          </p>
        </div>
      {/if}
    {/if}
  </ChartCard>
  <!-- Every reading in the range, as text. The chart's gutter says what the
       ends of the scale are and the marks carry the shape; this is the one
       place an exact number for a given day can be read, and it is also the
       path a screen reader takes through the series. -->
  <!-- The link and the sheet it opened are gone (ticket 99 item 26, "get rid
       of the 'all values'"), but not the numbers themselves: this list was
       also the only path a screen reader had through the series - the
       chart's own hidden list covers its annotations and says so - and a
       chart that is a picture to everybody and nothing to anybody else is
       not what removing a link was meant to buy. Visually hidden, so it
       costs nothing on the screen Alicja was looking at. -->
  {#if valueRows.length}
    <ul class="visually-hidden" data-values-list aria-label={valuesLabel}>
      {#each valueRows as row (row.key)}
        <li>{row.name}: {row.value}{row.note ? `, ${row.note}` : ''}</li>
      {/each}
    </ul>
  {/if}

  <ChartCard
    heading={m.stats_scales_now()}
    kind="scales"
    role={roleAt(activeFlag.roles, AREA_ROLE.charts)}
  >
    {#if seriesQuery.loading || recapQuery.loading}
      <Skeleton variant="line" count={3} />
    {:else if enoughEntries}
      <BarRows rows={scaleRows} measure="track" />
    {:else}
      <!-- A zero-length bar per ticked scale was what this drew for somebody
           who had never logged one. The floor is WRAPPED_ENTRY_FLOOR, the
           bar a retrospective already clears, and it is a summary panel
           (ADR-0056). -->
      <ChartEmpty>{m.not_enough_data()}</ChartEmpty>
    {/if}
  </ChartCard>

  <!-- The constellation. No role on the card: its marks already carry one
       role each, resolved from the mode they were logged under, and a
       stripe on the frame would be a ninth colour on a surface that is
       already showing eight. The mood distribution takes no role for the
       same shape of reason. -->
  {#if hasConstellation}
    <ChartCard heading={m.stats_constellation()} kind="constellation">
      {#if canPlot && xScale && yScale}
        <ReadGate read={constellationQuery} variant="block">
          {#snippet rows()}
            <GenderConstellationChart
              points={constellationPoints}
              modes={constellationModes}
              x={{ low: xScale.low, high: xScale.high }}
              y={{ low: yScale.low, high: yScale.high }}
              dayLabel={constellationDay}
              readingLabel={constellationReading}
              scrubLabel={m.constellation_scrub()}
              ariaLabel={m.constellation_aria({ x: xScale.name, y: yScale.name })}
            />
          {/snippet}
          {#snippet empty()}
            <ChartEmpty>{m.not_enough_data()}</ChartEmpty>
          {/snippet}
        </ReadGate>
        <!-- Under the plot rather than on the heading's line. There are two
             of them, which is one more than a chart card's control slot
             holds, and the plot already says which scale is on which axis
             in the scales' own words: these are how you change that, not
             how you read it. -->
        <div class="stats-axes">
          <p class="stats-axis">
            <span id="constellation-x">{m.constellation_x_label()}</span>
            <ChartPicker
              key="constellation-x"
              labelledBy="constellation-x"
              value={xKey}
              options={vocabulary.activeDimensions.map((d) => ({ value: d.key, label: d.name }))}
              onPick={pickX}
            />
          </p>
          <p class="stats-axis">
            <span id="constellation-y">{m.constellation_y_label()}</span>
            <ChartPicker
              key="constellation-y"
              labelledBy="constellation-y"
              value={yKey}
              options={vocabulary.activeDimensions.map((d) => ({ value: d.key, label: d.name }))}
              onPick={pickY}
            />
          </p>
        </div>
      {:else}
        <ChartEmpty>{m.constellation_needs_scales()}</ChartEmpty>
      {/if}
    </ChartCard>
  {/if}

  <ChartCard heading={m.stats_mood_days()} kind="mood-days">
    {#if seriesQuery.loading || recapQuery.loading}
      <Skeleton variant="block" />
    {:else if enoughEntries}
      <OrderedStrip steps={moodSteps} />
    {:else}
      <!-- Five columns labelled zero was the other half of the same bug. -->
      <ChartEmpty>{m.not_enough_data()}</ChartEmpty>
    {/if}
  </ChartCard>

  <!-- Share by tag, and the donut's first consumer anywhere (ADR-0058 minted
       the form and named this case). No role: the ring carries the card's
       stripe through its own tint ladder, and a second stripe on the frame
       would be a colour the arcs are already spending. -->
  <ChartCard heading={m.stats_tag_share()} kind="tag-share" role={roleAt(activeFlag.roles, AREA_ROLE.charts)}>
    {#if recapQuery.loading || tagShareQuery.loading}
      <Skeleton variant="block" />
    {:else if enoughEntries && tagParts.length}
      <Donut
        parts={tagParts}
        restName={m.stats_tag_share_rest()}
        total={String(tagUses)}
        note={m.stats_tag_share_note()}
      />
    {:else}
      <ChartEmpty>{m.not_enough_data()}</ChartEmpty>
    {/if}
  </ChartCard>

  <ChartCard heading={m.tag_insights()} kind="tag-insights" role={roleAt(activeFlag.roles, AREA_ROLE.charts)}>
    <!-- Which scale the six bars are of, named once, on the heading's line
         where a chart card keeps its context. Why it is not on each row is
         in `tagInsightRows` (../lib/data/wrappedDisplay.ts), which is where
         the rows are built.

         A picker rather than a label, because the second half of the same
         problem is that this fact was only changeable from the day-by-day
         card four cards up the screen. Same stored preference, so the two
         pickers mirror rather than drift; its own `key`, because that is the
         select's DOM id and there cannot be two of one id. -->
    {#snippet control()}
      <ChartPicker
        key="stats-insight-metric"
        label={m.tag_insights()}
        value={shown.key}
        options={metricOptions}
        onPick={(value) => selectMetric(value === 'mood' ? null : value)}
      />
    {/snippet}
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
    <!-- Inside the card, under the bars it qualifies. It used to hang below
         the card, where a `margin-top` of 8 collapsed under the card's own 24
         and left the sentence sitting 24px under its bars and 16px above the
         next card - reading as a preamble to the wrong chart, after six rows
         had already been taken at face value. -->
    {#if insightRows.length}
      <p class="stats-inline-note">{m.insights_note()}</p>
    {/if}
  </ChartCard>

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

  <!-- The highest days on the person's own euphoria reading (phase 8
       features ticket 20, which shipped the ranking and left the panel to
       this screen). Bar rows and not a list, because the reading somebody
       wants off ten high days is how far apart they were, and ten numbers in
       a column do not say that. Each row opens its day, which is where the
       rest of what happened already lives.

       Absent entirely where the person does not keep that scale: there is no
       fallback to mood, and inventing one would be the app deciding which
       number a high day is measured on. -->
  {#if euphoriaScale}
    <ChartCard
      heading={m.stats_highest_days()}
      kind="highest-days"
      role={roleAt(activeFlag.roles, AREA_ROLE.charts)}
    >
      {#if seriesQuery.loading || recapQuery.loading}
        <Skeleton variant="line" count={3} />
      {:else if enoughEntries && highestRows.length}
        <BarRows rows={highestRows} measure="track" onPick={(key) => goto(`/day/${key}`)} />
        <p class="stats-inline-note">{m.stats_highest_days_note()}</p>
      {:else}
        <ChartEmpty>{m.not_enough_data()}</ChartEmpty>
      {/if}
    </ChartCard>
  {/if}

  <ChartCard
    heading={m.interval_mood_title()}
    kind="interval-mood"
    role={roleAt(activeFlag.roles, AREA_ROLE.patterns)}
  >
    <ReadGate read={intervalMoodQuery} variant="block" count={3}>
      {#snippet rows()}
        {#if foldDrawable(intervalMoodPattern)}
          <!-- Inside the card and above the plot, which is the point
               (ADR-0056). It used to hang under the card and print whether or
               not anything was drawn, so somebody who had never logged a dose
               read about where their days fall across the dosing interval.
               ChartCard takes no prop for a paragraph and still does not; this
               is body content, drawn beside the chart it belongs to and gated
               on the same read. -->
          <!-- What the fold actually is, in the card rather than in a term
               somebody has to already know (ticket 99 item 34: "i dont know
               what it means"). The domain keeps calling this a day of
               interval - CONTEXT.md's own vocabulary, and the axis still
               counts "Day 1" from the injection day - but a chart heading
               is not the place to teach a term, so the heading says what it
               is and this says how to read it. The second sentence is the
               one ADR-0012 asks for: a position says where days fell and
               never where they ought to. -->
          <p class="stats-inline-note">{m.interval_mood_explainer()}</p>
          <p class="stats-inline-note">{m.stats_all_history()}</p>
          {@const ends = positionEnds(intervalMoodPattern)}
          <AreaChart
            points={positionPoints(intervalMoodPattern)}
            min={1}
            max={5}
            from={ends.from}
            to={ends.to}
            formatValue={(v) => v.toFixed(1)}
            scrubLabel={positionLabel}
            ariaLabel={m.interval_mood_chart_aria({
              count: String(intervalMoodPattern.length),
              from: String(intervalMoodPattern[0].position),
              to: String(intervalMoodPattern[intervalMoodPattern.length - 1].position)
            })}
          />
        {:else}
          <ChartEmpty>{m.interval_mood_empty()}</ChartEmpty>
        {/if}
      {/snippet}
      {#snippet empty()}
        <ChartEmpty>{m.interval_mood_empty()}</ChartEmpty>
      {/snippet}
    </ReadGate>
  </ChartCard>
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
        {#if foldDrawable(customIntervalPattern)}
          <p class="stats-inline-note">{m.stats_all_history()}</p>
          {@const ends = positionEnds(customIntervalPattern)}
          <AreaChart
            points={positionPoints(customIntervalPattern)}
            min={1}
            max={5}
            from={ends.from}
            to={ends.to}
            formatValue={(v) => v.toFixed(1)}
            scrubLabel={positionLabel}
            ariaLabel={m.custom_interval_chart_aria({
              days: String(debouncedCustomIntervalLength),
              count: String(customIntervalPattern.length),
              from: String(customIntervalPattern[0].position),
              to: String(customIntervalPattern[customIntervalPattern.length - 1].position)
            })}
          />
        {:else}
          <ChartEmpty>{m.custom_interval_empty()}</ChartEmpty>
        {/if}
      {/snippet}
      {#snippet empty()}
        <ChartEmpty>{m.custom_interval_empty()}</ChartEmpty>
      {/snippet}
    </ReadGate>
  </ChartCard>
  <!-- The area index that used to sit here is gone (ticket 99 item 36,
       "stats shouldnt have the 'more' list at the end. it is only the stats
       tab"): it was one row per area the person uses, in the More hub's own
       four groups and order, and it made the bottom of this tab a second
       copy of that hub. Discovery is the hub's job; this tab is the
       numbers. What is left below is the look-back list, which goes
       somewhere no hub row does. -->
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
      key="compare"
      icon="shuffle"
      title={m.compare_title()}
      subtitle={m.compare_sub()}
      href="/compare"
    />
  </ListCard>

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

<style>
  /* The constellation's two axis pickers (phase 5 deepening ticket 19). Under
     the plot rather than on the heading's line, because there are two of them
     and a chart card holds one control there. A row each, the word on the left
     and the picker on the right, so the two read as a pair of settings for one
     picture rather than as two more charts starting. */
  .stats-axes {
    display: grid;
    gap: var(--space-1);
    margin-top: var(--space-3);
  }

  .stats-axis {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    margin: 0;
    font-size: var(--text-sm);
    color: var(--text-2);
  }

  /* The picker's own cap is 52% of its row, which is right on a chart
     heading's line - the heading is the other half of it. Here the other
     half is one word, so the same cap truncated "Dysphoria" and "euphoria"
     into "Dysphoria ↔ euph...".

     Reaching into a kit class from a route, knowingly. The alternatives are
     worse: scoping kit.css's own rule to `.kit-chart-head` would relax the
     cap under four call sites that are not on a heading line and were laid
     out with it (Home, the calendar, the body map, the sizes screen), and a
     `wide` prop would be a kit option with one caller. Widened rather than
     removed, because a custom scale can be named anything and the pill
     still has to leave its label room. */
  .stats-axis :global(.kit-chart-pick) {
    max-width: 74%;
  }

  /* A line of context inside a chart card, above or below the plot: which
     analyte is drawn, that a fold reads the whole journal, which tags were
     left out, the day a stream ended.

     Inside the card because it belongs to that chart and is gated on the same
     read. `.stats-note` used to hang these under the card instead, and the
     spacing gave the game away: its `margin-top` of 8 collapsed under the
     card's own 24, so a sentence sat 24px below the chart it qualified and
     16px above the next one, reading as a preamble to the wrong card. The
     class is gone and its three consumers are in here.

     ChartCard still takes no prop for a paragraph and does not need one; this
     is body content, which is what its `children` slot is for. */
  .stats-inline-note {
    margin: var(--space-2) 0 0;
    font-size: var(--text-sm);
    line-height: var(--leading-body);
    color: var(--text-2);
  }

  .stats-inline-note:first-child {
    margin: 0 0 var(--space-3);
  }

  /* The offer of a second scale (phase 6 ticket 12), in the row the picker
     will take. An action, so it keeps the accent and the weight the screen's
     other text actions have; on the left, in the row, so it is not the
     right-aligned twin of the "All values" link under the card. At the touch
     floor like every other control here. */
  .stats-compare-add {
    min-height: var(--touch-target);
    padding: 0;
    border: 0;
    background: none;
    color: var(--accent-ink);
    font: inherit;
    font-size: var(--text-sm);
    font-weight: var(--weight-bold);
    text-align: left;
    cursor: pointer;
  }
</style>
