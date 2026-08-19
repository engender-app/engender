<script lang="ts">
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
  import EmptyState from '$lib/components/EmptyState.svelte';
  import Segmented from '$lib/components/Segmented.svelte';
  import Sheet from '$lib/components/Sheet.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';
  import Switch from '$lib/components/Switch.svelte';
  import WearTrendChart from '$lib/components/WearTrendChart.svelte';

  const WINDOW_DAYS = 90;
  const RANGES = [7, 14, 30, 90, 180, 365];
  const today = todayEpochDay();
  const from = today - WINDOW_DAYS;

  let sessionsQuery = liveQuery(['wearSession'], (j) => j.wearSessions.getSessions(from, today));
  let runningQuery = liveQuery(['wearSession'], (j) => j.wearSessions.getRunningSession());
  let remindersQuery = liveQuery(['reminder'], (j) => j.reminders.getReminders());

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

  let editor = $state<Editor | null>(null);
  let deleteTarget = $state<WearSession | null>(null);

  let modeOptions = $derived(
    running
      ? [{ value: 'backfill', label: m.wear_session_mode_backfill() }]
      : [
          { value: 'live', label: m.wear_session_mode_live() },
          { value: 'backfill', label: m.wear_session_mode_backfill() }
        ]
  );

  function openNewEditor() {
    editor = {
      isRunning: false,
      startTimestamp: startOfDayTimestamp(today),
      mode: running ? 'backfill' : 'live',
      day: dateInputValueFromEpochDay(today),
      durationHours: '',
      note: '',
      reminderEnabled: false,
      reminderHours: ''
    };
  }

  function openEditor(session: WearSession) {
    const isRunning = session.durationMs === null;
    const reminder = reminderFor(session.id);
    editor = {
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
  }

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

  async function saveEditor() {
    if (!editor || !editorCanSave) return;
    const note = editor.note.trim() || null;
    const reminderHoursAfterStart = reminderHoursOf(editor);

    if (editor.mode === 'live' && !editor.id) {
      await journal.wearSessions.upsertSession({
        startTimestamp: Date.now(),
        durationMs: null,
        note,
        reminderHoursAfterStart,
        reminderTitle: m.wear_log()
      });
      editor = null;
      return;
    }

    const newDay = epochDayFromDateInputValue(editor.day) ?? today;
    await journal.wearSessions.upsertSession({
      id: editor.id,
      startTimestamp: shiftStartToDay(editor.startTimestamp, newDay),
      durationMs: Math.round(parseFloat(editor.durationHours) * 3600000),
      note,
      reminderHoursAfterStart,
      reminderTitle: m.wear_log()
    });
    editor = null;
  }

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
    editor = null;
  }

  function askToDelete() {
    if (!editor?.id) return;
    deleteTarget = sessions.find((s) => s.id === editor!.id) ?? (running?.id === editor!.id ? running : null);
    if (deleteTarget) editor = null;
  }

  async function deleteEditorTarget() {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    deleteTarget = null;
    await journal.wearSessions.deleteSession(id);
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

  let wearTrendQuery = liveQuery(['wearSession'], (j) => j.stats.wearTimeTrend(trendFrom, today));
  let regionTrendQuery = liveQuery(['entry'], (j) => j.stats.bodyRegionTrend(trendRegion, trendFrom, today));
  let wearTrend = $derived(wearTrendQuery.value ?? []);
  let regionTrend = $derived(regionTrendQuery.value ?? []);
  let wearMax = $derived(Math.max(4, 1, ...wearTrend.map((p) => Math.ceil(p.value))));
  let trendRegionLabel = $derived(trendRegionOptions.find((r) => r.value === trendRegion)?.label ?? '');
</script>

<div class="screen">
  <header class="screen-header">
    <a class="icon-btn" href="/settings" aria-label={m.back()}><Icon name="arrowLeft" /></a>
    <h1 class="screen-title">{m.wear_log()}</h1>
    <div class="header-action">
      <button class="icon-btn" data-add aria-label={m.wear_session_add_aria()} onclick={openNewEditor}>
        <Icon name="plus" size={22} />
      </button>
    </div>
  </header>
  <p class="muted small" style="margin-bottom:var(--space-4)">{m.wear_log_intro()}</p>

  {#if loading}
    <Skeleton variant="block" count={1} />
  {:else}
    {#if running}
      <button
        class="list-row wear-running-row"
        data-wear-running
        aria-label={m.wear_session_row_running_aria({ time: fmtTime(running.startTimestamp) })}
        onclick={() => openEditor(running)}
      >
        <span class="row-text">
          <span class="row-title">{m.wear_session_running_card_title()}</span>
          <span class="row-subtitle">{m.wear_session_running_since({ time: fmtTime(running.startTimestamp) })}</span>
          {#if runningElapsed}
            <span class="row-subtitle">
              {m.wear_session_duration_hm({ hours: String(runningElapsed.hours), minutes: String(runningElapsed.minutes) })}
            </span>
          {/if}
        </span>
        <Icon name="stop" size={18} />
      </button>
    {/if}

    {#if completed.length}
      <div class="list-group" style="margin-top:var(--space-3)">
        {#each completed as session (session.id)}
          {@const parts = hoursMinutesOf(session.durationMs ?? 0)}
          <button
            class="list-row"
            data-wear-session={session.id}
            aria-label={m.wear_session_row_aria({ date: fmtDayLong(epochDayFromTimestamp(session.startTimestamp)) })}
            onclick={() => openEditor(session)}
          >
            <span class="row-text">
              <span class="row-title">{m.wear_session_duration_hm({ hours: String(parts.hours), minutes: String(parts.minutes) })}</span>
              <span class="row-subtitle">{fmtDayLong(epochDayFromTimestamp(session.startTimestamp))}</span>
              {#if session.note}<span class="row-subtitle">{session.note}</span>{/if}
            </span>
            <Icon name="pencil" size={18} />
          </button>
        {/each}
      </div>
    {:else if !running}
      <EmptyState title={m.wear_session_empty_title()} text={m.wear_session_empty_body()}>
        {#snippet action()}
          <button class="btn btn-soft" onclick={openNewEditor}><span>{m.wear_session_empty_action()}</span></button>
        {/snippet}
      </EmptyState>
    {/if}

    <h2 class="section-title" style="margin-top:var(--space-5)">{m.wear_session_trend_title()}</h2>
    {#if trendRegionOptions.length}
      <Segmented name={m.wear_session_trend_region_group()} options={trendRegionOptions} value={trendRegion} onChange={(v) => (trendRegion = v)} />
    {/if}
    <div class="segmented" role="radiogroup" aria-label={m.stats_range_group()} style="margin:var(--space-4) 0">
      {#each RANGES as r (r)}
        <button class="segment" class:is-active={r === range} role="radio" aria-checked={r === range} onclick={() => (range = r)}>
          {m.range_days({ days: String(r) })}
        </button>
      {/each}
    </div>
    <div class="card chart-card">
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
    </div>
  {/if}

  <Sheet
    open={editor !== null}
    title={editor?.isRunning ? m.wear_session_running_sheet() : editor?.id ? m.wear_session_edit_sheet() : m.wear_session_new_sheet()}
    onClose={() => (editor = null)}
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
      {/if}

      <div class="stack-3">
        {#if editor.isRunning}
          <button class="btn btn-primary" data-stop-wear-session onclick={stopRunning}><span>{m.wear_session_stop_action()}</span></button>
        {:else if editor.mode === 'live' && !editor.id}
          <button class="btn btn-primary" data-start-wear-session disabled={!editorCanSave} onclick={saveEditor}>
            <span>{m.wear_session_start_action()}</span>
          </button>
        {:else}
          <button class="btn btn-primary" data-save-wear-session disabled={!editorCanSave} onclick={saveEditor}>
            <span>{m.wear_session_save()}</span>
          </button>
        {/if}
        {#if editor.id}
          <button class="btn btn-ghost" data-delete-wear-session onclick={askToDelete}><span>{m.wear_session_delete()}</span></button>
        {/if}
      </div>
    {/if}
  </Sheet>

  <Sheet open={deleteTarget !== null} title={m.wear_session_delete_sheet()} onClose={() => (deleteTarget = null)}>
    {#if deleteTarget}
      <h3>{m.wear_session_delete_q({ date: fmtDayLong(epochDayFromTimestamp(deleteTarget.startTimestamp)) })}</h3>
      <p class="muted small" style="margin-bottom:var(--space-4)">{m.wear_session_delete_hint()}</p>
      <div class="stack-3">
        <button class="btn btn-danger" data-confirm-delete-wear-session onclick={deleteEditorTarget}><span>{m.wear_session_delete()}</span></button>
        <button class="btn btn-ghost" onclick={() => (deleteTarget = null)}><span>{m.keep_it()}</span></button>
      </div>
    {/if}
  </Sheet>
</div>

<style>
  .wear-running-row {
    border: 1px solid var(--accent-border, var(--border));
  }

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
