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
  import { journal, liveQuery } from '$lib/data/live/journal.svelte';
  import { fmtDay, fmtTime } from '$lib/data/dates';
  import {
    dateInputValueFromEpochDay,
    epochDayFromDateInputValue,
    epochDayFromTimestamp,
    startOfDayTimestamp,
    timestampAtLocalTime,
    todayEpochDay
  } from '$lib/data/epochDay';
  import { BODY_REGION_INTENSITY_MAX, BODY_REGION_INTENSITY_MIN } from '$lib/data/bodyMap';
  import { vocabulary } from '$lib/data/vocabulary/vocabulary';
  import type { Reminder, WearSession } from '$lib/data/types';
  import Icon from '$lib/components/Icon.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import Segmented from '$lib/components/Segmented.svelte';
  import Sheet from '$lib/components/Sheet.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';
  import ChartCard from '$lib/components/kit/ChartCard.svelte';
  import ChartPicker from '$lib/components/kit/ChartPicker.svelte';
  import ConfirmDeleteSheet from '$lib/components/kit/ConfirmDeleteSheet.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import ListRow from '$lib/components/kit/ListRow.svelte';
  import Notice from '$lib/components/kit/Notice.svelte';
  import { recordEditor } from '$lib/components/kit/recordEditor.svelte';
  import { crossfade, disclose } from '$lib/motion/reveal';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';

  /* Colour that carries a value takes role 0 (DIRECTION.md): index 0 is the
     only role guaranteed chromatic on all 8 palettes, and a two-line chart
     drawn in an achromatic band reads as disabled. The sessions take the
     stripe after it. */
  const SECTION_ROLE = { chart: 0, sessions: 1 };
  import Switch from '$lib/components/Switch.svelte';
  import WearTrendChart from '$lib/components/WearTrendChart.svelte';

  const WINDOW_DAYS = 90;
  const RANGES = [7, 14, 30, 90, 180, 365];
  const today = todayEpochDay();
  const from = today - WINDOW_DAYS;

  let sessionsQuery = liveQuery((j) => j.wearSessions.getSessions(from, today));
  let runningQuery = liveQuery((j) => j.wearSessions.getRunningSession());
  let remindersQuery = liveQuery((j) => j.reminders.getReminders());

  let sessions = $derived(sessionsQuery.value ?? []);
  let running = $derived(runningQuery.value ?? null);
  let reminders = $derived(remindersQuery.value ?? []);
  let loading = $derived(sessionsQuery.loading);

  // Newest first - the running session (if any) gets its own card above this list.
  let completed = $derived([...sessions].filter((s) => s.durationMs !== null).reverse());

  let nowTick = $state(Date.now());
  $effect(() => {
    if (!running) return;
    const id = setInterval(() => (nowTick = Date.now()), 30000);
    return () => clearInterval(id);
  });

  /** Whole hours and minutes out of a millisecond span - used both for a
      completed session's stored duration and a running one's live elapsed
      time against `nowTick`. */
  function hoursMinutesOf(ms: number): { hours: number; minutes: number } {
    const totalMinutes = Math.max(0, Math.floor(ms / 60000));
    return { hours: Math.floor(totalMinutes / 60), minutes: totalMinutes % 60 };
  }

  let runningElapsed = $derived(running ? hoursMinutesOf(nowTick - running.startTimestamp) : null);

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
      if (!editorCanSave) return false;
      const note = draft.note.trim() || null;
      const reminderHoursAfterStart = reminderHoursOf(draft);

      if (draft.mode === 'live' && !draft.id) {
        await journal.wearSessions.upsertSession({
          startTimestamp: Date.now(),
          durationMs: null,
          note,
          reminderHoursAfterStart,
          reminderTitle: m.wear_log()
        });
        return;
      }

      const newDay = epochDayFromDateInputValue(draft.day) ?? today;
      await journal.wearSessions.upsertSession({
        id: draft.id,
        startTimestamp: shiftStartToDay(draft.startTimestamp, newDay),
        durationMs: Math.round(parseFloat(draft.durationHours) * 3600000),
        note,
        reminderHoursAfterStart,
        reminderTitle: m.wear_log()
      });
    },
    remove: (id) => journal.wearSessions.deleteSession(id),
    findById: (id) => sessions.find((s) => s.id === id) ?? (running?.id === id ? running : undefined)
  });
  let editor = $derived(record.editor);
  let deleteTarget = $derived(record.deleteTarget);

  let modeOptions = $derived(
    running
      ? [{ value: 'backfill', label: m.wear_session_mode_backfill() }]
      : [
          { value: 'live', label: m.wear_session_mode_live() },
          { value: 'backfill', label: m.wear_session_mode_backfill() }
        ]
  );

  let editorCanSave = $derived.by(() => {
    if (!editor) return false;
    if (editor.reminderEnabled) {
      const hours = parseFloat(editor.reminderHours);
      if (editor.reminderHours.trim() === '' || isNaN(hours)) return false;
    }
    if (editor.isRunning) return true;
    if (editor.mode === 'live' && !editor.id) return true;
    const duration = parseFloat(editor.durationHours);
    return editor.durationHours.trim() !== '' && !isNaN(duration) && duration > 0;
  });

  const reminderHoursOf = (editor: Editor): number | null => (editor.reminderEnabled ? parseFloat(editor.reminderHours) : null);

  async function stopRunning() {
    if (!editor || !editor.isRunning) return;
    await journal.wearSessions.upsertSession({
      id: editor.id,
      startTimestamp: editor.startTimestamp,
      durationMs: Date.now() - editor.startTimestamp,
      note: editor.note.trim() || null,
      reminderHoursAfterStart: reminderHoursOf(editor),
      reminderTitle: m.wear_log()
    });
    record.editor = null;
  }

  const fmtDayLong = (epochDay: number) => fmtDay(epochDay, { day: 'numeric', month: 'long', year: 'numeric' });

  /* Chest and genitals only - binder and tucking's own pair (CONTEXT: "Wear
     session"), not the full body-map vocabulary. */
  let trendRegionOptions = $derived(
    vocabulary.bodyRegions
      .filter((r) => r.id === 'chest' || r.id === 'genitals')
      .map((r) => ({ value: r.id, label: r.name }))
  );
  let trendRegion = $state('chest');
  $effect(() => {
    if (trendRegionOptions.length && !trendRegionOptions.some((r) => r.value === trendRegion)) {
      trendRegion = trendRegionOptions[0].value;
    }
  });

  let range = $state(30);
  let trendFrom = $derived(today - range + 1);

  let wearTrendQuery = liveQuery((j) => j.stats.wearTimeTrend(trendFrom, today));
  /* Dysphoria specifically, which is the axis this chart has always drawn -
     ticket 31 gave a region a second one but did not widen what wear time is
     compared against. */
  let regionTrendQuery = liveQuery((j) =>
    j.stats.bodyRegionTrend(trendRegion, 'dysphoria', trendFrom, today)
  );
  let wearTrend = $derived(wearTrendQuery.value ?? []);
  let regionTrend = $derived(regionTrendQuery.value ?? []);
  let wearMax = $derived(Math.max(4, 1, ...wearTrend.map((p) => Math.ceil(p.value))));
  let trendRegionLabel = $derived(trendRegionOptions.find((r) => r.value === trendRegion)?.label ?? '');
</script>

<div class="screen">
  <ScreenHeader title={m.wear_log()} back="/more" subtitle={m.wear_log_intro()}>
    {#snippet actions()}
      <button class="icon-btn press" data-add aria-label={m.wear_session_add_aria()} onclick={() => record.openEditor(null)}>
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
            title={m.wear_session_running_card_title()}
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
                title={m.wear_session_duration_hm({ hours: String(parts.hours), minutes: String(parts.minutes) })}
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
      <Segmented
        name={m.stats_range_group()}
        options={RANGES.map((r) => ({ value: String(r), label: m.range_days({ days: String(r) }) }))}
        value={String(range)}
        onChange={(v) => (range = Number(v))}
        compact
        key="wear-range"
      />
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
              onPick={(v) => (trendRegion = v)}
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
            ariaLabel={m.wear_session_trend_title()}
          />
          <p class="muted small wear-trend-legend">
            <span class="legend-dot legend-wear"></span>{m.wear_session_trend_wear_legend()}
            <span class="legend-dot legend-region"></span>{m.wear_session_trend_region_legend({ region: trendRegionLabel })}
          </p>
        {:else}
          <p class="kit-chart-empty">{m.not_enough_data()}</p>
        {/if}
      </ChartCard>
    </div>
  {/if}

  <Sheet
    open={editor !== null}
    title={editor?.isRunning ? m.wear_session_running_sheet() : editor?.id ? m.wear_session_edit_sheet() : m.wear_session_new_sheet()}
    onClose={() => (record.editor = null)}
  >
    {#if editor}
      <h3>{editor.isRunning ? m.wear_session_running_sheet() : editor.id ? m.wear_session_edit_sheet() : m.wear_session_new_sheet()}</h3>

      {#if editor.isRunning}
        <p class="muted small">{m.wear_session_running_since({ time: fmtTime(editor.startTimestamp) })}</p>
      {:else}
        {#if !editor.id}
          <div class="field">
            <span class="field-label">{m.wear_session_mode_group()}</span>
            <Segmented name={m.wear_session_mode_group()} options={modeOptions} value={editor.mode} onChange={(v) => editor && (editor.mode = v as Mode)} />
          </div>
        {/if}

        {#if editor.mode === 'backfill'}
          <div class="disclosed" transition:disclose>
            <div class="field">
              <label class="field-label" for="wear-day">{m.wear_session_day_label()}</label>
              <input class="input" type="date" id="wear-day" name="wear-day" bind:value={editor.day} />
            </div>
            <div class="field">
              <label class="field-label" for="wear-duration">{m.wear_session_duration_label()}</label>
              <input
                class="input"
                type="number"
                id="wear-duration"
                name="wear-duration"
                inputmode="decimal"
                placeholder={m.wear_session_duration_placeholder()}
                bind:value={editor.durationHours}
              />
            </div>
          </div>
        {/if}
      {/if}

      <div class="field">
        <label class="field-label" for="wear-note">{m.wear_session_note_label()}</label>
        <textarea class="input" id="wear-note" name="wear-note" placeholder={m.wear_session_note_placeholder()} bind:value={editor.note}
        ></textarea>
      </div>

      <div class="field spread">
        <span class="field-label" id="wear-reminder-label">{m.wear_session_reminder_toggle()}</span>
        <Switch checked={editor.reminderEnabled} label={m.wear_session_reminder_toggle()} onChange={(v) => editor && (editor.reminderEnabled = v)} />
      </div>
      {#if editor.reminderEnabled}
        <div class="disclosed" transition:disclose>
          <div class="field">
            <label class="field-label" for="wear-reminder-hours">{m.wear_session_reminder_hours_label()}</label>
            <input
              class="input"
              type="number"
              id="wear-reminder-hours"
              name="wear-reminder-hours"
              inputmode="decimal"
              bind:value={editor.reminderHours}
            />
          </div>
          <p class="muted small">{m.wear_session_reminder_hint()}</p>
        </div>
      {/if}

      <div class="stack-3">
        {#if editor.isRunning}
          <button class="btn btn-primary" data-stop-wear-session onclick={stopRunning}><span>{m.wear_session_stop_action()}</span></button>
        {:else if editor.mode === 'live' && !editor.id}
          <button class="btn btn-primary" data-start-wear-session disabled={!editorCanSave} onclick={record.save}>
            <span>{m.wear_session_start_action()}</span>
          </button>
        {:else}
          <button class="btn btn-primary" data-save-wear-session disabled={!editorCanSave} onclick={record.save}>
            <span>{m.wear_session_save()}</span>
          </button>
        {/if}
        {#if editor.id}
          <button class="btn btn-ghost" data-delete-wear-session onclick={() => record.askToDelete()}><span>{m.wear_session_delete()}</span></button>
        {/if}
      </div>
    {/if}
  </Sheet>

  <ConfirmDeleteSheet
    open={deleteTarget !== null}
    title={m.wear_session_delete_sheet()}
    question={deleteTarget ? m.wear_session_delete_q({ date: fmtDayLong(epochDayFromTimestamp(deleteTarget.startTimestamp)) }) : ''}
    hint={m.wear_session_delete_hint()}
    confirmLabel={m.wear_session_delete()}
    cancelLabel={m.keep_it()}
    confirmAttrs={{ 'data-confirm-delete-wear-session': '' }}
    onConfirm={record.confirmDelete}
    onCancel={record.cancelDelete}
  />
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
</style>
