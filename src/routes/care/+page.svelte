<script lang="ts">
  /* The care overview (phase 5 deepening ticket 07, ADR-0036: a feature
     surface, so it lives in the More hub rather than under /settings).

     What this screen does NOT do is the point of it. The ticket it comes
     from used to ask for an interactive care canvas - a pharmacokinetic
     curve, computed draw context, an exposure counter, a stock horizon -
     and every one of those had already shipped: /settings/hormone-curve,
     labTiming.ts, journal/exposure.ts, stockProjection.ts. So there is no
     modelling here and no second calculation of anything. Every figure on
     this screen is a live read of a module that already owned it, and the
     only arithmetic in the diff is careSpine.ts working out where five days
     sit on one line.

     Nothing here judges. The rail says when things happened and when the
     schedule expects the next one; no mark is late, no interval is the right
     one, and no lab value is read as anything (PRODUCT.md:109, and
     labTiming.ts and /settings/hormone-curve as the worked precedents). */
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
    chooseRailEpisode,
    scheduleDoseFacts,
    SPINE_FORWARD_DAYS,
    type SpineMark,
    type SpineMarkKind
  } from '$lib/data/careSpine';
  import {
    dateInputValueFromEpochDay,
    epochDayFromDateInputValue,
    epochDayFromDateInputValueOrToday,
    startOfDayTimestamp,
    todayEpochDay
  } from '$lib/data/epochDay';
  import { fmtDay } from '$lib/data/dates';
  import { activeEpisodesAt } from '$lib/data/regimenEpisode';
  import type { RegimenEpisode } from '$lib/data/types';
  import { depletingStocks } from '$lib/data/stockProjection';
  import { routeLabel } from '$lib/data/vocabulary/doseLabels';
  import { stockRemainingLabel, stockRunOutLabel, stockOpenedWindowLine } from '$lib/data/vocabulary/stockLabel';
  import type { StockProjectionRow } from '$lib/data/journal/stock';
  import { WRAPPED_ENTRY_FLOOR } from '$lib/data/wrapped';
  import { crossfade } from '$lib/motion/reveal';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';

  /* Two areas: the rail, and the readings that do not fit on one. The rail
     takes role 0, the only index that is a colour on all eight palettes
     (roles.ts) - it is the one place on this screen where the stripe is
     carrying meaning rather than decorating a card. */
  const AREA_ROLE = { rail: 0, readings: 1 };

  const today = todayEpochDay();
  const dayLabel = (epochDay: number) => fmtDay(epochDay, { day: 'numeric', month: 'short' });

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
     is active - the exact case this screen now has to draw (ticket 38). */
  let schedulesQuery = liveList((j) => j.doses.getSchedules());
  let pausesQuery = liveList((j) => j.doses.getPauses());
  let stockQuery = liveList((j) => j.stock.getProjections(today));
  let latestLabQuery = liveQuery((j) => j.labs.getLatestResult());

  /* Every one of those six reads has to have answered before the rail means
     anything: a spine drawn while the stock query is still out would settle
     without its run-out mark and then jump. The rail is one object rather
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

  /* Which episodes are running today, and which of them draws the rail
     (careSpine.ts: at most one active episode of any drug is unambiguous;
     several active picks the curve drug among them, or draws nothing when
     that too is ambiguous). Renamed nowhere below: `activeEpisode` and
     `severalRegimens` are still exactly what the header block reads. */
  let activeEpisodes = $derived(activeEpisodesAt(episodesQuery.rows, startOfDayTimestamp(today)));
  let railChoice = $derived(chooseRailEpisode(activeEpisodes));
  let activeEpisode = $derived(railChoice.rail);
  let severalRegimens = $derived(railChoice.ambiguous);
  let otherActiveEpisodes = $derived(railChoice.others);
  let latestLab = $derived(latestLabQuery.value ?? null);

  /* The soonest actionable stock day inside the rail's forward reach,
     through the helper Home's stock notice uses - passed the rail's own
     horizon instead of the notice threshold, so this asks "is there a day
     on this line" rather than "is one close". A day further out than the
     rail simply has no mark: the stock row below still states what is
     left. `actionableEpochDay` is the reorder-by day where a lead time is
     set and the run-out day itself where none is (redesign phase 10 ticket
     16), so the rail and Home's notice always name the same day. */
  let runOut = $derived(depletingStocks(stockQuery.rows, today, SPINE_FORWARD_DAYS)[0] ?? null);

  /* Ticket 09: what used to be the whole of /settings/exposure - a range
     picker over three counters - is one fact now, for the drug the rail is
     already naming, over a window that just states itself rather than
     inviting a pick (ADR-0084, "a fact with its unit and window, no
     comparison"). Fixed at exposureCounters.ts's own default range rather
     than reusing DOSES_WINDOW_DAYS below, which answers a different
     question (how far back the dose log looks, not how wide this one
     sentence's window is). */
  const DOSE_TOTAL_WINDOW_DAYS = 90;
  let doseTotalQuery = liveQuery((j) => j.exposure.getCounters(today - DOSE_TOTAL_WINDOW_DAYS + 1, today));
  let doseTotalsForActiveDrug = $derived(
    activeEpisode ? (doseTotalQuery.value?.doseTotals ?? []).filter((t) => t.drug === activeEpisode!.drug) : []
  );

  /* Carried over from /settings/stock's own note (ADR-0046): about every
     projection the sheet's list below shows, not any one drug's. */
  let stockExcludedDoses = $derived(stockQuery.rows.reduce((total, row) => total + row.projection.excludedDoses, 0));

  /* The stock editor (Recorded, Opened, window), off Care rather than its
     own screen (ADR-0084) - the same shape the dose panel's own Log sheet
     has: one sheet, opened from a line that already states the fact it
     edits. Two ways in, both landing here: the regimen block's own stock
     line (below) seeds the editor with the drug it is already naming, and
     the Hormones card's row (unchanged in scope, only re-pointed) opens on
     the plain list so stock can still be tracked and added to with no
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

  /* Structural rather than `StockProjectionRow` itself: `runOut` below is a
     `depletingStocks` row, which carries the same `entry` but not that
     type's own `reorderByEpochDay` - and nothing here reads that field
     anyway, only the entry it is editing. */
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

  /** Opened from the regimen block's own stock line: goes straight to that
      drug's entry, or to a blank one seeded with its name, rather than
      through the list - the line already named the one thing to edit. */
  function openStockLine() {
    stockEditor = runOut ? stockEditorFromRow(runOut) : newStockEditor(activeEpisode?.drug ?? '');
    stockSheetOpen = true;
  }

  /** Opened from the Hormones card's row: the plain list, since that entry
      point names no drug of its own to jump straight to. */
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

  const scheduleForEpisode = (episode: RegimenEpisode) =>
    schedulesQuery.rows.find((schedule) => schedule.episodeId === episode.id) ?? null;
  const pausesForEpisode = (episode: RegimenEpisode) =>
    pausesQuery.rows.filter((pause) => pause.episodeId === episode.id);
  const doseFactsFor = (episode: RegimenEpisode) =>
    scheduleDoseFacts(episode, episodesQuery.rows, scheduleForEpisode(episode), dosesQuery.rows, pausesForEpisode(episode), today);

  let railDoseFacts = $derived(
    activeEpisode ? doseFactsFor(activeEpisode) : { lastDoseEpochDay: null, nextDoseEpochDay: null }
  );

  /* Every other active episode's own last and next dose, for the row each
     gets beneath the rail rather than a shared mark folded into it
     (ticket 38's chosen shape - the curve schedule keeps the rail exactly
     as it read before, and everything else reads underneath). */
  let otherScheduleRows = $derived(
    otherActiveEpisodes.map((episode) => ({ episode, ...doseFactsFor(episode) }))
  );

  let spine = $derived(
    careSpine(
      {
        lastDoseEpochDay: railDoseFacts.lastDoseEpochDay,
        nextDoseEpochDay: railDoseFacts.nextDoseEpochDay,
        labDrawEpochDay: latestLab?.epochDay ?? null,
        runOutEpochDay: runOut?.actionableEpochDay ?? null
      },
      today
    )
  );

  const MARK_LABEL: Record<SpineMarkKind, () => string> = {
    labDraw: () => m.care_mark_lab_draw(),
    lastDose: () => m.care_mark_last_dose(),
    today: () => m.care_mark_today(),
    nextDose: () => m.care_mark_next_dose(),
    // The mark's own day is the reorder-by day once a lead time is set
    // (above), and the label has to say which day it is naming rather
    // than always reading "Runs out" over a day that is really the order
    // deadline (redesign phase 10 ticket 16).
    runOut: () => (runOut !== null && runOut.entry.leadTimeDays !== null ? m.care_mark_reorder_by() : m.care_mark_run_out())
  };

  /* Where a mark goes when it is tapped: the surface the reading came from,
     which is the whole of what makes the rail worth a tap. Today is the one
     mark that is not a link - it is where the reader is, not somewhere to
     go - and it renders as plain text rather than as a link that does
     nothing. */
  /* runOut has no href of its own any more: /settings/stock stopped being a
     screen (ADR-0084), and the mark opens the same sheet the regimen
     block's own stock line does (openStockLine below) rather than linking
     anywhere. */
  const MARK_HREF: Record<SpineMarkKind, string | null> = {
    labDraw: '/care/labs',
    lastDose: '/care/doses',
    today: null,
    nextDose: '/care/doses',
    runOut: null
  };

  const markAria = (mark: SpineMark): string =>
    mark.beyondSpan
      ? m.care_mark_off_rail_aria({ what: MARK_LABEL[mark.kind](), when: dayLabel(mark.epochDay) })
      : m.care_mark_aria({ what: MARK_LABEL[mark.kind](), when: dayLabel(mark.epochDay) });

/* Lanes alternate sides: lane 0 hangs below the line, lane 1 stands above
   it, lane 2 is a second row below, and so on. Parity rather than a run down
   one side, because a rail is read across and two rows on one side push the
   line off centre for the sake of one crowded pair. */
  const laneSide = (lane: number) => (lane % 2 === 0 ? 'below' : 'above');
  const laneDepth = (lane: number) => Math.floor(lane / 2);

  /* Only as tall as the arrangement needs: the rows in use on each side of
     the line, never a reserved lane nothing is in. A fixed height left the
     top half of the card empty whenever the marks were spread out, which
     read as a chart that had failed to draw. */
  let rowsBelow = $derived(Math.max(...(spine?.marks ?? []).filter((mark) => laneSide(mark.lane) === 'below').map((mark) => laneDepth(mark.lane) + 1), 1));
  let rowsAbove = $derived(Math.max(...(spine?.marks ?? []).filter((mark) => laneSide(mark.lane) === 'above').map((mark) => laneDepth(mark.lane) + 1), 0));

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

  <!-- Outside the rail's branch on purpose. The regimen is a reading in its
       own right, and it is the one reading that is not a day: careSpine has
       nothing to draw for it, so a journal with a regimen and no dose, draw
       or stock count yet gets no rail - and while this block sat inside that
       branch the screen answered "nothing to put on the line" without ever
       naming the regimen that was running. -->
  <!-- Held until every read the rail waits on has answered, not just the
       episode read this block itself needs (ticket 99 item 42, "the 'doses,
       draws and stock' fades in a little too yankily"). The rail below is
       gated on all six; this block was gated on one, so it appeared a
       couple of hundred milliseconds earlier and inserted 66px *above* the
       skeleton that was still standing in for the rail. The card then
       crossfaded in while the whole block was travelling down the screen,
       which is what read as a yank rather than a fade - the fade itself was
       always clean. Still outside the rail's own branch, which is what its
       comment above is about: a regimen with nothing to draw yet is named
       either way. -->
  {#if !loading && activeEpisode}
    <div class="care-regimen-block">
      <a class="care-regimen" href="/care/regimen" data-care-regimen>
        <span class="care-regimen-lines">
          <span class="care-regimen-drug">{activeEpisode.drug}</span>
          <span class="care-regimen-detail"
            >{m.care_regimen_sub({
              dose: String(activeEpisode.dose),
              unit: activeEpisode.doseUnit,
              interval: activeEpisode.interval
            })}</span
          >
        </span>
        <Icon name="chevronRight" size={22} cls="care-regimen-go" />
      </a>
      <!-- The whole of /settings/exposure's one useful row, ticket 09
           (ADR-0084): a fact with its unit and window, no comparison,
           no picker. Every matching total the window found for this drug -
           ordinarily one, since a route change mid-window is rare. -->
      {#each doseTotalsForActiveDrug as total (`${total.drug}-${total.route}-${total.doseUnit}`)}
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
      {#if runOut}
        {@const runOutReading = stockRunOutLabel(runOut.projection, today)}
        <!-- The stock editor's whole screen, folded into a sheet off this
             line (ADR-0084) - the same fact the spine's own runOut mark
             states as a date on the axis, stated here as a sentence. -->
        <button type="button" class="care-regimen-stock" data-care-regimen-stock onclick={openStockLine}>
          <span class="care-regimen-stock-text">
            {stockRemainingLabel(runOut.projection.remaining, runOut.entry.unit)} · {runOutReading.text}
          </span>
          <Icon name="chevronRight" size={20} cls="care-regimen-go" />
        </button>
      {/if}
    </div>
  {:else if !loading && severalRegimens}
    <!-- No single regimen to name, so nothing is named. This is a note about
         why the rail has no next-dose mark, at the size a note is: the
         display line above belongs to a drug's name, and a sentence set in
         it reads as the screen shouting. -->
    <a class="care-regimen" href="/care/regimen" data-care-regimen>
      <span class="care-regimen-lines">
        <span class="care-regimen-detail">{m.care_regimen_several()}</span>
      </span>
      <Icon name="chevronRight" size={22} cls="care-regimen-go" />
    </a>
  {/if}

  {#if loading}
    <div out:crossfade><Skeleton variant="block" count={1} /></div>
  {:else if spine}
    <ChartCard heading={m.care_rail_heading()} kind="care-spine" role={roleAt(activeFlag.roles, AREA_ROLE.rail)}>
      <div class="care-rail" style="--care-rows-below: {rowsBelow}; --care-rows-above: {rowsAbove}" data-care-rail>
        <div class="care-track">
          <span class="care-line care-line-back" aria-hidden="true"></span>
          <span class="care-line care-line-on" aria-hidden="true"></span>
          <!-- Two elements per mark, and the split is load-bearing. Placement
               along the rail is a translate, and press.css holds the app's
               press at zero specificity through :where(), so a transform of
               its own on the link would outrank :active and make every mark
               on the rail unpressable. The wrapper is placed and the link
               inside it is left free to press. The tick sits on the wrapper
               too, so it stays put against the line while the caption
               presses. -->
          {#each spine.marks as mark (mark.kind)}
            <div
              class="care-at"
              data-side={laneSide(mark.lane)}
              class:is-today={mark.kind === 'today'}
              class:is-beyond={mark.beyondSpan}
              style={`--care-at: ${mark.position}; --care-depth: ${laneDepth(mark.lane)}; --care-settle: ${Math.abs(mark.position - 0.5).toFixed(3)}`}
            >
              <span class="care-tick" aria-hidden="true"></span>
              {#if mark.kind === 'runOut'}
                <!-- Opens the same sheet the regimen block's own stock line
                     does (ADR-0084): the mark and the line are one fact in
                     two grammars, so they open the one editor between them. -->
                <button
                  type="button"
                  class="care-mark care-mark-btn"
                  data-care-mark={mark.kind}
                  aria-label={markAria(mark)}
                  onclick={openStockLine}
                >
                  <span class="care-what">{MARK_LABEL[mark.kind]()}</span>
                  <span class="care-when">{dayLabel(mark.epochDay)}</span>
                </button>
              {:else if MARK_HREF[mark.kind]}
                <a class="care-mark" data-care-mark={mark.kind} href={MARK_HREF[mark.kind]} aria-label={markAria(mark)}>
                  <span class="care-what">{MARK_LABEL[mark.kind]()}</span>
                  <span class="care-when">{dayLabel(mark.epochDay)}</span>
                </a>
              {:else}
                <!-- Today is where the reader is rather than somewhere to go,
                     so it is text and not a link that leads nowhere. -->
                <span class="care-mark" data-care-mark={mark.kind}>
                  <span class="care-what">{MARK_LABEL[mark.kind]()}</span>
                  <span class="care-when">{dayLabel(mark.epochDay)}</span>
                </span>
              {/if}
            </div>
          {/each}
        </div>
      </div>
    </ChartCard>
  {:else}
    <Notice icon="info" key="care-empty" text={m.care_rail_empty()} />
  {/if}

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

  {#if !loading && otherScheduleRows.length > 0}
    <!-- The rail draws one schedule; every other active one - an unrelated
         daily drug alongside a hormone regimen, say - gets its own row here
         instead of a second, unlabelled mark of the same kind on the line
         (ticket 38). -->
    <SectionHeading text={m.care_group_other_regimens()} />
    <ListCard role={roleAt(activeFlag.roles, AREA_ROLE.readings)}>
      {#each otherScheduleRows as row (row.episode.id)}
        <ListRow
          key={`other-regimen-${row.episode.id}`}
          icon="clock"
          title={row.episode.drug}
          subtitle={[
            row.lastDoseEpochDay !== null && m.care_other_last_dose({ when: dayLabel(row.lastDoseEpochDay) }),
            row.nextDoseEpochDay !== null && m.care_other_next_dose({ when: dayLabel(row.nextDoseEpochDay) })
          ]}
          href="/care/doses"
        />
      {/each}
    </ListCard>
  {/if}

  <SectionHeading text={m.care_group_hormones()} />
  <ListCard role={roleAt(activeFlag.roles, AREA_ROLE.readings)}>
    <!-- The row keeps its own name and earns a subtitle by stating the
         reading under it (DIRECTION.md 3b): the analyte and the result in
         its own unit, never converted (ADR-0026). The rail above carries
         the day it was drawn, and where that draw fell against dosing stays
         on /care/labs, which owns it. -->
    <ListRow
      key="labs"
      icon="flask"
      title={m.lab_results()}
      subtitle={latestLab && `${latestLab.analyte} ${latestLab.value} ${latestLab.unit}`.trim()}
      href="/care/labs"
    />
    <ListRow key="hormone-curve" icon="curve" title={m.curve_title()} href="/care/curve" />
    <!-- Ticket 09 (ADR-0084): the dose log and the exposure counters no
         longer get a row of their own here - the dose log is reached
         through the regimen block above (which links to /care/regimen,
         and /care/regimen's own list still names it), and the exposure
         counters' one useful figure is that block's own dose-total line
         now. Stock stays, because this is the one entry point to it that
         asks for no regimen to be running first - the block above only
         shows its own stock line while a single regimen is active. -->
    <ListRow
      key="stock"
      icon="package"
      title={m.regimen_stock_link()}
      subtitle={runOut && stockRemainingLabel(runOut.projection.remaining, runOut.entry.unit)}
      onclick={openStockList}
    />
    <!-- Ticket 59: the summary is an export over these five readings, not
         a sixth one of its own, so it joins the card that already reads
         them rather than getting a row that would have nothing to say
         under it. Written by hand rather than through HostedRows
         (ADR-0072) - ADR-0072's own registry is for an *area*, moved off
         the hub with the hide/finish rules its screen used to apply for
         it, and the summary fronts no area (`hubRows.ts` never gave it
         one). Appointment prep's own row to this screen is the same
         literal shape, unmoved by this ticket. -->
    <ListRow key="clinician-summary" icon="share" title={m.clinician_summary_row()} href="/health/clinician-summary" />
  </ListCard>

  <!-- What came of all of it (phase 9 carpet ticket 16). The list above is
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
       on `stockEditor` (the regimen block's own line, or a row tapped
       below) goes straight to that drug's fields, the dose panel's own Log
       sheet's shape; landing on the plain list (the Hormones card's row)
       is what /settings/stock's whole screen used to be, moved in whole
       rather than thinned out, since deleting a screen cannot also delete
       the only way to track a second drug's stock or add a first one. -->
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
  /* The regimen, named above the rail: what the line is a line about. Not a
     ListRow in a card of its own - that is a third stacked container on a
     390px screen for one fact, and DIRECTION.md 2b is about exactly that -
     but it keeps a row's touch target and a row's press. */
  .care-regimen {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    min-height: var(--touch-target);
    padding: var(--space-2) 0;
    margin-bottom: var(--space-3);
    text-decoration: none;
    color: inherit;
  }
  /* Ticket 09: the block gained a stock line and a dose-total line under
     the name, so the gap before the rail moves to the block as a whole and
     the link inside it stops adding its own. */
  .care-regimen-block .care-regimen {
    margin-bottom: 0;
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
    /* As tall as the rows in use, and the line sits between the rows above it
       and the rows below: with nothing above, a line near the top with its
       captions under it; with one row above, a line through the middle. Both
       counts come from the marks themselves rather than from a breakpoint. */
    --care-lane-h: 52px;
    --care-line-y: calc(var(--care-rows-above) * var(--care-lane-h) + 1px);
    height: calc((var(--care-rows-above) + var(--care-rows-below)) * var(--care-lane-h) + 2px);
    /* A rail with nothing above the line otherwise starts against the card's
       heading, which reads as the heading underlined. */
    padding-top: var(--space-2);
    display: flex;
    align-items: stretch;
  }
  /* The marks position inside the track, not the rail, so a caption centred
     on a mark at either end overflows into the rail's own margin instead of
     out of the card. */
  .care-track {
    position: relative;
    flex: 1;
    margin-inline: var(--space-6);
    height: 100%;
  }

  .care-line {
    position: absolute;
    top: var(--care-line-y);
    height: 2px;
    border-radius: 1px;
    transform: translateY(-50%);
  }
  /* Two lines, not one: the rail is read out from today in both directions,
     so it is drawn that way. The back line is the rail's full width in the
     role's own tint; the front line grows out from today's tick over
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
    transform: translateY(-50%) scaleX(0);
    transform-origin: 50% 50%;
    animation: care-line-grow var(--dur-authored) var(--ease-out) forwards;
  }
  @keyframes care-line-grow {
    to {
      transform: translateY(-50%) scaleX(1);
    }
  }

  /* The wrapper is what gets placed and animated, so the link inside it
     keeps the app's press (press.css). */
  .care-at {
    position: absolute;
    left: calc(var(--care-at) * 100%);
    transform: translateX(-50%);
    display: flex;
    flex-direction: column;
    align-items: center;
    /* A deep lane's tick reaches back past every row between it and the
       line (below), so a shallow neighbour close in x - a day or two apart
       is well inside a caption's width - sits behind that tick unless
       shallower always wins. Depth counts up with distance from the line,
       so this counts down: lane 0 stays on top of everything reaching past
       it. */
    z-index: calc(10 - var(--care-depth));
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
  .care-mark {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    line-height: 1.2;
    min-width: 100%;
    text-decoration: none;
    color: inherit;
    /* Backed by the card itself, so a deeper mark's tick reaching past this
       one (z-index on .care-at above) ends at this box rather than showing
       through the gaps between letters. */
    background: var(--surface);
  }
  /* Lane 0 hangs below the line, lane 1 stands above it: two labels that
     would print over each other take opposite sides of the rail rather than
     a second row on the same side, which is what keeps the card at one
     height whatever the arrangement (careSpine.ts assigns them). */
  .care-at[data-side='below'] {
    top: calc(var(--care-line-y) + var(--care-depth) * var(--care-lane-h));
    padding-top: var(--space-4);
  }
  .care-at[data-side='above'] {
    bottom: calc(100% - var(--care-line-y) + var(--care-depth) * var(--care-lane-h));
    padding-bottom: var(--space-4);
    /* Only the wrapper reverses, which puts the tick under the caption
       rather than over it. The caption itself reads label then date on both
       sides of the line; reversing it too flipped "Today / 31 Aug" into "31
       Aug / Today". */
    flex-direction: column-reverse;
  }

  /* The tick is also the stem: a caption pushed to a second row reaches back
     to the line rather than floating beside it, so a crowded pair still reads
     as two marks on one rail. */
  .care-tick {
    position: absolute;
    width: 2px;
    height: calc(var(--space-4) + var(--care-depth) * var(--care-lane-h));
    background: var(--role-mark);
    border-radius: 1px;
  }
  .care-at[data-side='below'] .care-tick {
    top: calc(-1 * var(--care-depth) * var(--care-lane-h));
  }
  .care-at[data-side='above'] .care-tick {
    bottom: calc(-1 * var(--care-depth) * var(--care-lane-h));
  }
  /* Today is a disc on the line rather than a tick off it: it is the one
     mark that is a place rather than an event, and it is what the rail is
     measured from. */
  .care-at.is-today .care-tick {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    border: 2px solid var(--surface);
  }
  /* A today pushed to a second row keeps a stem to the line under its disc,
     the way every other deep mark does. */
  .care-at.is-today::before {
    content: '';
    position: absolute;
    width: 2px;
    height: calc(var(--care-depth) * var(--care-lane-h));
    background: var(--role-mark);
  }
  .care-at.is-today[data-side='below']::before {
    top: calc(-1 * var(--care-depth) * var(--care-lane-h));
  }
  .care-at.is-today[data-side='above']::before {
    bottom: calc(-1 * var(--care-depth) * var(--care-lane-h));
  }
  .care-at.is-today[data-side='below'] .care-tick {
    top: calc(-6px - var(--care-depth) * var(--care-lane-h));
  }
  .care-at.is-today[data-side='above'] .care-tick {
    bottom: calc(-6px - var(--care-depth) * var(--care-lane-h));
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
  .care-at.is-today .care-what {
    color: var(--role-ink);
    font-weight: var(--weight-bold);
  }
  /* A day the rail could not reach, drawn at the end it was pulled in to.
     The caption still says the real date; the dotted tick is what says the
     mark is not where the day is. */
  .care-at.is-beyond .care-tick {
    background: repeating-linear-gradient(
      to bottom,
      var(--role-mark) 0 2px,
      transparent 2px 4px
    );
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
