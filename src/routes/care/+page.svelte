<script lang="ts">
  /* The care overview (phase 5 deepening ticket 07, ADR-0036: a feature
     surface, so it lives in the More hub rather than under /settings).

     What this screen does NOT do is the point of it. The ticket it comes
     from used to ask for an interactive care canvas - a pharmacokinetic
     curve, computed draw context, an exposure counter, a stock horizon -
     and every one of those had already shipped: /care/curve, labTiming.ts,
     journal/exposure.ts, stockProjection.ts. So there is no modelling here
     and no second calculation of anything. Every figure on this screen is a
     live read of a module that already owned it, and the only arithmetic in
     the diff is careSpine.ts working out where a set of days sit on one
     line.

     One lane per running drug (phase 11 ticket 10, ADR-0012: lanes are
     categorical, one stripe per drug, and no drug is primary). Before it
     the rail drew one episode's days and every other running regimen fell
     to a grey two-line row under an "Other regimens" heading - which for
     the ordinary case of a hormone beside a daily pill meant two of three
     drugs were running off the rail. Each lane now carries its own last
     dose, next dose and run-out against the shared axis, and today and the
     most recent draw are drawn once down the whole of it.

     Nothing here judges. A lane says when things happened and when the
     schedule expects the next one; no mark is late, no interval is the right
     one, no lane is ranked against another, and no lab value is read as
     anything (PRODUCT.md:109, and labTiming.ts and /care/curve as the worked
     precedents). */
  import { m } from '$lib/paraglide/messages';
  import AreaChart from '$lib/components/kit/AreaChart.svelte';
  import ChartCard from '$lib/components/kit/ChartCard.svelte';
  import ChartEmpty from '$lib/components/kit/ChartEmpty.svelte';
  import DatePicker from '$lib/components/DatePicker.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import ListRow from '$lib/components/kit/ListRow.svelte';
  import Notice from '$lib/components/kit/Notice.svelte';
  import HostedRows from '$lib/components/HostedRows.svelte';
  import ReadGate from '$lib/components/kit/ReadGate.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import Segmented from '$lib/components/Segmented.svelte';
  import Sheet from '$lib/components/Sheet.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';
  import Field from '$lib/components/kit/Field.svelte';
  import SectionHeading from '$lib/components/kit/SectionHeading.svelte';
  import { journal, liveList, liveQuery } from '$lib/data/live/journal.svelte';
  import {
    careSpine,
    railEpisodes,
    scheduleDoseFacts,
    SPINE_FORWARD_DAYS,
    type SpineMark,
    type SpineMarkKind
  } from '$lib/data/careSpine';
  import {
    dateInputValueFromEpochDay,
    epochDayFromDateInputValue,
    epochDayFromDateInputValueOrToday,
    ongoingWindowRange,
    startOfDayTimestamp,
    todayEpochDay
  } from '$lib/data/epochDay';
  import { fmtDay } from '$lib/data/dates';
  import { activeEpisodesAt } from '$lib/data/regimenEpisode';
  import { resolveCurveDrug } from '$lib/data/hormoneDrug';
  import { matchDoseRoute } from '$lib/data/doseSchedule';
  import type { RegimenEpisode } from '$lib/data/types';
  import { depletingStocks, drugsMatch } from '$lib/data/stockProjection';
  import { ROUTE_OPTIONS, routeLabel } from '$lib/data/vocabulary/doseLabels';
  import { stockRemainingLabel, stockRunOutLabel, stockOpenedWindowLine } from '$lib/data/vocabulary/stockLabel';
  import type { StockProjectionRow } from '$lib/data/journal/stock';
  import { CLINICIAN_DOSSIER_INCLUSION_KEYS } from '$lib/data/export/clinicianSummaryData';
  import { WRAPPED_ENTRY_FLOOR } from '$lib/data/wrapped';
  import { crossfade } from '$lib/motion/reveal';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';
  import { roleAttrs } from '$lib/components/kit/role';

  /* Two areas outside the lanes: the rail's own card, and the readings that
     do not fit on one. The rail takes role 0, the only index that is a
     colour on all eight palettes (roles.ts). Each lane inside it then takes
     its own stripe by index, which is where the stripe is carrying the most
     meaning on this screen - it is what says which line belongs to which
     drug. */
  const AREA_ROLE = { rail: 0, readings: 1 };

  const today = todayEpochDay();
  const dayLabel = (epochDay: number) => fmtDay(epochDay, { day: 'numeric', month: 'short' });
  /* The weekday said out loud, the same format Today's own dose tile uses
     (liveTiles.svelte.ts): a block states a day somebody has to recognise
     as a day of their week, where the rail's captions state a date under a
     mark and have no room for more. */
  const dayWithWeekday = (epochDay: number) => fmtDay(epochDay, { weekday: 'long', day: 'numeric', month: 'long' });

  /* The whole dose log rather than a window, the way /doses reads it for
     rotation-site recency: "the last dose" has to mean the last one, and a
     window would report none for anyone who paused for longer than it.
     careSpine clamps a dose older than the rail's reach to its left end and
     flags it, so an old dose reads as old rather than as absent. */
  let dosesQuery = liveList((j) => j.doses.getDoses(0, today));
  let episodesQuery = liveList((j) => j.regimen.getEpisodes());
  /* Every episode's own schedule and pauses, read whole (doses.ts: both are
     small, one row per episode) rather than through getComparison, which
     answers "the sole active episode" and gives up the moment a second one
     is active - the exact case this screen draws a lane each for. */
  let schedulesQuery = liveList((j) => j.doses.getSchedules());
  let pausesQuery = liveList((j) => j.doses.getPauses());
  let stockQuery = liveList((j) => j.stock.getProjections(today));
  let latestLabQuery = liveQuery((j) => j.labs.getLatestResult());

  /* Every one of those six reads has to have answered before the rail means
     anything: a spine drawn while the stock query is still out would settle
     without its run-out marks and then jump. The rail is one object rather
     than a list, so this is a Skeleton against a `.loading` of its own rather
     than a ReadGate (tests/feature-screens.test.ts holds the choice between
     the two). */
  let loading = $derived(
    dosesQuery.loading ||
      episodesQuery.loading ||
      schedulesQuery.loading ||
      pausesQuery.loading ||
      stockQuery.loading ||
      latestLabQuery.loading
  );

  /* Which regimens are running today, in the order their lanes are drawn
     (careSpine.ts: curve drugs first so the lane the curve reads sits
     nearest the labs row, then oldest first). Every one of them gets a lane
     and a block; none of them is "other". */
  let laneEpisodes = $derived(railEpisodes(activeEpisodesAt(episodesQuery.rows, startOfDayTimestamp(today))));
  let latestLab = $derived(latestLabQuery.value ?? null);

  /* Every tracked stock with an actionable day inside the rail's forward
     reach, through the helper Home's stock notice uses - passed the rail's
     own horizon instead of the notice threshold, so this asks "is there a
     day on this line" rather than "is one close". A day further out than
     the rail simply has no mark; the block's own stock line still states
     what is left. `actionableEpochDay` is the reorder-by day where a lead
     time is set and the run-out day itself where none is (redesign phase 10
     ticket 16), so the rail and Home's notice always name the same day. */
  let depleting = $derived(depletingStocks(stockQuery.rows, today, SPINE_FORWARD_DAYS));
  /* Paired to a lane by the same rule the projection itself pairs a dose to
     a stock by (stockProjection.ts's `drugsMatch`), rather than by a second
     comparison written here. */
  const runOutFor = (drug: string) => depleting.find((row) => drugsMatch(row.entry.drug, drug)) ?? null;

  /* Ticket 09: what used to be the whole of /settings/exposure - a range
     picker over three counters - is one fact per lane now, over a window
     that just states itself rather than inviting a pick (ADR-0084, "a fact
     with its unit and window, no comparison"). Fixed at
     exposureCounters.ts's own default range rather than reusing
     DOSES_WINDOW_DAYS, which answers a different question. */
  const DOSE_TOTAL_WINDOW_DAYS = 90;
  let doseTotalQuery = liveQuery((j) => j.exposure.getCounters(today - DOSE_TOTAL_WINDOW_DAYS + 1, today));

  const scheduleForEpisode = (episode: RegimenEpisode) =>
    schedulesQuery.rows.find((schedule) => schedule.episodeId === episode.id) ?? null;
  const pausesForEpisode = (episode: RegimenEpisode) =>
    pausesQuery.rows.filter((pause) => pause.episodeId === episode.id);
  const doseFactsFor = (episode: RegimenEpisode) =>
    scheduleDoseFacts(episode, episodesQuery.rows, scheduleForEpisode(episode), dosesQuery.rows, pausesForEpisode(episode), today);

  /** One running regimen, with everything the lane above and the block below
      both read. Built once per episode rather than twice, so a lane and its
      block can never state two different next doses. */
  let lanes = $derived(
    laneEpisodes.map((episode) => ({
      episode,
      ...doseFactsFor(episode),
      runOut: runOutFor(episode.drug),
      /* Every matching total the window found for this drug - ordinarily
         one, since a route change mid-window is rare. */
      doseTotals: (doseTotalQuery.value?.doseTotals ?? []).filter((total) => total.drug === episode.drug)
    }))
  );

  /* Carried over from /settings/stock's own note (ADR-0046): about every
     projection the sheet's list below shows, not any one drug's. */
  let stockExcludedDoses = $derived(stockQuery.rows.reduce((total, row) => total + row.projection.excludedDoses, 0));

  /* The stock editor (Recorded, Opened, window), off Care rather than its
     own screen (ADR-0084) - the same shape the dose panel's own Log sheet
     has: one sheet, opened from a line that already states the fact it
     edits. Two ways in, both landing here: a lane's own stock line seeds the
     editor with the drug it is already naming, and the stock row below opens
     on the plain list so stock can still be tracked and added to with no
     regimen naming it. */
  let stockSheetOpen = $state(false);
  let stockEditor = $state<{
    id?: string;
    drug: string;
    quantity: string;
    unit: string;
    leadTimeDays: string;
    recordedDate: string;
    openedDate: string;
    windowMode: 'days' | 'end';
    windowDays: string;
    windowEndDate: string;
  } | null>(null);

  const STOCK_WINDOW_MODES = [
    { value: 'days', label: m.stock_window_mode_days() },
    { value: 'end', label: m.stock_window_mode_end() }
  ];

  /* Structural rather than `StockProjectionRow` itself: a `depletingStocks`
     row carries the same `entry` but not that type's own
     `reorderByEpochDay` - and nothing here reads that field anyway, only the
     entry it is editing. */
  function stockEditorFromRow(row: { entry: StockProjectionRow['entry'] }): typeof stockEditor {
    return {
      id: row.entry.id,
      drug: row.entry.drug,
      quantity: String(row.entry.quantity),
      unit: row.entry.unit,
      leadTimeDays: row.entry.leadTimeDays === null ? '' : String(row.entry.leadTimeDays),
      recordedDate: dateInputValueFromEpochDay(row.entry.recordedEpochDay),
      openedDate: row.entry.openedEpochDay === null ? '' : dateInputValueFromEpochDay(row.entry.openedEpochDay),
      windowMode: row.entry.inUseEndEpochDay !== null ? 'end' : 'days',
      windowDays: row.entry.inUseWindowDays === null ? '' : String(row.entry.inUseWindowDays),
      windowEndDate: row.entry.inUseEndEpochDay === null ? '' : dateInputValueFromEpochDay(row.entry.inUseEndEpochDay)
    };
  }

  function newStockEditor(drug = ''): typeof stockEditor {
    return {
      drug,
      quantity: '',
      unit: '',
      leadTimeDays: '',
      recordedDate: dateInputValueFromEpochDay(today),
      openedDate: '',
      windowMode: 'days',
      windowDays: '',
      windowEndDate: ''
    };
  }

  /** Opened from a lane's own stock line or its run-out mark: goes straight
      to that drug's entry, or to a blank one seeded with its name, rather
      than through the list - the line already named the one thing to edit. */
  function openStockLine(drug: string) {
    const row = runOutFor(drug);
    stockEditor = row ? stockEditorFromRow(row) : newStockEditor(drug);
    stockSheetOpen = true;
  }

  /** Opened from the stock row below: the plain list, since that entry point
      names no drug of its own to jump straight to. */
  function openStockList() {
    stockEditor = null;
    stockSheetOpen = true;
  }

  function closeStockSheet() {
    stockSheetOpen = false;
    stockEditor = null;
  }

  async function saveStockEntry() {
    if (!stockEditor) return;
    const quantity = parseFloat(stockEditor.quantity);
    const drug = stockEditor.drug.trim();
    const unit = stockEditor.unit.trim();
    if (isNaN(quantity) || !drug || !unit) return;

    const leadTime = parseInt(stockEditor.leadTimeDays, 10);
    const leadTimeDays = isNaN(leadTime) ? null : leadTime;
    const openedEpochDay = stockEditor.openedDate ? epochDayFromDateInputValue(stockEditor.openedDate) : null;
    const days = parseInt(stockEditor.windowDays, 10);
    const inUseWindowDays = openedEpochDay !== null && stockEditor.windowMode === 'days' && !isNaN(days) ? days : null;
    const inUseEndEpochDay =
      openedEpochDay !== null && stockEditor.windowMode === 'end' && stockEditor.windowEndDate
        ? epochDayFromDateInputValue(stockEditor.windowEndDate)
        : null;

    await journal.stock.upsertEntry({
      drug,
      quantity,
      unit,
      recordedEpochDay: epochDayFromDateInputValueOrToday(stockEditor.recordedDate),
      leadTimeDays,
      openedEpochDay,
      inUseWindowDays,
      inUseEndEpochDay
    });
    stockEditor = null;
  }

  async function deleteStockEntry() {
    if (!stockEditor?.id) return;
    await journal.stock.deleteEntry(stockEditor.id);
    stockEditor = null;
  }

  let spine = $derived(
    careSpine(
      {
        labDrawEpochDay: latestLab?.epochDay ?? null,
        lanes: lanes.map((lane) => ({
          episodeId: lane.episode.id,
          drug: lane.episode.drug,
          lastDoseEpochDay: lane.lastDoseEpochDay,
          nextDoseEpochDay: lane.nextDoseEpochDay,
          runOutEpochDay: lane.runOut?.actionableEpochDay ?? null
        }))
      },
      today
    )
  );

  /* A mark's label. The run-out one reads off that lane's own stock row,
     because the mark's day is the reorder-by day once a lead time is set
     and the label has to say which day it is naming rather than always
     reading "Runs out" over an order deadline (redesign phase 10 ticket
     16). */
  const markLabel = (kind: SpineMarkKind, leadTimeDays: number | null = null): string => {
    switch (kind) {
      case 'labDraw':
        return m.care_mark_lab_draw();
      case 'lastDose':
        return m.care_mark_last_dose();
      case 'today':
        return m.care_mark_today();
      case 'nextDose':
        return m.care_mark_next_dose();
      case 'runOut':
        return leadTimeDays !== null ? m.care_mark_reorder_by() : m.care_mark_run_out();
    }
  };

  /* Where a mark goes when it is tapped: the surface the reading came from,
     which is the whole of what makes the rail worth a tap. Today is the one
     mark that is not a link - it is where the reader is, not somewhere to
     go - and it renders as plain text rather than as a link that does
     nothing. runOut has no href either: /settings/stock stopped being a
     screen (ADR-0084), and the mark opens the same sheet its lane's stock
     line does. */
  const MARK_HREF: Record<SpineMarkKind, string | null> = {
    labDraw: '/care/labs',
    lastDose: '/care/doses',
    today: null,
    nextDose: '/care/doses',
    runOut: null
  };

  /* A lane's marks say which drug they belong to out loud: the lane's name
     is a heading no screen reader reaches from a mark inside it, and "Next
     dose, 21 September" three times over with nothing to tell the three
     apart is what the one-lane rail was avoiding by drawing only one. */
  const markAria = (mark: SpineMark, what: string, drug: string | null): string => {
    const when = dayLabel(mark.epochDay);
    if (drug === null) {
      return mark.beyondSpan ? m.care_mark_off_rail_aria({ what, when }) : m.care_mark_aria({ what, when });
    }
    return mark.beyondSpan
      ? m.care_lane_mark_off_rail_aria({ what, when, drug })
      : m.care_lane_mark_aria({ what, when, drug });
  };

  /* How tall a set of captions is, in rows: the deepest label row in use
     plus one, never a reserved row nothing is in. A fixed height left the
     top of the card empty whenever the marks were spread out, which read as
     a chart that had failed to draw. */
  const labelRows = (marks: readonly SpineMark[]) =>
    Math.max(...marks.map((mark) => mark.labelRow + 1), 1);

  /** A lane's attributes: its stripe, and how many caption rows it is tall.
      Merged into one `style` rather than written beside `{...roleAttrs()}`,
      because a spread carrying its own `style` replaces the attribute
      instead of adding to it - which left every lane at zero rows and its
      captions hanging over the lane below (caught in the render, not by a
      test: both attributes were individually correct). */
  const laneAttrs = (index: number, rows: number) => {
    const role = roleAttrs(roleAt(activeFlag.roles, index));
    return { ...role, style: `${role.style ?? ''}; --care-rows: ${rows}` };
  };

  /** Where to log this lane's next dose: the same sheet the dose panel on
      Today opens (`/care/doses?add=1`), seeded with the drug whose block the
      button sits in, so a person on three regimens does not land in a picker
      to say what the button already knew. */
  const logHref = (drug: string) => `/care/doses?add=1&drug=${encodeURIComponent(drug)}`;

  /** The drug and its ester, unless the drug's own name already carries it -
      "Estradiol valerate · valerate" is what naming both unconditionally
      produces, and the fixture's own drug names are written that way. Both
      fields are free text, so this is a comparison of what the person wrote
      rather than of two vocabularies. */
  const blockName = (episode: RegimenEpisode) => {
    const ester = episode.ester?.trim();
    if (!ester || episode.drug.toLowerCase().includes(ester.toLowerCase())) return episode.drug;
    return `${episode.drug} · ${ester}`;
  };

  /* The route as one of the six keys, off the episode's own free-text words
     (doseSchedule.ts's matchDoseRoute, the same read the dose editor makes
     of the same field). Null where the words name no route or two, in which
     case the block states the dose and leaves the route unsaid rather than
     guessing at one. */
  const blockRoute = (episode: RegimenEpisode) => {
    const route = matchDoseRoute(episode.route, ROUTE_OPTIONS);
    return route === null ? null : routeLabel(route);
  };

  /* Which lane the hormone curve is drawn for: the first, which is a curve
     drug whenever one is running (railEpisodes puts them first). The row
     below states that curve's own reading. */
  let curveEpisode = $derived(lanes.find((lane) => resolveCurveDrug(lane.episode.drug) !== null) ?? null);
  let curveDrug = $derived(curveEpisode ? resolveCurveDrug(curveEpisode.episode.drug) : null);
  let curveDirectionQuery = liveQuery((j) =>
    curveDrug ? j.hormoneCurve.getCurveDirection({ drug: curveDrug, epochDay: today }) : Promise.resolve(null)
  );

  /** Where today sits between that lane's own two doses - "day 6 of 7" -
      or null where the pair is not both there to count between. A count of
      days off two days this screen already states, not a reading of a
      schedule: a rhythm that skipped a slot has a longer gap this way and
      says so, rather than restating the interval the schedule was set to. */
  let curveDay = $derived.by(() => {
    const last = curveEpisode?.lastDoseEpochDay ?? null;
    const next = curveEpisode?.nextDoseEpochDay ?? null;
    if (last === null || next === null || next <= last) return null;
    return { day: today - last + 1, span: next - last };
  });

  /* The curve's current reading in words: which way the curve this app
     draws is going today (journal/hormoneCurve.ts owns that question), and
     where today falls between the two doses either side of it. Never a
     level and never a number the app has interpreted - the height of a
     curve is on /care/curve, with everything that qualifies it. */
  let curveReading = $derived.by(() => {
    const direction = curveDirectionQuery.value ?? null;
    /* The curve screen's own words for the same silence, rather than a
       second sentence about it: nothing logged that this app draws a curve
       for. */
    if (!direction) return curveDrug === null ? m.curve_empty_title() : null;
    const word = { rising: m.care_curve_rising(), level: m.care_curve_level(), falling: m.care_curve_falling() }[
      direction
    ];
    return curveDay === null
      ? word
      : m.care_row_curve_reading({ direction: word, day: String(curveDay.day), span: String(curveDay.span) });
  });

  /* What the clinician summary would print if it were opened now: its own
     default range and the sections it has (the screen's own
     `ongoingWindowRange(today, 90)` and every inclusion key, which is what
     `DEFAULT_CLINICIAN_DOSSIER_INCLUSION` turns them all on for). Read from
     the same two modules the summary screen reads, so the row cannot drift
     from what tapping it opens. */
  let summaryRange = $derived(ongoingWindowRange(today, 90));
  let summaryReading = $derived(
    m.care_row_summary({
      start: fmtDay(summaryRange.start, { day: 'numeric', month: 'long' }),
      sections: m.clinician_summary_settings_sections({ n: CLINICIAN_DOSSIER_INCLUSION_KEYS.length })
    })
  );

  /** The stock the lanes above do not already name, soonest first.

      The stock row exists for the one entry point that asks for no regimen
      to be running first (ADR-0084): a drawer with a drug in it nobody has
      a regimen row for, and the only way to add a first count at all. A
      lane states its own stock on its block, so this row would otherwise be
      the same sentence a second time - it draws only what no lane covers,
      and the list behind it is still the whole drawer. */
  let unlanedStock = $derived(
    stockQuery.rows.filter((row) => !lanes.some((lane) => drugsMatch(lane.episode.drug, row.entry.drug)))
  );

  /* Mood between injections (phase 5 ticket 09, moved here whole by
     redesign ticket 05): two bucket-and-average shapes over a cyclical
     position, kept apart from correlation cards on purpose
     (../../lib/data/intervalMoodPattern.ts). Neither reading names a
     target or a verdict: both say only where days fell.

     Both ask across the journal's whole history rather than a range this
     screen has no picker for (Number.MIN_SAFE_INTEGER as the lower bound,
     which is what "ever" means on an epoch-day column): an injection
     interval is commonly 14-28 days and rarely completes three times
     inside even a 90-day window. "Ever" is capped to a lookback window at
     the journal/intervalMoodPattern.ts seam instead of actually reaching a
     decade back (phase 8 audit ticket 16). */
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
     a fresh 102KB read per digit typed. */
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

  /* A position on a cycle is not a day, so the two folds label their ends
     with the position rather than with a date, and they are already one
     point per position - there is nothing to bucket. */
  const positionPoints = (pattern: { position: number; value: number }[]) =>
    pattern.map((p) => ({ x: p.position, y: p.value }));
  const positionLabel = (point: { x: number }) => m.interval_day_n({ n: String(point.x) });
  const positionEnds = (pattern: { position: number }[]) => ({
    from: m.interval_day_n({ n: String(pattern[0].position) }),
    to: m.interval_day_n({ n: String(pattern[pattern.length - 1].position) })
  });

  /* What a fold has to hold before it is drawn: not a bare trend floor,
     which is one straight segment for somebody with a couple of entries,
     but `WRAPPED_ENTRY_FLOOR` positions of the fold's own all-history
     output - five places inside the interval that carry a reading. */
  const foldDrawable = (pattern: readonly unknown[]) => pattern.length >= WRAPPED_ENTRY_FLOOR;
</script>

<div class="screen">
  <ScreenHeader title={m.care_title()} back="/more" screen="care" />

  {#if loading}
    <div out:crossfade><Skeleton variant="block" count={1} /></div>
  {:else if spine}
    <ChartCard heading={m.care_rail_heading()} kind="care-spine" role={roleAt(activeFlag.roles, AREA_ROLE.rail)}>
      <div class="care-rail" data-care-rail>
        <!-- Today and the draw head the rail, once, and their guides run
             down through every lane below. Two reasons for the split. They
             are shared facts - today is where the reader is and a draw is
             one event in one bloodstream - so drawing them per lane would
             say them three times. And it is what gives each lane its whole
             width back for its own captions: "Next dose" is no longer
             pushed onto a second row to get out of "Today"'s way, which is
             what the one-lane rail spent a row on. -->
        <div class="care-head" style="--care-rows: {labelRows(spine.shared)}">
          {#each spine.shared as mark (mark.kind)}
            {@const what = markLabel(mark.kind)}
            <div class="care-at" style={`--care-at: ${mark.position}; --care-row: ${mark.labelRow}`}>
              <div class="care-at-inner" class:is-beyond={mark.beyondSpan} style={`--care-settle: ${Math.abs(mark.position - 0.5).toFixed(3)}`}>
                {#if MARK_HREF[mark.kind]}
                  <a
                    class="care-mark"
                    data-care-mark={mark.kind}
                    href={MARK_HREF[mark.kind]}
                    aria-label={markAria(mark, what, null)}
                  >
                    <span class="care-what">{what}</span>
                    <span class="care-when">{dayLabel(mark.epochDay)}</span>
                  </a>
                {:else}
                  <!-- Today is where the reader is rather than somewhere to
                       go, so it is text and not a link that leads nowhere. -->
                  <span class="care-mark" data-care-mark={mark.kind}>
                    <span class="care-what">{what}</span>
                    <span class="care-when">{dayLabel(mark.epochDay)}</span>
                  </span>
                {/if}
              </div>
            </div>
          {/each}
        </div>

        <div class="care-lanes">
          {#each spine.shared as mark (mark.kind)}
            <span
              class="care-guide"
              class:is-today={mark.kind === 'today'}
              class:is-beyond={mark.beyondSpan}
              style={`--care-at: ${mark.position}`}
              aria-hidden="true"
            ></span>
          {/each}
          {#if spine.lanes.length === 0}
            <!-- A journal with a draw or a stock count but no regimen
                 running: the two guides have nothing to cross, and a pair of
                 bare verticals is not a rail. One line in the rail's own
                 colour gives them something to land on, and the captions
                 above it still say what the days are - which is the whole of
                 what this journal has to draw. -->
            <div class="care-lane care-lane-bare" style="--care-rows: 0">
              <div class="care-lane-track">
                <span class="care-line care-line-back" aria-hidden="true"></span>
                <span class="care-line care-line-on" aria-hidden="true"></span>
              </div>
            </div>
          {/if}
          {#each spine.lanes as lane, index (lane.episodeId)}
            {@const leadTimeDays = lanes.find((l) => l.episode.id === lane.episodeId)?.runOut?.entry.leadTimeDays ?? null}
            <div class="care-lane" data-care-lane={lane.drug} {...laneAttrs(index, labelRows(lane.marks))}>
              <!-- The name labels its own line from the left, above it
                   rather than beside it: a name column would take around a
                   hundred of the three hundred and thirty pixels a 390px
                   screen leaves for the rail, and careSpine's collision rule
                   is sized against the full width (careSpine.ts:62-86). -->
              <span class="care-lane-name">{lane.drug}</span>
              <div class="care-lane-track">
                <span class="care-line care-line-back" aria-hidden="true"></span>
                <span class="care-line care-line-on" aria-hidden="true"></span>
                <!-- Two elements per mark, and the split is load-bearing.
                     Placement along the rail is a transform on the outer
                     box, so a dose logged now moves its marks to their new
                     days rather than repainting them there (ADR-0078); the
                     inner box carries the settle and the press, and
                     press.css holds the app's press at zero specificity
                     through :where(), so a transform of its own on the link
                     would outrank :active and make every mark unpressable. -->
                {#each lane.marks as mark (mark.kind)}
                  {@const what = markLabel(mark.kind, leadTimeDays)}
                  <div class="care-at" style={`--care-at: ${mark.position}; --care-row: ${mark.labelRow}`}>
                    <div
                      class="care-at-inner"
                      class:is-beyond={mark.beyondSpan}
                      style={`--care-settle: ${Math.abs(mark.position - 0.5).toFixed(3)}`}
                    >
                      <span class="care-tick" aria-hidden="true"></span>
                      {#if mark.kind === 'runOut'}
                        <!-- Opens the same sheet this lane's own stock line
                             does (ADR-0084): the mark and the line are one
                             fact in two grammars, so they open the one
                             editor between them. -->
                        <button
                          type="button"
                          class="care-mark care-mark-btn"
                          data-care-mark={mark.kind}
                          aria-label={markAria(mark, what, lane.drug)}
                          onclick={() => openStockLine(lane.drug)}
                        >
                          <span class="care-what">{what}</span>
                          <span class="care-when">{dayLabel(mark.epochDay)}</span>
                        </button>
                      {:else}
                        <a
                          class="care-mark"
                          data-care-mark={mark.kind}
                          href={MARK_HREF[mark.kind]}
                          aria-label={markAria(mark, what, lane.drug)}
                        >
                          <span class="care-what">{what}</span>
                          <span class="care-when">{dayLabel(mark.epochDay)}</span>
                        </a>
                      {/if}
                    </div>
                  </div>
                {/each}
              </div>
            </div>
          {/each}
        </div>
      </div>
    </ChartCard>
  {:else}
    <Notice icon="info" key="care-empty" text={m.care_rail_empty()} />
  {/if}

  <!-- One block per running regimen, in the lanes' own order. Outside the
       rail's branch on purpose: a regimen is a reading in its own right and
       it is the one reading that is not a day, so careSpine has nothing to
       draw for a journal with a regimen and no dose, draw or stock count
       yet - and while this block sat inside that branch the screen answered
       "nothing to put on the line" without ever naming the regimen that was
       running.

       Held until every read the rail waits on has answered, not just the
       episode read this block itself needs (ticket 99 item 42, "the 'doses,
       draws and stock' fades in a little too yankily"): gated on one read it
       appeared a couple of hundred milliseconds early and pushed the
       skeleton down the screen, which is what read as a yank rather than a
       fade. -->
  {#if !loading}
    {#each lanes as lane (lane.episode.id)}
      {@const route = blockRoute(lane.episode)}
      <div class="care-regimen-block" data-care-regimen-block={lane.episode.drug}>
        <a class="care-regimen" href="/care/regimen" data-care-regimen>
          <span class="care-regimen-lines">
            <span class="care-regimen-drug">{blockName(lane.episode)}</span>
            <span class="care-regimen-detail"
              >{route === null
                ? m.care_regimen_dose({ dose: String(lane.episode.dose), unit: lane.episode.doseUnit })
                : m.care_regimen_dose_route({
                    dose: String(lane.episode.dose),
                    unit: lane.episode.doseUnit,
                    route: route.charAt(0).toLowerCase() + route.slice(1)
                  })}</span
            >
          </span>
          <Icon name="chevronRight" size={22} cls="care-regimen-go" />
        </a>
        <!-- The two days the lane above draws, said in words with their
             weekday: the rail states where they fall against each other and
             this states which days they are. -->
        {#if lane.lastDoseEpochDay !== null || lane.nextDoseEpochDay !== null}
          <p class="care-regimen-days" data-care-regimen-days>
            {#if lane.lastDoseEpochDay !== null}
              <span>{m.care_last_dose({ when: dayWithWeekday(lane.lastDoseEpochDay) })}</span>
            {/if}
            {#if lane.nextDoseEpochDay !== null}
              <span>{m.care_next_dose({ when: dayWithWeekday(lane.nextDoseEpochDay) })}</span>
            {/if}
          </p>
        {/if}
        <!-- The whole of /settings/exposure's one useful row, ticket 09
             (ADR-0084): a fact with its unit and window, no comparison,
             no picker. -->
        {#each lane.doseTotals as total (`${total.drug}-${total.route}-${total.doseUnit}`)}
          {@const label = routeLabel(total.route)}
          <p class="care-regimen-total" data-care-regimen-total>
            {m.care_regimen_dose_total({
              total: String(total.total),
              unit: total.doseUnit,
              /* routeLabel() is capitalised everywhere else it's used - a
                 standalone label or table cell - but this is the one place
                 it sits mid-sentence (ticket 09's own spec gives the line in
                 lowercase: "48 mg intramuscular in the last 90 days"). */
              route: label.charAt(0).toLowerCase() + label.slice(1),
              days: String(DOSE_TOTAL_WINDOW_DAYS)
            })}
          </p>
        {/each}
        {#if lane.runOut}
          {@const runOutReading = stockRunOutLabel(lane.runOut.projection, today)}
          <!-- The stock editor's whole screen, folded into a sheet off this
               line (ADR-0084) - the same fact the lane's runOut mark states
               as a date on the axis, stated here as a sentence. -->
          <button
            type="button"
            class="care-regimen-stock"
            data-care-regimen-stock
            onclick={() => openStockLine(lane.episode.drug)}
          >
            <span class="care-regimen-stock-text">
              {stockRemainingLabel(lane.runOut.projection.remaining, lane.runOut.entry.unit)} · {runOutReading.text}
            </span>
            <Icon name="chevronRight" size={20} cls="care-regimen-go" />
          </button>
        {/if}
        <!-- The same sheet Today's dose panel opens, seeded with this
             block's own drug: a person on three regimens has already said
             which one by pressing this button rather than the one two
             blocks down. -->
        <a class="btn btn-soft btn-block press care-regimen-log" data-care-log={lane.episode.drug} href={logHref(lane.episode.drug)}>
          <Icon name="plus" size={18} /> <span>{m.care_log_dose()}</span>
        </a>
      </div>
    {/each}
  {/if}

  <SectionHeading text={m.care_group_hormones()} />
  <ListCard role={roleAt(activeFlag.roles, AREA_ROLE.readings)}>
    <!-- Every row states its own current value (DIRECTION.md 3b, and phase
         11 ticket 10: no row on this screen is a title and a chevron
         alone). The analyte and the result in its own unit, never converted
         (ADR-0026), with the day it was drawn - the rail carries that day as
         a guide and the row says which day the guide is. -->
    <ListRow
      key="labs"
      icon="flask"
      title={m.lab_results()}
      subtitle={latestLab &&
        m.care_row_labs({
          analyte: latestLab.analyte,
          value: String(latestLab.value),
          unit: latestLab.unit,
          when: dayLabel(latestLab.epochDay)
        })}
      href="/care/labs"
    />
    <ListRow key="hormone-curve" icon="curve" title={m.curve_title()} subtitle={curveReading} href="/care/curve" />
    {#if unlanedStock.length > 0}
      <!-- Only what no lane above already states (ADR-0084 kept this row for
           the entry point that asks for no regimen to be running first: a
           drug in the drawer with no regimen row, and the only way to add a
           first count at all). -->
      <ListRow
        key="stock"
        icon="package"
        title={m.regimen_stock_link()}
        subtitle={m.care_row_stock({
          drug: unlanedStock[0].entry.drug,
          left: stockRemainingLabel(unlanedStock[0].projection.remaining, unlanedStock[0].entry.unit)
        })}
        onclick={openStockList}
      />
    {:else if stockQuery.rows.length === 0}
      <ListRow key="stock" icon="package" title={m.regimen_stock_link()} subtitle={m.care_row_stock_none()} onclick={openStockList} />
    {/if}
    <!-- Ticket 59: the summary is an export over these readings, not one of
         its own, so it joins the card that already reads them. Written by
         hand rather than through HostedRows (ADR-0072) - that registry is
         for an *area* moved off the hub, and the summary fronts no area
         (`hubRows.ts` never gave it one). It states the range and the
         section count it would print by default, read off the same two
         modules its own screen reads them from. -->
    <ListRow
      key="clinician-summary"
      icon="share"
      title={m.clinician_summary_row()}
      subtitle={summaryReading}
      href="/health/clinician-summary"
    />
  </ListCard>

  <!-- Mood between injections (redesign ticket 05: moved off a general
       stats door, since this is a regimen reading and Care is where the
       regimen lives). Two readings under one heading rather than two
       cards, which is what let the "reads your whole journal" line stop
       repeating itself: it used to sit under each of them, once each,
       saying the same thing twice on the one door that had a range picker
       to be reading past. Care has no range control at all - only the
       rail's own forward-looking window - so it says so once, in Care's
       own words, and both readings still gate on their own output rather
       than on a floor either could clear with nothing to show. -->
  <ChartCard heading={m.interval_mood_title()} kind="interval-mood" role={roleAt(activeFlag.roles, AREA_ROLE.readings)}>
    {#snippet control()}
      <span class="stats-interval" data-interval-control>
        <span class="stats-interval-affix">{m.care_interval_fold_prefix()}</span>
        <label class="visually-hidden" for="custom-interval-length">{m.care_interval_fold_label()}</label>
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
        <span class="stats-interval-affix">{m.care_interval_fold_unit()}</span>
      </span>
    {/snippet}
    <p class="stats-inline-note">{m.interval_mood_explainer()}</p>
    <p class="stats-inline-note">{m.care_interval_all_history()}</p>
    <ReadGate read={intervalMoodQuery} variant="block" count={1}>
      {#snippet rows()}
        {#if foldDrawable(intervalMoodPattern)}
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
    <ReadGate read={customIntervalQuery} variant="block" count={1}>
      {#snippet rows(customIntervalPattern)}
        {#if foldDrawable(customIntervalPattern)}
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
          <ChartEmpty>{m.interval_mood_empty()}</ChartEmpty>
        {/if}
      {/snippet}
      {#snippet empty()}
        <ChartEmpty>{m.interval_mood_empty()}</ChartEmpty>
      {/snippet}
    </ReadGate>
  </ChartCard>

  <!-- What came of all of it (phase 9 carpet ticket 16). The card above is
       what is going in, on what schedule and how much is left; this is the
       one row about what the person has noticed since, and the two screens
       under it - side effects, and hair - hang off that one rather than off
       the hub.

       No SectionHeading: it is one row, and a heading over "Changes you've
       noticed" would be that title said twice. What separates it from the
       hormones card is the --space-6 `.screen > *` gives two unrelated
       blocks. -->
  <HostedRows host="care" card />

  <!-- The stock editor, off Care rather than its own screen (ADR-0084): one
       sheet, two shapes inside it depending on how it was opened. Landing
       on `stockEditor` (a lane's own line, or a row tapped below) goes
       straight to that drug's fields, the dose panel's own Log sheet's
       shape; landing on the plain list (the stock row) is what
       /settings/stock's whole screen used to be, moved in whole rather than
       thinned out, since deleting a screen cannot also delete the only way
       to track a second drug's stock or add a first one. -->
  <Sheet
    open={stockSheetOpen}
    title={stockEditor ? (stockEditor.id ? m.stock_edit_sheet() : m.stock_new_sheet()) : m.stock_title()}
    onClose={closeStockSheet}
  >
    {#if stockEditor}
      <Field label={m.stock_drug_label()} id="care-stock-drug">
        {#snippet children(id)}
          <input class="input" {id} name="stock-drug" placeholder={m.stock_drug_placeholder()} bind:value={stockEditor!.drug} />
        {/snippet}
      </Field>
      <div class="cd-endpoints">
        <Field label={m.stock_quantity_label()} id="care-stock-quantity">
          {#snippet children(id)}
            <input
              class="input"
              type="number"
              {id}
              name="stock-quantity"
              placeholder={m.stock_quantity_placeholder()}
              inputmode="decimal"
              bind:value={stockEditor!.quantity}
            />
          {/snippet}
        </Field>
        <Field label={m.stock_unit_label()} id="care-stock-unit">
          {#snippet children(id)}
            <input class="input" {id} name="stock-unit" placeholder={m.stock_unit_placeholder()} bind:value={stockEditor!.unit} />
          {/snippet}
        </Field>
      </div>
      <Field label={m.stock_lead_time_label()} id="care-stock-lead-time">
        {#snippet children(id)}
          <input
            class="input"
            type="number"
            {id}
            name="stock-lead-time"
            placeholder={m.stock_lead_time_placeholder()}
            inputmode="numeric"
            bind:value={stockEditor!.leadTimeDays}
          />
        {/snippet}
      </Field>
      <p class="muted small" style="margin:calc(-1 * var(--space-2)) 0 var(--space-3)">{m.stock_lead_time_hint()}</p>
      <Field label={m.stock_date_label()} id="care-stock-date">
        {#snippet children(id)}
          <DatePicker name="stock-date" bind:value={stockEditor!.recordedDate} {id} />
        {/snippet}
      </Field>
      <Field label={m.stock_opened_label()} id="care-stock-opened">
        {#snippet children(id)}
          <DatePicker name="stock-opened" bind:value={stockEditor!.openedDate} {id} />
        {/snippet}
      </Field>
      <p class="muted small" style="margin:calc(-1 * var(--space-2)) 0 var(--space-3)">{m.stock_opened_hint()}</p>
      {#if stockEditor.openedDate}
        <Field label={m.stock_window_legend()} legend>
          {#snippet children()}
            <Segmented
              name={m.stock_window_legend()}
              options={STOCK_WINDOW_MODES}
              value={stockEditor!.windowMode}
              onChange={(v) => (stockEditor!.windowMode = v as 'days' | 'end')}
            />
          {/snippet}
        </Field>
        {#if stockEditor.windowMode === 'days'}
          <Field label={m.stock_window_days_label()} id="care-stock-window-days">
            {#snippet children(id)}
              <input
                class="input"
                type="number"
                {id}
                name="stock-window-days"
                placeholder={m.stock_window_days_placeholder()}
                inputmode="numeric"
                bind:value={stockEditor!.windowDays}
              />
            {/snippet}
          </Field>
        {:else}
          <Field label={m.stock_window_end_label()} id="care-stock-window-end">
            {#snippet children(id)}
              <DatePicker name="stock-window-end" bind:value={stockEditor!.windowEndDate} {id} />
            {/snippet}
          </Field>
        {/if}
      {/if}

      <div class="stack-3">
        <button class="btn btn-primary" data-save-stock onclick={saveStockEntry}><span>{m.stock_save()}</span></button>
        {#if stockEditor.id}
          <button class="btn btn-ghost" data-delete-stock onclick={deleteStockEntry}>
            <span>{m.stock_delete_action({ drug: stockEditor.drug })}</span>
          </button>
        {/if}
      </div>
    {:else}
      {#if stockQuery.rows.length}
        <ListCard role={roleAt(activeFlag.roles, AREA_ROLE.readings)}>
          {#each stockQuery.rows as row (row.entry.id)}
            {@const rowRunOut = stockRunOutLabel(row.projection, today)}
            <ListRow
              key={row.entry.id}
              data-stock={row.entry.id}
              title={row.entry.drug}
              subtitle={[
                stockRemainingLabel(row.projection.remaining, row.entry.unit),
                m.stock_recorded({
                  date: fmtDay(row.entry.recordedEpochDay, { day: 'numeric', month: 'short', year: 'numeric' })
                }),
                rowRunOut.text,
                stockOpenedWindowLine(row.entry, today)
              ]}
              onclick={() => (stockEditor = stockEditorFromRow(row))}
            >
              {#snippet leading()}
                <span class="kit-row-ico" class:is-warn={rowRunOut.warn}>
                  <Icon name="package" size={22} />
                </span>
              {/snippet}
            </ListRow>
          {/each}
        </ListCard>
        {#if stockExcludedDoses > 0}
          <p class="muted small" style="margin-top:var(--space-3)">
            {m.stock_excluded_note({ count: String(stockExcludedDoses) })}
          </p>
        {/if}
        <button
          type="button"
          class="btn btn-soft btn-block press"
          data-add-stock
          style="margin-top:var(--space-3)"
          onclick={() => (stockEditor = newStockEditor())}
        >
          <Icon name="plus" size={18} /> <span>{m.stock_add_aria()}</span>
        </button>
      {:else}
        <Notice
          icon="package"
          key="care-stock-empty"
          role={roleAt(activeFlag.roles, AREA_ROLE.readings)}
          title={m.stock_empty_title()}
          text={m.stock_empty_body()}
          action={{ label: m.stock_empty_action(), primary: true, onclick: () => (stockEditor = newStockEditor()) }}
        />
      {/if}
    {/if}
  </Sheet>
</div>

<style>
  /* One regimen, named under the rail: what one of its lines is a line
     about. Not a ListRow in a card of its own - that is a third stacked
     container on a 390px screen for one fact, and DIRECTION.md 2b is about
     exactly that - but it keeps a row's touch target and a row's press. */
  .care-regimen {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    min-height: var(--touch-target);
    padding: var(--space-2) 0;
    text-decoration: none;
    color: inherit;
  }
  .care-regimen-block {
    margin-bottom: var(--space-3);
  }
  .care-regimen-lines {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex: 1;
    min-width: 0;
  }
  /* The same chevron a ListRow ends with, at the same size: this is not a
     row in a card, but it is a destination, and a destination that looks
     like a heading is a heading. */
  .care-regimen :global(.care-regimen-go) {
    flex: 0 0 auto;
    color: var(--text-2);
  }

  .care-regimen-drug {
    font-family: var(--font-display);
    font-size: var(--text-lg);
    font-weight: var(--weight-display);
  }
  .care-regimen-detail {
    font-size: var(--text-sm);
    color: var(--text-2);
  }

  /* The two days, one per line: a weekday and a date is most of a line's
     width at 390px, and two of them on one line wrap into each other. */
  .care-regimen-days {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin: 0;
    padding: var(--space-2) 0;
    font-size: var(--text-sm);
    border-top: 1px solid var(--hairline);
  }

  /* The dose total (ADR-0084's "a fact with its unit and window, no
     comparison"): plain text, since there is nothing here to tap through
     to any more. */
  .care-regimen-total {
    margin: 0;
    padding: var(--space-2) 0;
    font-size: var(--text-sm);
    color: var(--text-2);
    border-top: 1px solid var(--hairline);
  }

  /* The stock line: a row's own touch target and press, same as the
     regimen link above it, but a button rather than an anchor - it opens
     the sheet in place instead of navigating (ADR-0084). */
  .care-regimen-stock {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    width: 100%;
    min-height: var(--touch-target);
    padding: var(--space-2) 0;
    border: 0;
    border-top: 1px solid var(--hairline);
    background: none;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  /* Full-strength text and a bit more weight than the total line above it
     (--text-2 there): a design review flagged the two as indistinguishable
     plain text with only the chevron - easy to miss - to tell "a fact" from
     "a control" apart. */
  .care-regimen-stock-text {
    flex: 1;
    min-width: 0;
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
  }

  /* The one action a block carries, at the foot of the facts it states. */
  .care-regimen-log {
    margin-top: var(--space-3);
    text-decoration: none;
  }

  /* The runOut mark, a button now rather than a link (ADR-0084) - reset to
     the plain `.care-mark` it already was everywhere but the box model a
     button starts with. */
  .care-mark-btn {
    border: 0;
    background: none;
    font: inherit;
    cursor: pointer;
  }

  .care-rail {
    /* One caption is a label over a date; one lane is its name, its line and
       however many caption rows its own marks need. --care-stem is how far
       the first caption row hangs below its line, which is also how long the
       stem from the line down to it is. */
    --care-label-h: 34px;
    --care-stem: var(--space-4);
    display: flex;
    flex-direction: column;
    /* A rail otherwise starts against the card's heading, which reads as the
       heading underlined. */
    padding-top: var(--space-2);
  }

  /* The shared captions, and the lanes, share one horizontal coordinate
     space: a guide drawn at 0.5 of the lanes has to land under the caption
     drawn at 0.5 of the head. Both are inset by the same margin so a caption
     centred on a mark at either end overflows into the rail's own margin
     instead of out of the card. */
  .care-head,
  .care-lanes {
    position: relative;
    margin-inline: var(--space-6);
  }
  .care-head {
    height: calc(var(--care-rows) * var(--care-label-h));
  }
  .care-lanes {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  /* Today and the draw, down the whole rail: 1px in --text-2, which is what
     a guide is (DIRECTION.md rule 9) - never a lane's own colour, since a
     guide belongs to no drug. Today is solid and the draw is dashed: the two
     are told apart by their captions above, and the dash says the draw is a
     thing that happened where today is simply where the reader is. */
  .care-guide {
    position: absolute;
    top: 0;
    bottom: 0;
    left: calc(var(--care-at) * 100%);
    width: 1px;
    background: repeating-linear-gradient(to bottom, var(--text-2) 0 3px, transparent 3px 6px);
  }
  .care-guide.is-today {
    background: var(--text-2);
  }
  /* A day the rail could not reach, drawn at the end it was pulled in to.
     The caption still says the real date; the sparser dash is what says the
     guide is not where the day is. */
  .care-guide.is-beyond {
    background: repeating-linear-gradient(to bottom, var(--text-2) 0 2px, transparent 2px 8px);
  }

  .care-lane {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }
  /* The drug the line belongs to, in its own stripe: the lane's colour and
     its name say the same thing, so neither is carrying it alone - two lanes
     wrap onto one stripe on a flag with fewer stripes than the person has
     regimens (roles.ts), and the names still tell them apart. */
  .care-lane-name {
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
    color: var(--role-ink);
    /* The name is the lane's own heading and sits left; a long drug name
       truncates rather than pushing the rail's own width around. */
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .care-lane-track {
    position: relative;
    height: calc(var(--care-stem) + var(--care-rows) * var(--care-label-h));
  }
  /* The lane-less case: the line alone, with no name over it and no
     captions under it, so the guides have a rail to cross. */
  .care-lane-bare .care-lane-track {
    height: var(--care-stem);
  }

  .care-line {
    position: absolute;
    top: 0;
    height: 2px;
    /* Square ends: a series is 2px with square caps (DIRECTION.md rule 9). */
    transform: translateY(0);
  }
  /* Two lines, not one: the rail is read out from today in both directions,
     so it is drawn that way. The back line is the lane's full width in the
     role's own tint; the front line grows out from the middle over
     --dur-authored, which is the duration the area chart's first draw
     settled on for the same kind of moment (motion/reveal.ts). Reduced
     motion needs no branch here: base.css clamps every --dur-* token to
     1ms, so the growth lands instantly and the rail is simply there. */
  .care-line-back {
    left: 0;
    right: 0;
    background: color-mix(in oklab, var(--role-mark) 22%, transparent);
  }
  /* Grown by transform rather than by animating left and right.
     materials.css caps the motion palette at transform and opacity plus
     three named materials, and a 700ms animation on two inset properties is
     700ms of relayout on the mid-range Android WebView that cap exists for.
     scaleX off a centred origin is the same movement and composites. */
  .care-line-on {
    left: 0;
    right: 0;
    background: var(--role-mark);
    transform: scaleX(0);
    transform-origin: 50% 50%;
    animation: care-line-grow var(--dur-authored) var(--ease-out) forwards;
  }
  @keyframes care-line-grow {
    to {
      transform: scaleX(1);
    }
  }

  /* The outer box is the whole track's width and is translated by a
     fraction of itself, which is a fraction of the track: placement is a
     transform, so a mark whose day changes travels to it (ADR-0078) instead
     of being repainted there. Percentages in translateX resolve against the
     element's own width, which is what makes that work without the track's
     width in pixels. */
  .care-at {
    position: absolute;
    left: 0;
    right: 0;
    top: 0;
    transform: translateX(calc(var(--care-at) * 100%));
    transition: transform var(--dur-med) var(--ease-out);
    pointer-events: none;
  }
  /* The inner box is what is centred on the mark, and what presses. */
  .care-at-inner {
    position: absolute;
    left: 0;
    /* How far this caption hangs from whatever it belongs to: the top of the
       head for a shared one, its own lane's line for a lane's. */
    --care-drop: calc(var(--care-row) * var(--care-label-h));
    top: var(--care-drop);
    display: flex;
    flex-direction: column;
    align-items: center;
    pointer-events: auto;
    /* A deep row's stem reaches back past every row between it and the line,
       so a shallow neighbour close in x - a day or two apart is well inside
       a caption's width - sits behind that stem unless shallower always
       wins. */
    z-index: calc(10 - var(--care-row));
    /* The caption is around 48px wide and the tick is 2px, so the target is
       the caption's own box: it stays at the floor whatever the tick looks
       like. */
    min-width: var(--touch-target);
    /* Settles as the line reaches it: a mark a third of the way out waits a
       third of the growth. The delay is a multiple of a duration token
       rather than a literal, so reduced motion collapses it along with
       everything else - base.css clamps every --dur-* to 1ms. */
    opacity: 0;
    animation: care-mark-settle var(--dur-med) var(--ease-out) forwards;
    animation-delay: calc(var(--care-settle) * var(--dur-authored));
  }
  @keyframes care-mark-settle {
    from {
      opacity: 0;
      transform: translateX(-50%) translateY(4px);
    }
    to {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }
  }
  /* A lane's captions hang below its line by the stem's length; the head's
     hang from the top of the card and have no stem at all. */
  .care-lane-track .care-at-inner {
    --care-drop: calc(var(--care-stem) + var(--care-row) * var(--care-label-h));
  }

  .care-mark {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    line-height: 1.2;
    min-width: 100%;
    text-decoration: none;
    color: inherit;
    /* Backed by the card itself, so a deeper mark's stem reaching past this
       one (z-index above) ends at this box rather than showing through the
       gaps between letters. */
    background: var(--surface);
  }

  /* The stem: a caption reaches back to its own lane's line rather than
     floating beside it, so a crowded pair still reads as two marks on one
     lane. */
  .care-tick {
    position: absolute;
    top: calc(-1 * var(--care-drop));
    width: 2px;
    height: var(--care-drop);
    background: var(--role-mark);
  }

  .care-what {
    font-size: var(--text-xs);
    color: var(--text-2);
    white-space: nowrap;
  }
  .care-when {
    font-size: var(--text-sm);
    font-weight: var(--weight-bold);
    color: var(--role-ink);
    white-space: nowrap;
  }
  /* The shared captions belong to no lane, so they are written in the
     screen's own ink rather than in a drug's colour - the same rule their
     guides follow. */
  .care-head .care-when {
    color: var(--text);
  }
  /* A day the rail could not reach keeps its stem dotted, the way its guide
     is dashed. */
  .care-at-inner.is-beyond .care-tick {
    background: repeating-linear-gradient(to bottom, var(--role-mark) 0 2px, transparent 2px 4px);
  }

  /* The warn signal on the stock sheet's list, the same disc every other
     stock reading in the app uses (ADR-0046) - copied per page rather than
     shared, the same way doses/+page.svelte and the old /settings/stock
     each carried their own copy of it. */
  .kit-row-ico.is-warn {
    background: var(--warn-soft);
    color: var(--on-warn-soft);
    border-color: transparent;
  }

  /* The words either side of the interval-length field ("fold by", "days" -
     care_interval_fold_prefix/care_interval_fold_unit), at the weight a
     chart card's other heading-line text takes. */
  .stats-interval-affix {
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
    color: var(--text-2);
    white-space: nowrap;
  }
</style>
