<script lang="ts">
  /* Binder and tucking wear time, on the surface and chart kits (phase 5 UX
     ticket 25).

     The trend was two controls stacked above a card: a Segmented over every
     body region the person tracks, and a hand-written copy of `.segmented`
     for the range - the same class names as the real control with no
     sliding pill and no press. The range is the real Segmented now, and the
     region is the chart card's own picker, which is where DIRECTION.md puts
     a section's one switch and is also the control eight regions actually
     fit in.

     The marks stay WearTrendChart's. Two series on two scales is not
     something the chart kit draws, and drawing them as two cards would take
     away the only reason the pair is on one axis - whether the hours and
     the feeling move together. That also keeps the one legend in the app,
     which DIRECTION.md's chart rules refuse: a legend is what a
     single-series chart does not need, and two lines with nothing naming
     them is not a chart at all. Named as a departure rather than left to be
     found. */
  /* The binder/tucking wear log (phase 5 ticket 04, CONTEXT: "Wear
     session"). Two ways into the same row: tapping "Now" writes a running
     session (a null duration) immediately, and stopping it later fills the
     duration in; backfilling writes a complete row in one save. Editing an
     existing day only ever shifts the stored start by whole days
     (shiftStartToDay) - its time-of-day is never re-typed, so a session
     that was started live keeps its real hour even if its day is corrected
     later, and a backfilled one stays anchored at local midnight. */
  import { m } from '$lib/paraglide/messages';
  import DatePicker from '$lib/components/DatePicker.svelte';
  import { journal, liveList, liveQuery } from '$lib/data/live/journal.svelte';
  import { fmtDay, fmtTime } from '$lib/data/dates';
  import {
    dateInputValueFromEpochDay,
    epochDayFromDateInputValueOrToday,
    epochDayFromTimestamp,
    startOfDayTimestamp,
    timestampAtLocalTime,
    todayEpochDay,
    FIRST_EPOCH_DAY
  } from '$lib/data/epochDay';
  import {
    binderCueShowing,
    hoursMinutesOf,
    wearTrendRegion,
    WEAR_KIND_REGION,
    WEAR_KINDS
  } from '$lib/data/journal/wearSessions';
  import {
    wearDeleteSheetTitle,
    wearEditSheetTitle,
    wearKindLabel,
    wearNewSheetTitle,
    wearReminderTitle,
    wearRunningCardTitle,
    wearRunningSheetTitle,
    wearSafetyFacts,
    wearAddAria
  } from '$lib/data/vocabulary/wearLabels';
  import { prefs } from '$lib/data/prefs/store.svelte';
  import { plotDaySeriesGroup, type DayAxis } from '$lib/charts/dayAxis';
  import { highlightedPositions } from '$lib/charts/presentationHighlight';
  import { presentationRole } from '$lib/data/vocabulary/entryPresentation';
  import { dayAxisState } from '$lib/components/kit/dayAxis.svelte';
  import { dayAxisLabel, dayAxisOptions } from '$lib/components/kit/dayAxisLabel';
  import { BODY_REGION_INTENSITY_MAX, BODY_REGION_INTENSITY_MIN } from '$lib/data/bodyMap';
  import { vocabulary } from '$lib/data/vocabulary/vocabulary';
  import type { Reminder, WearKind, WearSession } from '$lib/data/types';
  import Icon from '$lib/components/Icon.svelte';
  import PresentationChipRow from '$lib/components/PresentationChipRow.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import { smartBack } from '$lib/navigation/smart-back';
  import Segmented from '$lib/components/Segmented.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';
  import ChartCard from '$lib/components/kit/ChartCard.svelte';
  import ChartEmpty from '$lib/components/kit/ChartEmpty.svelte';
  import ChartPicker from '$lib/components/kit/ChartPicker.svelte';
  import Field from '$lib/components/kit/Field.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import ListRow from '$lib/components/kit/ListRow.svelte';
  import Notice from '$lib/components/kit/Notice.svelte';
  import { recordEditor } from '$lib/components/kit/recordEditor.svelte';
  import RecordSheet from '$lib/components/kit/RecordSheet.svelte';
  import { crossfade, disclose, resize } from '$lib/motion/reveal';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';
  import { isAndroid } from '$lib/platform';

  /* ADR-0063 / ticket 32: the elapsed reminder can only ever fire through
     the Android bridge, so web offers no toggle and no hours field. */
  let isWeb = $derived(!isAndroid());

  /* Colour that carries a value takes role 0 (DIRECTION.md): index 0 is the
     only role guaranteed chromatic on all 8 palettes, and a two-line chart
     drawn in an achromatic band reads as disabled. The sessions take the
     stripe after it. */
  const SECTION_ROLE = { chart: 0, sessions: 1 };
  import Switch from '$lib/components/Switch.svelte';
  import WearTrendChart from '$lib/components/WearTrendChart.svelte';
  import AreaFinish from '$lib/components/AreaFinish.svelte';

  const WINDOW_DAYS = 90;
  const RANGES = [7, 14, 30, 90, 180, 365];
  const today = todayEpochDay();
  const from = today - WINDOW_DAYS;

  let sessionsQuery = liveList((j) => j.wearSessions.getSessions(from, today));
  let runningQuery = liveQuery((j) => j.wearSessions.getRunningSession());
  let remindersQuery = liveList((j) => j.reminders.getReminders());
  /* What a blank draft and the trend's region default open on. Not read off
     `sessions` above: that list is a 90 day window, and the kind somebody
     last logged is a fact about their whole journal (wearSessions.ts). */
  let latestKindQuery = liveQuery((j) => j.wearSessions.latestKind());

  let sessions = $derived(sessionsQuery.rows);
  let running = $derived(runningQuery.value ?? null);
  let reminders = $derived(remindersQuery.rows);
  let loading = $derived(sessionsQuery.loading);
  /* Binder when there is nothing to go on. The sheet opens on it with the
     picker right there, so a first session is one tap from being corrected;
     quick add's one-tap start is the case with no picker at all, and it
     reads the same answer (QuickAdd.svelte). */
  let latestKind = $derived<WearKind>(latestKindQuery.value ?? 'binder');

  // Newest first - the running session (if any) gets its own card above this list.
  let completed = $derived([...sessions].filter((s) => s.durationMs !== null).reverse());

  let nowTick = $state(Date.now());
  $effect(() => {
    if (!running) return;
    const id = setInterval(() => (nowTick = Date.now()), 30000);
    return () => clearInterval(id);
  });

  let runningElapsed = $derived(running ? hoursMinutesOf(nowTick - running.startTimestamp) : null);
  /* Recomputed off the same 30 second tick the elapsed reading is, so the
     cue appears on its own without the screen being touched (ADR-0064). */
  let showCue = $derived(
    running !== null && binderCueShowing(running, nowTick, prefs.wearDurationCueEnabled)
  );

  const reminderFor = (sessionId: string): Reminder | null =>
    reminders.find((r) => r.autoSource === `wear:${sessionId}`) ?? null;

  /** Hours between an existing reminder and the session's start - the
      inverse of wearSessions.ts's ruleForHoursAfter, used only to prefill
      the editor from whatever is already stored. */
  function hoursAfterStart(startTimestamp: number, reminder: Reminder): number {
    if (reminder.epochDay === null) return 0;
    const at = timestampAtLocalTime(reminder.epochDay, reminder.time);
    return Math.round(((at - startTimestamp) / 3600000) * 10) / 10;
  }

  /** Moves `startTimestamp` to `newEpochDay`, keeping its time-of-day. A
      brand-new backfilled session anchors at local midnight (its editor
      opens with `startTimestamp` already at that day's midnight), so this
      one function serves both a fresh backfill and correcting an existing
      session's day. */
  function shiftStartToDay(startTimestamp: number, newEpochDay: number): number {
    const originalDay = epochDayFromTimestamp(startTimestamp);
    const timeOfDayMs = startTimestamp - startOfDayTimestamp(originalDay);
    return startOfDayTimestamp(newEpochDay) + timeOfDayMs;
  }

  type Mode = 'live' | 'backfill';

  type Editor = {
    id?: string;
    /** Editable on an existing session, unlike `mode`: a mistyped kind
        would otherwise leave the row wearing the wrong wording for good,
        and it is the same one column either way. */
    kind: WearKind;
    isRunning: boolean;
    /** The anchor a day change is applied against (shiftStartToDay). For a
        brand-new backfilled session this is today's local midnight. */
    startTimestamp: number;
    /** Only meaningful for a brand-new session - editing an existing one
        never changes which of the two modes wrote it. */
    mode: Mode;
    day: string;
    durationHours: string;
    note: string;
    reminderEnabled: boolean;
    reminderHours: string;
  };

  const record = recordEditor<WearSession, Editor>({
    blank: () => ({
      kind: latestKind,
      isRunning: false,
      startTimestamp: startOfDayTimestamp(today),
      mode: running ? 'backfill' : 'live',
      day: dateInputValueFromEpochDay(today),
      durationHours: '',
      note: '',
      reminderEnabled: false,
      reminderHours: ''
    }),
    fromRecord: (session) => {
      const isRunning = session.durationMs === null;
      const reminder = reminderFor(session.id);
      return {
        id: session.id,
        kind: session.kind,
        isRunning,
        startTimestamp: session.startTimestamp,
        mode: isRunning ? 'live' : 'backfill',
        day: dateInputValueFromEpochDay(epochDayFromTimestamp(session.startTimestamp)),
        durationHours: session.durationMs !== null ? String(session.durationMs / 3600000) : '',
        note: session.note ?? '',
        reminderEnabled: reminder !== null,
        reminderHours: reminder ? String(hoursAfterStart(session.startTimestamp, reminder)) : ''
      };
    },
    async upsert(draft) {
      if (!canSave(draft)) return false;
      const note = draft.note.trim() || null;
      const reminderHoursAfterStart = reminderHoursOf(draft);

      if (draft.mode === 'live' && !draft.id) {
        await journal.wearSessions.upsertSession({
          kind: draft.kind,
          startTimestamp: Date.now(),
          durationMs: null,
          note,
          reminderHoursAfterStart,
          reminderTitle: wearReminderTitle(draft.kind)
        });
        return;
      }

      const newDay = epochDayFromDateInputValueOrToday(draft.day);
      await journal.wearSessions.upsertSession({
        id: draft.id,
        kind: draft.kind,
        startTimestamp: shiftStartToDay(draft.startTimestamp, newDay),
        durationMs: Math.round(parseFloat(draft.durationHours) * 3600000),
        note,
        reminderHoursAfterStart,
        reminderTitle: wearReminderTitle(draft.kind)
      });
    },
    remove: (id) => journal.wearSessions.deleteSession(id),
    findById: (id) => sessions.find((s) => s.id === id) ?? (running?.id === id ? running : undefined)
  });

  let kindOptions = $derived(WEAR_KINDS.map((kind) => ({ value: kind, label: wearKindLabel(kind) })));

  let modeOptions = $derived(
    running
      ? [{ value: 'backfill', label: m.wear_session_mode_backfill() }]
      : [
          { value: 'live', label: m.wear_session_mode_live() },
          { value: 'backfill', label: m.wear_session_mode_backfill() }
        ]
  );

  /* A predicate over the draft rather than a derived off the open editor,
     so the sheet's disabled state and `upsert`'s own refusal are the same
     rule read twice. */
  function canSave(draft: Editor): boolean {
    if (!isWeb && draft.reminderEnabled) {
      const hours = parseFloat(draft.reminderHours);
      if (draft.reminderHours.trim() === '' || isNaN(hours)) return false;
    }
    if (draft.isRunning) return true;
    if (draft.mode === 'live' && !draft.id) return true;
    const duration = parseFloat(draft.durationHours);
    return draft.durationHours.trim() !== '' && !isNaN(duration) && duration > 0;
  }

  /* undefined leaves an existing reminder row untouched; null deletes it
     (wearSessions.reconcileReminder). Web has no way to change the
     reminder, so it must always send undefined - never re-derive null from
     an editor.reminderEnabled that a hidden toggle left at its prefilled
     value (ticket 32). */
  const reminderHoursOf = (editor: Editor): number | null | undefined =>
    isWeb ? undefined : editor.reminderEnabled ? parseFloat(editor.reminderHours) : null;

  async function stopRunning(draft: Editor) {
    await journal.wearSessions.upsertSession({
      id: draft.id,
      kind: draft.kind,
      startTimestamp: draft.startTimestamp,
      durationMs: Date.now() - draft.startTimestamp,
      note: draft.note.trim() || null,
      reminderHoursAfterStart: reminderHoursOf(draft),
      reminderTitle: wearReminderTitle(draft.kind)
    });
    record.editor = null;
  }

  const fmtDayLong = (epochDay: number) => fmtDay(epochDay, { day: 'numeric', month: 'long', year: 'numeric' });

  /* One region per kind and nothing else (CONTEXT: "Wear session"), not the
     full body-map vocabulary. Three rather than the two this offered before
     kinds existed, because compression compares against hips and waist. */
  const TREND_REGIONS = Object.values(WEAR_KIND_REGION);
  let trendRegionOptions = $derived(
    vocabulary.bodyRegions.filter((r) => TREND_REGIONS.includes(r.id)).map((r) => ({ value: r.id, label: r.name }))
  );
  /* Null until the person picks. Which region that resolves to - the pick,
     the kind's default, or the fallback when either names a region the
     person has turned off - is `wearTrendRegion`'s rule, not this screen's
     (wearSessions.ts). */
  let pickedRegion = $state<string | null>(null);
  let trendRegion = $derived(
    wearTrendRegion(
      latestKind,
      pickedRegion,
      trendRegionOptions.map((r) => r.value)
    )
  );

  let range = $state(30);

  /* Which axis the trend is read on (ticket 16). Both its series take the
     same one, which is not a choice so much as the only coherent reading:
     they already share one x axis, and the whole point of the pair is
     whether the hours and the feeling move together. The queries, the
     fallback and the keying are the kit's (dayAxis.svelte.ts), shared with
     the body map. */
  const readAxis = dayAxisState(() => today);

  /* A re-keyed axis reads all history and says so. The question needs every
     interval, or every day either side of a surgery, available; the range
     picker would hand it a slice near today that answers nothing, so it is
     swapped out rather than left sitting there inert. */
  let trendFrom = $derived(readAxis.keying ? FIRST_EPOCH_DAY : today - range + 1);

  let wearTrendQuery = liveList((j) => j.stats.wearTimeTrend(trendFrom, today));
  /* Dysphoria specifically, which is the axis this chart has always drawn -
     ticket 31 gave a region a second one but did not widen what wear time is
     compared against. */
  let regionTrendQuery = liveList((j) =>
    j.stats.bodyRegionTrend(trendRegion, 'dysphoria', trendFrom, today)
  );
  /* One call for both, so the two lines fold at one width. Folded
     separately they would space their marks differently while sharing an
     axis, which is the one reading this chart exists to support
     ($lib/charts/dayAxis). */
  let plotted = $derived(
    plotDaySeriesGroup([wearTrendQuery.rows, regionTrendQuery.rows], readAxis.keying, range)
  );
  /* WearTrendChart places by a numeric x and knows nothing about what it
     counts, so a position goes in where an epoch day used to with no change
     to the renderer - which is exactly the substitution re-keying is. */
  let wearTrend = $derived(plotted[0].points.map((point) => ({ day: point.x, value: point.y })));
  let regionTrend = $derived(plotted[1].points.map((point) => ({ day: point.x, value: point.y })));
  let wearMax = $derived(Math.max(4, 1, ...wearTrend.map((p) => Math.ceil(p.value))));
  let trendRegionLabel = $derived(trendRegionOptions.find((r) => r.value === trendRegion)?.label ?? '');
  let axisName = $derived(dayAxisLabel(readAxis.axis, readAxis.anchors));

  /* The presentation chip (ticket 17, ADR-0048): highlights, never
     filters, so both lines above keep drawing exactly what they draw
     today. Read over the same `trendFrom`/`today` window the two series
     themselves read, then carried through whichever axis is in force -
     the calendar's own bucket on the calendar axis, or the same
     day-to-position rule dayKeying.ts folds the series by on a re-keyed
     one, at the one width `plotted` already settled the group on
     ($lib/charts/presentationHighlight.ts). */
  let selectedPresentation = $state<string | null>(null);
  let presentationDaysQuery = liveList((j) =>
    selectedPresentation ? j.stats.presentationDays(selectedPresentation, trendFrom, today) : Promise.resolve([])
  );
  let highlightRole = $derived(presentationRole(selectedPresentation));
  let highlightedAt = $derived(
    highlightedPositions(presentationDaysQuery.rows, readAxis.keying, plotted[0].grain ?? 'day', plotted[0].width)
  );
  let trendHighlight = $derived(
    highlightRole ? { positions: [...highlightedAt], role: highlightRole } : undefined
  );
</script>

<div class="screen">
  <ScreenHeader title={m.wear_log()} back={() => smartBack('/more')} subtitle={m.wear_log_intro()}>
    {#snippet actions()}
      <button class="icon-btn press" data-add aria-label={wearAddAria(latestKind)} onclick={() => record.openEditor(null)}>
        <Icon name="plus" size={22} />
      </button>
    {/snippet}
  </ScreenHeader>

  {#if loading}
    <div out:crossfade><Skeleton variant="block" count={1} /></div>
  {:else}
    <div class="screen-part">
      {#if running}
        <ListCard role={roleAt(activeFlag.roles, SECTION_ROLE.sessions)}>
          <ListRow
            key="running"
            data-wear-running
            icon="clock"
            title={wearRunningCardTitle(running.kind)}
            subtitle={runningElapsed
              ? `${m.wear_session_running_since({ time: fmtTime(running.startTimestamp) })} · ${m.wear_session_duration_hm({ hours: String(runningElapsed.hours), minutes: String(runningElapsed.minutes) })}`
              : m.wear_session_running_since({ time: fmtTime(running.startTimestamp) })}
            chevron={false}
            onclick={() => record.openEditor(running)}
          >
            {#snippet trailing()}
              <Icon name="stop" size={20} />
            {/snippet}
          </ListRow>
          <!-- The cue (ADR-0064). A line inside the card the running row
               already sits in, rather than anything that interrupts: the
               row keeps its stop control, and nothing about Stop or Save
               changes when this appears. -->
          {#if showCue}
            <p class="muted small wear-cue" data-wear-duration-cue transition:disclose>{m.wear_session_cue()}</p>
          {/if}
        </ListCard>
      {/if}

      {#if completed.length}
        <div class="screen-part">
          <ListCard role={roleAt(activeFlag.roles, SECTION_ROLE.sessions)}>
            {#each completed as session (session.id)}
              {@const parts = hoursMinutesOf(session.durationMs ?? 0)}
              <ListRow
                key={session.id}
                data-wear-session={session.id}
                icon="clock"
                title={`${wearKindLabel(session.kind)} · ${m.wear_session_duration_hm({ hours: String(parts.hours), minutes: String(parts.minutes) })}`}
                subtitle={session.note
                  ? `${fmtDayLong(epochDayFromTimestamp(session.startTimestamp))} · ${session.note}`
                  : fmtDayLong(epochDayFromTimestamp(session.startTimestamp))}
                chevron={false}
                onclick={() => record.openEditor(session)}
              />
            {/each}
          </ListCard>
        </div>
      {:else if !running}
        <Notice
          icon="clock"
          key="wear-empty"
          role={roleAt(activeFlag.roles, SECTION_ROLE.sessions)}
          title={m.wear_session_empty_title()}
          text={m.wear_session_empty_body()}
          action={{ label: m.wear_session_empty_action(), primary: true, onclick: () => record.openEditor(null) }}
        />
      {/if}

      <!-- No heading over the range. The chart card under it is called
           "Wear time and intensity" and so was this, one above the other -
           the same two-headers-stacked reading DIRECTION.md 3d names. The
           card names the area. -->
      <!-- The axis first, because it decides whether there is a range to
           pick, and absent for a journal that can answer only the calendar. -->
      <div class="kit-reading-controls">
        {#if readAxis.axes.length > 1}
          <div class="kit-filter">
            <label class="kit-filter-label" for="wear-axis">{m.chart_axis_label()}</label>
            <ChartPicker
              key="wear-axis"
              id="wear-axis"
              labelledBy="wear-axis"
              value={readAxis.axis}
              options={dayAxisOptions(readAxis.axes, readAxis.anchors)}
              onPick={(value) => (readAxis.axis = value as DayAxis)}
            />
          </div>
        {/if}

      <!-- One slot for the range control and the whole-journal note that
           replaces it, travelling between the two rather than snapping
           (kit.css's .kit-reading-slot). -->
        <div class="kit-reading-slot" use:resize>
          {#if readAxis.keying}
            <p class="muted small kit-reading-note" out:crossfade>{m.chart_axis_all_history()}</p>
          {:else}
            <div out:crossfade>
              <Segmented
                name={m.stats_range_group()}
                options={RANGES.map((r) => ({ value: String(r), label: m.range_days({ days: String(r) }) }))}
                value={String(range)}
                onChange={(v) => (range = Number(v))}
                compact
                key="wear-range"
              />
            </div>
          {/if}
        </div>
      </div>
      <div class="screen-part">
        <PresentationChipRow value={selectedPresentation} onPick={(id) => (selectedPresentation = id)} />
      </div>
      <ChartCard
        heading={m.wear_session_trend_title()}
        kind="wear-trend"
        role={roleAt(activeFlag.roles, SECTION_ROLE.chart)}
      >
        {#snippet control()}
          {#if trendRegionOptions.length}
            <ChartPicker
              key="wear-region"
              label={m.wear_session_trend_region_group()}
              value={trendRegion}
              options={trendRegionOptions}
              onPick={(v) => (pickedRegion = v)}
            />
          {/if}
        {/snippet}
        <!-- A chart with nothing in it drew an empty plot and a legend
             naming two lines that were not there. It says so instead, the
             way every other chart in the kit does. -->
        {#if wearTrend.length || regionTrend.length}
          <WearTrendChart
            wearPoints={wearTrend}
            regionPoints={regionTrend}
            {wearMax}
            regionMin={BODY_REGION_INTENSITY_MIN}
            regionMax={BODY_REGION_INTENSITY_MAX}
            highlight={trendHighlight}
            ariaLabel={readAxis.keying
              ? m.chart_axis_reading_aria({ reading: m.wear_session_trend_title(), axis: axisName })
              : m.wear_session_trend_title()}
          />
          <p class="muted small wear-trend-legend">
            <span class="legend-dot legend-wear"></span>{m.wear_session_trend_wear_legend()}
            <span class="legend-dot legend-region"></span>{m.wear_session_trend_region_legend({ region: trendRegionLabel })}
          </p>
        {:else}
          <ChartEmpty>{m.not_enough_data()}</ChartEmpty>
        {/if}
      </ChartCard>
    </div>
  {/if}

  <!-- Saying you are done with this area (phase 8 features ticket 04). -->
  <AreaFinish group="wear" />

  <RecordSheet
    {record}
    handle="wear-session"
    newTitle={(draft) => wearNewSheetTitle(draft.kind)}
    editTitle={(draft) => (draft.isRunning ? wearRunningSheetTitle(draft.kind) : wearEditSheetTitle(draft.kind))}
    deleteLabel={m.wear_session_delete()}
    confirm={{
      title: (session) => wearDeleteSheetTitle(session.kind),
      question: (session) =>
        m.wear_session_delete_q({ date: fmtDayLong(epochDayFromTimestamp(session.startTimestamp)) }),
      hint: () => m.wear_session_delete_hint(),
      confirmLabel: m.wear_session_delete(),
      cancelLabel: m.keep_it()
    }}
  >
    {#snippet fields(editor)}
      <Field label={m.wear_kind_group()} legend>
        {#snippet children()}
          <Segmented
            key="wear-kind"
            name={m.wear_kind_group()}
            options={kindOptions}
            value={editor.kind}
            onChange={(v) => (editor.kind = v as WearKind)}
          />
        {/snippet}
      </Field>

      {#if editor.isRunning}
        <p class="muted small">{m.wear_session_running_since({ time: fmtTime(editor.startTimestamp) })}</p>
      {:else}
        {#if !editor.id}
          <Field label={m.wear_session_mode_group()} legend>
            {#snippet children()}
              <Segmented name={m.wear_session_mode_group()} options={modeOptions} value={editor.mode} onChange={(v) => (editor.mode = v as Mode)} />
            {/snippet}
          </Field>
        {/if}

        {#if editor.mode === 'backfill'}
          <div class="disclosed" transition:disclose>
            <Field label={m.wear_session_day_label()} id="wear-day">
              {#snippet children(id)}
                <DatePicker name="wear-day" bind:value={editor.day} {id} />
              {/snippet}
            </Field>
            <Field label={m.wear_session_duration_label()} id="wear-duration">
              {#snippet children(id)}
                <input
                  class="input"
                  type="number"
                  {id}
                  name="wear-duration"
                  inputmode="decimal"
                  placeholder={m.wear_session_duration_placeholder()}
                  bind:value={editor.durationHours}
                />
              {/snippet}
            </Field>
          </div>
        {/if}
      {/if}

      <Field label={m.wear_session_note_label()} id="wear-note">
        {#snippet children(id)}
          <textarea class="input" {id} name="wear-note" placeholder={m.wear_session_note_placeholder()} bind:value={editor.note}
          ></textarea>
        {/snippet}
      </Field>

      <!-- The facts (ticket 50 section 4). Always here, for every kind, and
           never gated by the duration cue's toggle: these are about method
           rather than duration, and each block names where it comes from
           the way the voice screen's pitch bands do (ADR-0059). -->
      <!-- One slot that travels between the three sets rather than snapping
           to a new height, the same pairing the range control above uses:
           `resize` on the box, `crossfade` on the block leaving it. -->
      <div use:resize>
        {#key editor.kind}
          {@const safety = wearSafetyFacts(editor.kind)}
          <div class="wear-facts" data-wear-facts={editor.kind} out:crossfade>
            <p class="wear-facts-title">{m.wear_facts_title()}</p>
            <ul class="muted small wear-facts-list">
              {#each safety.facts as fact (fact)}
                <li>{fact}</li>
              {/each}
            </ul>
            <p class="muted small">{safety.source}</p>
          </div>
        {/key}
      </div>

      {#if !isWeb}
        <Field label={m.wear_session_reminder_toggle()} legend spread>
          {#snippet children()}
            <Switch checked={editor.reminderEnabled} label={m.wear_session_reminder_toggle()} onChange={(v) => (editor.reminderEnabled = v)} />
          {/snippet}
        </Field>
        {#if editor.reminderEnabled}
          <div class="disclosed" transition:disclose>
            <Field label={m.wear_session_reminder_hours_label()} id="wear-reminder-hours">
              {#snippet children(id)}
                <input
                  class="input"
                  type="number"
                  {id}
                  name="wear-reminder-hours"
                  inputmode="decimal"
                  bind:value={editor.reminderHours}
                />
              {/snippet}
            </Field>
            <p class="muted small">{m.wear_session_reminder_hint()}</p>
          </div>
        {/if}
      {/if}
    {/snippet}
    <!-- The one screen whose primary action is not always a save: a live
         session is started and then stopped, and each of the three carries
         its own handle. -->
    {#snippet primary(editor)}
      {#if editor.isRunning}
        <button class="btn btn-primary" data-stop-wear-session onclick={() => stopRunning(editor)}>
          <span>{m.wear_session_stop_action()}</span>
        </button>
      {:else if editor.mode === 'live' && !editor.id}
        <button class="btn btn-primary" data-start-wear-session disabled={!canSave(editor)} onclick={record.save}>
          <span>{m.wear_session_start_action()}</span>
        </button>
      {:else}
        <button class="btn btn-primary" data-save-wear-session disabled={!canSave(editor)} onclick={record.save}>
          <span>{m.wear_session_save()}</span>
        </button>
      {/if}
    {/snippet}
  </RecordSheet>
</div>

<style>
  /* The running session had an accent outline drawn around the row to say
     it was live. The card it now sits in has an outline of its own and the
     two would have been a line inside a line; what says it is running is
     that it is the only row above the list, with a stop control where every
     other row carries nothing. */
  .wear-trend-legend {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex-wrap: wrap;
    margin-top: var(--space-2);
  }

  .legend-dot {
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 999px;
    margin-right: 4px;
  }

  .legend-wear {
    background: var(--chart-line);
  }

  .legend-region {
    background: var(--accent-2);
  }

  /* Indented to the row's text column rather than the card's edge, so the
     cue reads as belonging to the session above it. */
  .wear-cue {
    margin: 0;
    padding: 0 var(--space-4) var(--space-3) var(--space-4);
  }

  .wear-facts {
    display: grid;
    gap: var(--space-1);
  }

  .wear-facts-title {
    margin: 0;
    font-weight: var(--weight-medium);
  }

  .wear-facts-list {
    margin: 0;
    padding-left: var(--space-4);
    display: grid;
    gap: var(--space-1);
  }
</style>
