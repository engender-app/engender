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
     how the days fall across the mood scale, what gets written about, tags
     and how a scale moved, the highest days on the person's own euphoria
     reading, and the constellation. It renders whatever the journal holds
     and says "not enough data" where it holds too little, because it is the
     tab's own content and somebody arriving on day two should see what the
     tab becomes.

     Redesign ticket 05 took two things off this block. The two interval
     folds - "mood between injections" and its custom-length twin - printed
     "reads your whole journal, not the range above" beside a screen whose
     whole premise is one range, because they are regimen readings and this
     is not the regimen's screen; both moved to /care under the spine, one
     merged card there instead of two. And tag insights and what-shows-up-
     together were two cards over one ranking, mood filtered to the screen's
     shown scale in one and every scale in the other, drawing the same six
     rows twice on an ordinary range - merged into the one card named above,
     fed by the ranking that already spanned every scale.

     Under it was an index: one row per area the person uses, in the More
     hub's four groups and order. Ticket 99 item 36 took it off - "stats
     shouldnt have the 'more' list at the end. it is only the stats tab" -
     which reverses that half of ADR-0056. Discovery is the hub's job, and
     this tab is the numbers. What is left below the charts is the
     look-back list, which points at wrapped and the body map: destinations
     no hub row covers.

     One floor, an existing constant and not restated: a summary panel needs
     `WRAPPED_ENTRY_FLOOR` entries in range. ADR-0056's other floor,
     `MIN_PLOT_POSITIONS`, went off this screen with the area charts and
     still governs the trends on the screens that own them; Care's own
     interval folds hold to the entry floor too, for the same reason theirs
     did here before the move.

     One disclaimer still hangs under its card rather than inside it, and it
     is the explanatory-paragraph habit's opposite: `insights_note` says
     which tags were left out. A finding is the app telling you what a
     reading means; that is the app declining to.

     `/recap` is gone (spec 07). Its two links here reach the wrapped for
     the same periods, and its arbitrary range is a wrapped of its own.

     Phase 10 redesign ticket 11: the door leads with the person's own
     history. A rail from the earliest day they authored anything dated to
     today (SpanTimeline, lookBackSpan.ts), with two handles bounding a span,
     and that one span is what every reading on this screen is read over -
     the charts below it and the retrospective the "wrapped for this span"
     link opens, which is /wrapped/range at the same query the range
     picker's own two date fields write. The segmented 7-to-365-day range
     control this screen used to open with is gone: the span is the range,
     and it opens on wrapped's own default of the last thirty days. Week,
     month and year are one tap each as links to the three cadence routes.
     The two look-back offers Home used to carry (the wrapped tile and on
     this day) draw here now, under the rail, since this is the door they
     are offers for.

     Redesign ticket 05: the body map and compare take the span too now,
     the way /wrapped/range already did. The body map reads its two dates
     out of the same query, having dropped the 7d-to-365d range picker it
     opened with (body-map/+page.svelte). Compare opens both sides filled -
     the span as A, the same-length stretch before it as B - through
     compareStretch.ts, the query a tryout's or a procedure's own "compare
     this stretch" link already mints; the two pickers on /compare are
     still how either side changes. */
  import { goto } from '$app/navigation';
  import { m } from '$lib/paraglide/messages';
  import { fmtDay, fmtDuration } from '$lib/data/dates';
  import { calendarDuration, localDateFromEpochDay, todayEpochDay } from '$lib/data/epochDay';
  import { liveList, liveQuery } from '$lib/data/live/journal.svelte';
  import { prefs, selectMetric } from '$lib/data/prefs/store.svelte';
  import {
    defaultSpan,
    eraBands,
    eraOfferDue,
    historyBands,
    historyStart,
    spanRangeQuery,
    surgeryMarks,
    type Span
  } from '$lib/data/lookBackSpan';
  import { precedingWindow, compareStretchQuery } from '$lib/data/compareStretch';
  import { alignSeries, atGrain, type Grain } from '$lib/charts/grain';
  import { metricStandings, moodDistribution } from '$lib/data/statsCharts';
  import { recapDimChange } from '$lib/data/recapDisplay';
  import { nativeAmount, nativeValue, signedValue, spreadNote } from '$lib/data/wrappedDisplay';
  import { moodName } from '$lib/data/vocabulary/labels';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { flagBarRole, roleAt, tileRoleAt } from '$lib/theme/roles';
  import Icon from '$lib/components/Icon.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import Segmented from '$lib/components/Segmented.svelte';
  import Sheet from '$lib/components/Sheet.svelte';
  import EntryCard from '$lib/components/EntryCard.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';
  import SpanTimeline from '$lib/components/SpanTimeline.svelte';
  import WordsReading from '$lib/components/WordsReading.svelte';
  import WrappedHomeCard from '$lib/components/WrappedHomeCard.svelte';
  import OnThisDayHomeCard from '$lib/components/OnThisDayHomeCard.svelte';
  import Notice from '$lib/components/kit/Notice.svelte';
  import TileGrid from '$lib/components/kit/TileGrid.svelte';
  import AreaChart from '$lib/components/kit/AreaChart.svelte';
  import GenderConstellationChart from '$lib/components/GenderConstellationChart.svelte';
  import BarRows from '$lib/components/kit/BarRows.svelte';
  import type { BarRow } from '$lib/components/kit/barRow';
  import PairedDots from '$lib/components/kit/PairedDots.svelte';
  import type { PairedRow } from '$lib/components/kit/pairedRow';
  import ChartCard from '$lib/components/kit/ChartCard.svelte';
  import ChartEmpty from '$lib/components/kit/ChartEmpty.svelte';
  import ChartPicker from '$lib/components/kit/ChartPicker.svelte';
  import OrderedStrip from '$lib/components/kit/OrderedStrip.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import ListRow from '$lib/components/kit/ListRow.svelte';
  import SectionHeading from '$lib/components/kit/SectionHeading.svelte';
  import { vocabulary } from '$lib/data/vocabulary/vocabulary';
  import type { DayAverage } from '$lib/data/journal/stats';
  import { plotPoints, type ConstellationPoint } from '$lib/data/constellationData';
  import type { CorrelationCard } from '$lib/data/correlationCards';
  import ReadGate from '$lib/components/kit/ReadGate.svelte';
  import Donut from '$lib/components/kit/Donut.svelte';
  import { crossfade, disclose } from '$lib/motion/reveal';
  import { WRAPPED_ENTRY_FLOOR } from '$lib/data/wrapped';
  import { highestMetricKey, rankHighestDays } from '$lib/data/highestDays';
  import type { Part } from '$lib/charts/parts';

  /** How many entries the sheet behind a tag insight lists. */
  const INSIGHT_ENTRIES = 20;

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
  /* `1` was the two interval folds' own stripe, moved to Care with them
     (redesign ticket 05); `lookBack` keeps its index rather than sliding
     down into the gap, so the palette's own third role still lands where it
     always has here. */
  const AREA_ROLE = { charts: 0, lookBack: 2 };

  /* Read on recompute rather than captured, so a session open across
     midnight moves on (ticket 10). */
  let today = $derived(todayEpochDay());

  /* The rail (redesign ticket 11): where the person's history starts, from
     the three things the journal already dates - its own entry bounds, the
     milestones (mirrored, ADR-0004, so no query), and the eras. Both reads
     are the ones /wrapped/range already makes to resolve an era. */
  let erasQuery = liveList((j) => j.eras.getEras());
  let boundsQuery = liveQuery((j) => j.eras.getJournalBounds());
  let railLoading = $derived(erasQuery.loading || boundsQuery.loading);
  let railStart = $derived(
    railLoading
      ? null
      : historyStart(
          { bounds: boundsQuery.value ?? null, milestones: vocabulary.milestones, eras: erasQuery.rows },
          today
        )
  );

  /* The rest of the rail's history (ticket 06): the regimen episodes,
     tryouts and journaling pauses it draws as bands and the procedures it
     draws as marks. One question rather than four - `getAnnotations` is
     already the app's single "what happened between these days" query and
     every one of these kinds is in its answer - asked over the whole rail
     rather than over the span, since the rail is what is behind the person
     and the span is only the part of it they are pointing at. The two
     kinds it also returns that the rail draws its own way, eras and
     milestones, are dropped by `historyBands` and `surgeryMarks`. */
  let railAnnotationsQuery = liveList(async (j) => {
    const start = railStart;
    if (start === null) return [];
    return j.chartAnnotations.getAnnotations(start, today, today);
  });
  let railHistory = $derived(historyBands(railAnnotationsQuery.rows));
  let railSurgeries = $derived(surgeryMarks(railAnnotationsQuery.rows));

  /* The span, settled. Null until the rail is known, then wrapped's own
     default window; from there it is the person's, and a later write that
     moves the rail's start does not move a span they have placed. `live`
     is the same span as the finger has it, for the line under the title. */
  let span = $state<Span | null>(null);
  let live = $state<Span | null>(null);
  $effect(() => {
    const start = railStart;
    if (start === null || span !== null) return;
    span = defaultSpan(start, today);
    live = span;
  });
  /* Picking an existing era counts as handled too (redesign ticket 48
     review): tapping an era band on the rail (SpanTimeline's own `pickEra`)
     settles the span on that era's exact dates through this same
     `pickSpan`, and a stretch already named is not the "just dragged this
     out" moment the offer is for - naming it again would only fail
     `eras.ts`'s own overlap invariant. Exact-match only, not "overlaps
     one": a drag that reaches past or across an existing era is still a new
     stretch worth offering, and saving it is exactly what the sheet's
     conflict answer (the "eras" flow above) is for. Resolved with
     `eraBands`, the same clamp `SpanTimeline` draws the bands with, so an
     open-ended era is matched at the day it draws as its edge. */
  let existingEraSpans = $derived(
    railStart === null ? [] : eraBands(erasQuery.rows, railStart, today).map((band) => ({ start: band.start, end: band.end }))
  );
  const pickSpan = (next: Span) => {
    span = next;
    live = next;
    const isExistingEra = existingEraSpans.some((era) => era.start === next.start && era.end === next.end);
    eraOfferSpan = !isExistingEra && eraOfferDue(next, handledEraOfferSpans) ? next : null;
  };

  /* The "name this stretch" offer (redesign ticket 48): once a span the
     person dragged settles, one offer to turn it into an era, on this
     surface and nowhere else - no Today notice, no tile, no notification.
     `handledEraOfferSpans` is every span named or dismissed this session, so
     nudging a handle by a day or narrowing inside a span just dismissed does
     not raise a second offer for substantially the same stretch
     (`eraOfferDue`, lookBackSpan.ts). Plain component state, gone on reload,
     the same shape UpdateNotice's own dismiss keeps: nothing here is a
     preference an app-wide "no" would have to remember forever. */
  let eraOfferSpan = $state<Span | null>(null);
  let handledEraOfferSpans = $state<Span[]>([]);
  const settleEraOffer = (handled: Span) => {
    handledEraOfferSpans = [...handledEraOfferSpans, handled];
    eraOfferSpan = null;
  };

  /* Two epoch days to the journal, which never reads the clock for a
     domain answer: the span's own, and wrapped's default until the rail
     has answered, so the charts have something honest to read while it
     does. Inclusive of both ends. `range` is the span's length, which is
     what the chart's grain is chosen by. */
  let from = $derived(span?.start ?? defaultSpan(today, today).start);
  let to = $derived(span?.end ?? today);
  let range = $derived(to - from + 1);
  /* `from`/`to` as a `Span` object, for the two look-back rows below: they
     are reached whether or not a real span exists yet, the same as every
     chart on this screen, and want the pair spanRangeQuery/compareStretchQuery
     take rather than the two loose numbers. */
  let resolvedSpan = $derived<Span>({ start: from, end: to });

  /* The span, written once under the title with its length (DIRECTION.md
     rule 7). Years only where they carry information: the start's when it
     is not this year, the end's when it is not this year either. The
     length used to sit on its own line under the rail and the top of the
     door read as crowded (Alicja, on the first renders). */
  const dayWithYear = (day: number, year: number) =>
    fmtDay(day, localDateFromEpochDay(day).getFullYear() === year
      ? { day: 'numeric', month: 'short' }
      : { day: 'numeric', month: 'short', year: 'numeric' });
  let spanLabel = $derived.by(() => {
    if (!live) return '';
    const year = localDateFromEpochDay(today).getFullYear();
    const days = live.end - live.start + 1;
    return `${m.wrapped_week_range({ from: dayWithYear(live.start, year), to: dayWithYear(live.end, year) })}, ${m.n_days({ n: days })}`;
  });

  /* Week, month and year, one tap each, to the cadence routes they have
     always reached (spec: "week, month and year sit beside it as quick
     picks"). Links, so the group is a nav and each is its own screen. */
  const QUICK_PICKS = [
    { value: 'week', href: '/wrapped/week', label: () => m.wrapped_cadence_week() },
    { value: 'month', href: '/wrapped/month', label: () => m.wrapped_cadence_month() },
    { value: 'year', href: '/wrapped/year', label: () => m.wrapped_cadence_year() }
  ];

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
  let annotationsQuery = liveList((j) => j.chartAnnotations.getAnnotations(from, to, today));

  /* One query for every metric on screen rather than one per chart: the
     day-by-day chart plots one at a time but the bars card needs all of
     them, and asking per card would mean a round trip per active dimension
     every time the range changes. */
  let seriesQuery = liveQuery(async (j) => {
    const keys = metrics.map((mt) => mt.key);
    const [rangeFrom, rangeTo] = [from, to];
    const series = await Promise.all(keys.map((key) => j.stats.dayAverages(key, rangeFrom, rangeTo)));
    return new Map(keys.map((key, i) => [key, series[i]]));
  });
  /* One default for the whole answer: a metric with no days in range is a
     missing key in a Map that exists, not a missing Map, and defaulting at
     the lookup made the two look like the same thing. */
  let series = $derived(seriesQuery.value ?? new Map<string, DayAverage[]>());
  let seriesFor = $derived((key: string): DayAverage[] => series.get(key) ?? []);

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
  let spreadsQuery = liveList((j) => j.stats.daySpread(shown.key, from, to));
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
        amount: point
          ? (nativeAmount(shown.key, point.value) - shown.min) / Math.max(shown.max - shown.min, 1)
          : 0
      };
    })
  );

  /* Ranged to the screen's own `from`/`today` (carpet ticket 19), so the
     list behind a row is the row's own evidence and not whatever the tag's
     twenty most recent carriers happened to be across the whole journal.
     Fetched one past the cap so a full page can say it is one: past
     `INSIGHT_ENTRIES` there is no way to tell "exactly the cap" from "more
     exist" without asking for one more. */
  let insightEntriesQuery = liveList((j) => {
    const sheet = insightSheet;
    if (!sheet) return Promise.resolve([]);
    return j.entries.entriesWithTag(sheet.id, from, to, INSIGHT_ENTRIES + 1);
  });
  let insightEntriesCapped = $derived(insightEntriesQuery.rows.length > INSIGHT_ENTRIES);
  let insightEntries = $derived(insightEntriesQuery.rows.slice(0, INSIGHT_ENTRIES));

  /* Correlation cards (phase 4 ticket 21) - a deliberate reversal of
     phase 3's explicit exclusion of correlation analysis, not scope
     drift the phase 3 decision missed. Ranked and capped by the journal
     area itself; this screen only renders what it returns. */
  let correlationCardsQuery = liveList((j) =>
    j.correlationCards.getCards(from, to)
  );
  let correlationCards = $derived(correlationCardsQuery.rows);

  /* ---------------------------------------------------------------------
     The recap, for three things at once (ADR-0056).

     `entryCount` is the floor every summary panel on this screen is held to
     - WRAPPED_ENTRY_FLOOR, the same bar a retrospective clears before the
     app offers one - `topTags` is the donut's whole data source, and
     `biggestDimensionChange` feeds the span's facts below (redesign ticket
     05). One read answers all three, which is why the screen pays for a
     recap rather than counting entries itself: nothing here folds a figure
     the module that owns it does not already produce (ADR-0010). */
  let recapQuery = liveQuery((j) => j.stats.recap(from, to));
  let entryCount = $derived(recapQuery.value?.entryCount ?? 0);
  /* Under the floor and while the read is in flight both read as "not
     enough", and the difference is carried by the skeleton the ReadGate
     draws rather than by a second empty state. */
  let enoughEntries = $derived(entryCount >= WRAPPED_ENTRY_FLOOR);

  /* The span's facts (redesign ticket 05, the ticket's own headline: "zero
     facts in the first viewport"). Wrapped's own three-line shape
     (WrappedCompact.svelte, recapDisplay.ts's naming step), with one
     deliberate difference: wrapped's second line is always mood, and this
     one is whichever scale the person has active - the same preference the
     day-by-day chart and the merged tag card above already shade by - so
     the door's first number is never a scale nobody keeps. `scaleRows`
     already carries every metric's own native average (ticket 11's own
     "Each scale, this period" card); this looks up the shown one rather
     than reading a second time. */
  let dimChange = $derived(recapQuery.value ? recapDimChange(recapQuery.value) : null);
  let activeScaleRow = $derived(scaleRows.find((row) => row.key === shown.key));

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
  let tagShareQuery = liveList((j) => j.stats.tagShare(from, to));
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

  /* The highest days on one of the person's own readings (phase 8 features
     ticket 20, which shipped the ranking and left the panel here; phase 9
     carpet ticket 11, which gave the panel its chooser).

     `rankHighestDays` rather than `highestDays`: the async half asks the day
     assembler for each ranked day, which is ten days times nineteen areas of
     bounded reads, and every one of those answers is already a tap away
     behind the row. So the panel ranks what `seriesQuery` fetched for the
     range - no read of its own at all - and the row opens the day.

     The chooser is local to this card and not `selectMetric`, which is the
     screen's stored preference (Alicja's call, ticket 11). Home's week strip
     and the calendar's month grid shade by that preference, so a control
     near the bottom of this screen writing to it would repaint two other
     screens; re-ranking ten days is not that big a decision. `highestKey` is
     null until somebody moves it, and `highestMetricKey` decides what null
     means - euphoria where it is kept, the screen's own scale otherwise. It
     also drops a choice whose scale has since been unticked in settings.

     No gate on the card any more. It used to render only for somebody
     keeping euphoria; every journal has mood, so the chooser always has
     something to offer and somebody who keeps no gender scale still gets
     their highest mood days. */
  let highestKey = $state<string | null>(null);
  let highestRanks = $derived(
    highestMetricKey(
      highestKey,
      metrics.map((each) => each.key),
      shown.key
    )
  );
  /* `?? shown` is the type's, not a case: every key `highestMetricKey` can
     answer with came out of `metrics` in the first place. */
  let highestMetric = $derived(metrics.find((mt) => mt.key === highestRanks) ?? shown);
  let highestRows = $derived<BarRow[]>(
    rankHighestDays(today, seriesFor(highestMetric.key)).map((point) => ({
      key: String(point.day),
      name: fmtDay(point.day, { weekday: 'short', day: 'numeric', month: 'short' }),
      note: point.count > 1 ? m.avg_of({ count: String(point.count) }) : undefined,
      value: fmtNativeValue(highestMetric.key, point.value),
      amount:
        (nativeAmount(highestMetric.key, point.value) - highestMetric.min) /
        Math.max(highestMetric.max - highestMetric.min, 1)
    }))
  );

  const occurrenceLabel = (card: CorrelationCard) =>
    card.occurrence.kind === 'doseDay'
      ? m.correlation_card_dose_day()
      : (vocabulary.tag(card.occurrence.id)?.label ?? card.occurrence.id);

  /* The merged tag card (redesign ticket 05): tag insights and what-shows-
     up-together used to be two cards over the same ranking, mood filtered
     to one metric and everything filtered to none, and on an ordinary
     range that drew the same six rows twice, bars in one card and paired
     dots in the other. One card now, fed by the one ranking that already
     spans every scale and the dose day (correlationCards.ts), drawn as
     paired dots - Alicja's call, over the bars the tag-insights half used
     to draw: PairedDots needs no normalizing to mix scales in one set the
     way a bar's leader measure would, since every row is already read
     against its own track rather than against the others. Each row's own
     metric named on its note, since a row can no longer lean on "the card
     is all one scale" the way a single-metric tag list could. */
  const metricBounds = (key: string) => {
    const dimension = vocabulary.metricDimension(key);
    return dimension ? { min: dimension.min, max: dimension.max } : { min: 1, max: 5 };
  };

  /* A row's key rather than the bare tag id: the same tag can rank under
     two different metrics now, and a keyed `{#each}` cannot hold two rows
     of one id. Built the same way twice - once for the row, once to find
     the card a tapped row came from - so the two never drift apart. */
  const correlationKey = (card: CorrelationCard) =>
    `${card.occurrence.kind}-${card.occurrence.kind === 'tag' ? card.occurrence.id : 'dose'}-${card.metric}`;

  let correlationRows = $derived<PairedRow[]>(
    correlationCards.map((card) => {
      const bounds = metricBounds(card.metric);
      return {
        key: correlationKey(card),
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

  /* Only a tag row opens the entries-with-this-tag sheet: a dose day has no
     tag id to look one up by, and the sheet has nothing to show it. */
  const pickCorrelationRow = (key: string) => {
    const card = correlationCards.find((c) => correlationKey(c) === key);
    if (card?.occurrence.kind === 'tag') {
      insightSheet = { id: card.occurrence.id, label: vocabulary.tag(card.occurrence.id)?.label ?? card.occurrence.id };
    }
  };

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
    return j.stats.constellationReadings(x, y, from, to);
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
  <!-- The door's title at 48 on the field, and nothing under it: the span
       used to be the header's subtitle and sat two elements above the rail
       it was a reading of, where it parsed as a subtitle of the door
       (ticket 06). It is written under the rail now, against the handles
       that move it. -->
  <ScreenHeader title={m.nav_lookback()} screen="stats" />

  <!-- Week, month and year, one tap each: the three completed cadences at
       their own routes, in the square track. None is current here. -->
  <Segmented
    name={m.wrapped_cadence_group()}
    options={QUICK_PICKS.map((pick) => ({ value: pick.value, label: pick.label(), href: pick.href }))}
    value=""
    compact
    key="lookback-quick"
  />

  <!-- The history, and the span pointed at on it (redesign ticket 11).
       Entry data behind the rail's start, so it waits; a journal with
       nothing dated yet says so instead of drawing a rail from today to
       today. -->
  {#if railLoading}
    <Skeleton variant="block" count={1} />
  {:else if railStart === null}
    <Notice icon="clock" key="lookback-empty" title={m.lookback_empty_title()} text={m.lookback_empty_body()} />
  {:else if span}
    <div class="lookback-rail" data-lookback-rail>
      <SpanTimeline
        {railStart}
        {today}
        {span}
        eras={erasQuery.rows}
        milestones={vocabulary.milestones}
        history={railHistory}
        surgeries={railSurgeries}
        firstEntryDay={boundsQuery.value?.firstEpochDay ?? null}
        hintSeen={prefs.spanRailHintDismissed}
        flagFill={activeFlag.fill}
        roles={activeFlag.roles}
        onChange={pickSpan}
        onLive={(next) => (live = next)}
        onHintSeen={() => (prefs.spanRailHintDismissed = true)}
      />
      <!-- The way into the span's retrospective: the same range read wrapped
           already makes, at the URL the range picker itself would write for
           these two days. Under the floor the line says why there is
           nothing to open, in the words the range view uses for the same
           case. -->
      <div class="lookback-line">
        {#if recapQuery.loading}
          <span class="lookback-thin" aria-hidden="true"></span>
        {:else if enoughEntries}
          <a class="lookback-read" data-lookback-read data-span-keep href={`/wrapped/range${spanRangeQuery(span)}`}>
            {m.lookback_read_span()}
          </a>
        {:else}
          <span class="lookback-thin" data-lookback-thin>
            {m.wrapped_thin_body({ count: entryCount, floor: String(WRAPPED_ENTRY_FLOOR) })}
          </span>
        {/if}
      </div>
    </div>

    <!-- The span's facts (redesign ticket 05: "zero facts in the first
         viewport" was the whole-app audit's own finding 1). Wrapped's own
         three-line shape, directly under the rail and before any card - the
         first number on the door used to be four cards down, in Each
         scale, this period. `enoughEntries` is the one floor every summary
         panel here shares; under it the thin-body line above already says
         why there is nothing to open, so this draws nothing rather than a
         second "not enough" message for the same span. -->
    {#if recapQuery.loading}
      <Skeleton variant="line" count={3} />
    {:else if enoughEntries}
      <ListCard role={roleAt(activeFlag.roles, AREA_ROLE.lookBack)}>
        <ListRow static data-lookback-fact title={m.wrapped_stat_entries()}>
          {#snippet trailing()}<b class="wrapped-figure-value">{entryCount}</b>{/snippet}
        </ListRow>
        {#if activeScaleRow?.value}
          <ListRow static data-lookback-fact title={m.lookback_facts_average({ name: shown.name })}>
            {#snippet trailing()}<b class="wrapped-figure-value">{activeScaleRow.value}</b>{/snippet}
          </ListRow>
        {/if}
        {#if dimChange}
          <ListRow
            static
            data-lookback-fact
            title={m.wrapped_scale_arc()}
            subtitle={m.wrapped_scale_arc_body({
              name: dimChange.name,
              from: String(Math.round(dimChange.from)),
              to: String(Math.round(dimChange.to))
            })}
          >
            {#snippet trailing()}
              <b class="wrapped-figure-value">{signedValue(dimChange.change, (n) => String(Math.round(n)))}</b>
            {/snippet}
          </ListRow>
        {/if}
      </ListCard>
    {/if}

    <!-- "Name this stretch" (redesign ticket 48): a person who has just
         dragged out a span is offered the chance to name it, on this surface
         and nowhere else - `eras.ts`'s two invariants aside, an era minted
         here is indistinguishable from one made on /transition/eras, since
         the link hands over the span's own dates and the editor's own save
         is the only write (the same "mints nothing itself" shape
         `offers.ts` documents for "start an era here"). `disclose` opens and
         gives back its own height rather than shoving the tiles below in one
         frame either way. -->
    {#if eraOfferSpan}
      {@const offerSpan = eraOfferSpan}
      <div class="era-offer" data-era-offer role="group" aria-labelledby="era-offer-title" transition:disclose>
        <div class="era-offer-said">
          <span class="kit-row-ico"><Icon name="columns" size={22} /></span>
          <span class="kit-row-text">
            <span class="kit-row-title" id="era-offer-title">{m.lookback_era_offer_title()}</span>
            <span class="kit-row-sub">{m.lookback_era_offer_body()}</span>
          </span>
        </div>
        <div class="era-offer-answers">
          <a
            class="era-offer-yes"
            data-era-offer-confirm
            data-span-keep
            href={`/transition/eras?start=${offerSpan.start}&end=${offerSpan.end}`}
            onclick={() => settleEraOffer(offerSpan)}
          >
            {m.lookback_era_offer_confirm()}
          </a>
          <button type="button" class="era-offer-no" data-era-offer-dismiss onclick={() => settleEraOffer(offerSpan)}>
            {m.lookback_era_offer_dismiss()}
          </button>
        </div>
      </div>
    {/if}

    <!-- The two look-back offers, moved here from Home (spec: "the wrapped
         and on-this-day teasers live here"). Each gates itself on its own
         preference and its own floor, so the grid can be empty and then it
         has no height. -->
    <TileGrid
      role={tileRoleAt(activeFlag.roles, AREA_ROLE.lookBack)}
      bar={flagBarRole(activeFlag.roles, tileRoleAt(activeFlag.roles, AREA_ROLE.lookBack))}
      data-tight
    >
      {#if prefs.wrappedEnabled}
        <WrappedHomeCard />
      {/if}
      {#if prefs.onThisDayEnabled}
        <OnThisDayHomeCard />
      {/if}
    </TileGrid>
  {/if}

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
      <div out:crossfade><Skeleton variant="block" count={1} /></div>
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
        to={fmtDay(to, { day: 'numeric', month: 'short' })}
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
      <div out:crossfade><Skeleton variant="line" count={3} /></div>
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
        <ReadGate read={constellationQuery} variant="block" count={1}>
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
      <div out:crossfade><Skeleton variant="block" count={1} /></div>
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
      <div out:crossfade><Skeleton variant="block" count={1} /></div>
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

  <!-- The words reading (redesign ticket 62), next to the tag donut because
       the two ask the same question of two different halves of an entry:
       what the tags say this stretch was about, and what the notes' own
       words say. It was a screen behind the Transition tab and a hub row
       pointing at it, and the registry had said `home: 'stats'` since phase
       8. Its own card rather than a row on the look-back list below: a row
       is a way somewhere else, and this is a reading that draws here. -->
  <WordsReading role={roleAt(activeFlag.roles, AREA_ROLE.charts)} />

  <!-- The merged tag card (redesign ticket 05). Tag insights and what shows
       up together were two cards over one ranking - one filtered to the
       shown scale, one spanning every scale and the dose day - and on an
       ordinary range that meant the same six rows twice, bars in one card
       and paired dots in the other. Paired dots is the survivor (Alicja's
       call, over the bars the tag-insights half drew): a bar's leader
       measure ranks every row against the longest one in the set, which
       needs normalizing the moment two scales share a card, and a paired
       dot never ranks a row against another - each one reads against its
       own track, which is what let mixed scales into one set with no
       arithmetic of its own. The picker still writes the screen's stored
       metric, the same mirrored control the day-by-day chart above keeps in
       step with; it is not what filters this card's own rows any more,
       which is what let the dose day and every other scale in. -->
  <ChartCard heading={m.stats_tags_moved()} kind="tags-moved" role={roleAt(activeFlag.roles, AREA_ROLE.charts)}>
    {#snippet control()}
      <ChartPicker
        key="stats-insight-metric"
        label={m.stats_tags_moved()}
        value={shown.key}
        options={metricOptions}
        onPick={(value) => selectMetric(value === 'mood' ? null : value)}
      />
    {/snippet}
    <ReadGate read={correlationCardsQuery} variant="line" count={3}>
      {#snippet rows()}
        <PairedDots rows={correlationRows} onPick={pickCorrelationRow} />
      {/snippet}
      {#snippet empty()}
        <ChartEmpty>{m.correlation_cards_empty()}</ChartEmpty>
      {/snippet}
    </ReadGate>
    <!-- Inside the card, under the rows it qualifies. -->
    {#if correlationRows.length}
      <p class="stats-inline-note">{m.insights_note()}</p>
    {/if}
  </ChartCard>

  <!-- The highest days on one of the person's own readings (phase 8
       features ticket 20, which shipped the ranking and left the panel to
       this screen; phase 9 carpet ticket 11, which gave it the chooser).
       Bar rows and not a list, because the reading somebody wants off ten
       high days is how far apart they were, and ten numbers in a column do
       not say that. Each row opens its day, which is where the rest of what
       happened already lives.

       The chooser writes `highestKey` and not the screen's stored metric,
       so ranking these ten days by femininity does not also repaint Home's
       week strip and the calendar's month grid. -->
  <ChartCard
    heading={m.stats_highest_days()}
    kind="highest-days"
    role={roleAt(activeFlag.roles, AREA_ROLE.charts)}
  >
    {#snippet control()}
      <ChartPicker
        key="highest-metric"
        label={m.stats_highest_days()}
        value={highestMetric.key}
        options={metricOptions}
        onPick={(value) => (highestKey = value)}
      />
    {/snippet}
    {#if seriesQuery.loading || recapQuery.loading}
      <div out:crossfade><Skeleton variant="line" count={3} /></div>
    {:else if enoughEntries && highestRows.length}
      <BarRows
        rows={highestRows}
        measure="track"
        form="inline"
        onPick={(key) => goto(`/day/${key}`)}
      />
      <p class="stats-inline-note">{m.stats_highest_days_note()}</p>
    {:else}
      <ChartEmpty>{m.not_enough_data()}</ChartEmpty>
    {/if}
  </ChartCard>

  <!-- The area index that used to sit here is gone (ticket 99 item 36,
       "stats shouldnt have the 'more' list at the end. it is only the stats
       tab"): it was one row per area the person uses, in the More hub's own
       four groups and order, and it made the bottom of this tab a second
       copy of that hub. Discovery is the hub's job; this tab is the
       numbers. What is left below is the look-back list, which goes
       somewhere no hub row does. -->
  <!-- The deeper screens as one list rather than cards. Four same-size
       icon-plus-heading-plus-text tiles were what the slop audit took off
       this screen; a destination with nothing to show on it is a row. The
       three wrapped rows that used to open the list went with redesign
       ticket 11: last month and last year are the quick picks under the
       title, and any range is the span on the rail.

       The milestone timeline joined this list in ticket 13 and left again
       in redesign ticket 43, which merged the rail into the milestones
       screen on the Transition door. It was the one row here that opened
       another area's screen, and every other row on this list lights this
       same tab; Look back keeps the readings it owns.

       The words row left too, in redesign ticket 62, and it left in the
       other direction: the reading it pointed at draws on this screen now
       (WordsReading, above the tag insights), so there is nothing for a row
       to open. Two rows left, both of them a screen this tab owns. -->
  <SectionHeading text={m.stats_look_back()} />
  <ListCard role={roleAt(activeFlag.roles, AREA_ROLE.lookBack)}>
    <!-- Takes the span itself now (redesign ticket 05) and has dropped its
         own 7d-to-365d range control - the same query /wrapped/range reads,
         though the body map only ever wants the two dates out of it. -->
    <ListRow
      key="body-map"
      icon="grid"
      title={m.body_map_title()}
      subtitle={m.body_map_sub()}
      href={`/body-map${spanRangeQuery(resolvedSpan)}`}
    />
    <!-- Opens filled (redesign ticket 05): the span as side A and the
         same-length stretch before it as side B, through the query
         compareStretch.ts already mints for a tryout's or a procedure's own
         "compare this stretch" link. The pickers on /compare are still how
         either side changes; this only supplies where they open. -->
    <ListRow
      key="compare"
      icon="shuffle"
      title={m.compare_title()}
      subtitle={m.lookback_compare_sub()}
      href={compareStretchQuery(resolvedSpan, precedingWindow(resolvedSpan))}
    />
  </ListCard>

  <Sheet open={insightSheet !== null} title={insightSheet?.label ?? ''} onClose={() => (insightSheet = null)}>
    {#if insightSheet}
      <h3>{insightSheet.label}</h3>
      <p class="stats-inline-note" data-insight-sheet-range>{spanLabel}</p>
      {#if insightEntriesCapped}
        <p class="stats-inline-note" data-insight-sheet-capped>
          {m.insight_sheet_capped({ shown: String(INSIGHT_ENTRIES) })}
        </p>
      {/if}
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
  /* The rail and the line under it (redesign ticket 11) are one block of
     the screen: the rail's own inner rhythm is 12. */
  .lookback-rail {
    display: grid;
    gap: var(--space-3);
  }

  /* The way into the span's wrapped, at the secondary size. The link is
     the underlined ink a heading's action takes (kit.css,
     `.kit-heading-action`): on a page whose colour is spent as blocks, an
     accent-coloured word is a fourth voice. */
  .lookback-line {
    display: flex;
    align-items: center;
    min-height: var(--touch-target);
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
    color: var(--text-2);
  }

  .lookback-read {
    display: flex;
    align-items: center;
    min-height: var(--touch-target);
    color: var(--text);
    font-weight: var(--weight-bold);
    text-decoration: underline;
    text-underline-offset: 3px;
    text-decoration-thickness: 2px;
  }

  .lookback-thin {
    min-width: 0;
  }

  /* The "name this stretch" offer (redesign ticket 48), drawn as rule 13's
     offer row - the icon block, the title, one reason line, and the two
     labelled answers under them (coming-back/+page.svelte's own
     `.return-offer`, which this repeats rather than shares: that one sits
     inside a flush list with its own hairlines, and this one is a single
     block between the rail and the tile grid). Not a `Notice`: the ticket's
     own decision is that this offer lives on the surface the person just
     drove, not in the app's generic "the app is telling you something"
     voice. */
  .era-offer {
    padding: var(--space-2) 0;
  }

  .era-offer-said {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    min-height: var(--touch-target);
  }

  /* Indented to the text column - 36 is the icon square and 12 is the
     row's gap - so the two answers line up under what they are
     answering. */
  .era-offer-answers {
    display: flex;
    align-items: center;
    gap: var(--space-5);
    padding-left: calc(36px + var(--space-3));
  }

  .era-offer-yes,
  .era-offer-no {
    min-height: var(--touch-target);
    display: inline-flex;
    align-items: center;
    border: 0;
    background: none;
    padding: 0;
    cursor: pointer;
    font-family: var(--font-body);
    font-size: var(--text-sm);
    font-weight: var(--weight-bold);
    text-decoration: underline;
    text-underline-offset: 3px;
    text-decoration-thickness: 2px;
  }

  .era-offer-yes {
    color: var(--text);
  }

  .era-offer-no {
    color: var(--text-2);
  }

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
