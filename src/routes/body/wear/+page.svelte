<script lang="ts">
  /* The binder/tucking wear log (phase 5 ticket 04, CONTEXT: "Wear
     session"). Two ways into the same row: tapping "Now" writes a running
     session (a null duration) immediately, and stopping it later fills the
     duration in; backfilling writes a complete row in one save. Editing an
     existing day only ever shifts the stored start by whole days
     (shiftStartToDay) - its time-of-day is never re-typed, so a session
     that was started live keeps its real hour even if its day is corrected
     later, and a backfilled one stays anchored at local midnight. */
  import { undoable } from '$lib/stores/deleteUndo';
  import { dayRangeOptions } from '$lib/components/dayRangeOptions';
  import ReadReserve from '$lib/components/kit/ReadReserve.svelte';
  import { readReserve, rememberReserve } from '$lib/data/homeReserve';
  import { m } from '$lib/paraglide/messages';
  import DatePicker from '$lib/components/DatePicker.svelte';
  import { journal, liveList, liveQuery } from '$lib/data/live/journal.svelte';
  import { writer } from '$lib/stores/attempt.svelte';
  import { toast } from '$lib/stores/toasts.svelte';
  import { fmtDay, fmtTime } from '$lib/data/dates';
  import {
    dateInputValueFromEpochDay,
    epochDayFromDateInputValueOrToday,
    epochDayFromTimestamp,
    startOfDayTimestamp,
    timestampAtLocalTime,
    weekdayOfEpochDay
  } from '$lib/data/epochDay';
  import { currentDay } from '$lib/stores/today.svelte';
  import {
    binderCueShowing,
    hoursMinutesOf,
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
  import type { Reminder, WearKind, WearSession } from '$lib/data/types';
  import DayStrip from '$lib/components/DayStrip.svelte';
  import { stripWindow, type DayMark } from '$lib/components/dayStrip';
  import Icon from '$lib/components/Icon.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import Segmented from '$lib/components/Segmented.svelte';
  import ChartCard from '$lib/components/kit/ChartCard.svelte';
  import ChartEmpty from '$lib/components/kit/ChartEmpty.svelte';
  import Field from '$lib/components/kit/Field.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import ListRow from '$lib/components/kit/ListRow.svelte';
  import Notice from '$lib/components/kit/Notice.svelte';
  import { recordEditor } from '$lib/components/kit/recordEditor.svelte';
  import RecordSheet from '$lib/components/kit/RecordSheet.svelte';
  import { collapse, crossfade, disclose, resize, slideMonit } from '$lib/motion/reveal';
  import { crossfadeDuration, fadeOnly } from '$lib/motion/tokens';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';
  import { isAndroid, journalTextAutocomplete } from '$lib/platform';

  /* ADR-0063 / ticket 32: the elapsed reminder can only ever fire through
     the Android bridge, so web offers no toggle and no hours field. */
  let isWeb = $derived(!isAndroid());

  /* Colour that carries a value takes role 0 (DIRECTION.md): index 0 is the
     only role guaranteed chromatic on every palette, and a two-line chart
     drawn in an achromatic band reads as disabled. The sessions take the
     stripe after it. */
  /* The strip's fill is a colour carrying a value, so it takes role 0 with
     the chart rather than the sessions' stripe (ticket 44) - index 0 is
     the only one guaranteed chromatic on every palette, and a logged day
     filled in a palette's achromatic band is a day drawn as nothing. The
     calendar states the same rule for its own three readings of a day. */
  const SECTION_ROLE = { chart: 0, strip: 0, sessions: 1 };

  import Switch from '$lib/components/Switch.svelte';
  import WearTrendChart from '$lib/components/WearTrendChart.svelte';
  import AreaFinish from '$lib/components/AreaFinish.svelte';

  const WINDOW_DAYS = 90;
  const RANGES = [7, 14, 30, 90, 180, 365];
  const today = $derived(currentDay());
  const from = $derived(today - WINDOW_DAYS);

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

  let completed = $derived(sessions.filter((s) => s.durationMs !== null));

  /* The log is a week at a time now (phase 10 redesign ticket 44), drawn
     as a strip with the running session under it at full size - the same
     treatment dilation takes, and for the same reason. Ninety days of wear
     rows captured this screen at 2794px on a demo build with every feature
     filled, most of it a list saying which days had one.

     A day here is `logged` or nothing. There is no `expected`: nothing
     schedules a wear session, so a day with none is a day with none and
     never a day something was missed on (ADR-0012, and the streak this app
     removed on purpose). */
  let dayOf = (session: WearSession) => epochDayFromTimestamp(session.startTimestamp);
  let sessionsByDay = $derived.by(() => {
    const byDay = new Map<number, WearSession[]>();
    for (const s of completed) {
      const day = dayOf(s);
      byDay.set(day, [...(byDay.get(day) ?? []), s]);
    }
    return byDay;
  });
  let markOf = $derived(
    (epochDay: number): DayMark =>
      sessionsByDay.has(epochDay) || (running !== null && dayOf(running) === epochDay) ? 'logged' : 'off'
  );

  /** How long a day's sessions came to, which is what the cell says when a
      screen reader reaches it - a reading of that day, not a score of it. */
  const dayTotal = (epochDay: number) => {
    const onDay = sessionsByDay.get(epochDay) ?? [];
    if (onDay.length === 0) return null;
    const parts = hoursMinutesOf(onDay.reduce((sum, s) => sum + (s.durationMs ?? 0), 0));
    return m.wear_session_duration_hm({ hours: String(parts.hours), minutes: String(parts.minutes) });
  };

  /* Where paging back stops: the earliest session in the window the query
     reads, never before it, so a page can never be one this screen has no
     rows for. */
  let earliest = $derived(
    completed.length === 0 && !running
      ? null
      : Math.max(from, Math.min(...[...completed.map(dayOf), ...(running ? [dayOf(running)] : [])]))
  );

  /* What a cell says on the day a session is still running: it has no
     duration yet, so the total is null and "nothing logged" would be a
     lie about the one day something is happening on. */
  let runningWords = $derived(running ? wearRunningCardTitle(running.kind) : m.adherence_nothing_logged());

  let weeksBack = $state(0);
  let shownWeek = $derived(stripWindow(today, weeksBack));
  /* Newest first, and today's completed sessions included: the block above
     these is the running timer, which is a different record from any of
     them. */
  let weekSessions = $derived(
    completed.filter((s) => dayOf(s) >= shownWeek.first && dayOf(s) <= shownWeek.last).reverse()
  );

  /** A tap on a day of the strip: its first session if it has one, or a
      backfill draft anchored to that day's local midnight if it has none -
      the same two ways in the add control already offers, pointed at one
      day.

      Today is the exception, and it is the row under the strip that
      decides it: a blank draft, which opens live when nothing is running
      and as a backfill when something is. Without this, tapping today's
      cell and tapping the row directly below it - the same day, on the
      same screen - opened the sheet in two different modes. */
  function openSessionFor(epochDay: number) {
    const existing = sessionsByDay.get(epochDay)?.[0];
    if (existing) {
      record.openEditor(existing);
      return;
    }
    if (epochDay === today) {
      record.openEditor(null);
      return;
    }
    record.editor = {
      kind: latestKind,
      isRunning: false,
      startTimestamp: startOfDayTimestamp(epochDay),
      mode: 'backfill',
      day: dateInputValueFromEpochDay(epochDay),
      durationHours: null,
      note: '',
      reminderEnabled: false,
      reminderHours: null
    };
  }

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
    /* Both hour fields hold the number their input parsed, or null while
       it holds nothing parseable. Bound as strings, they were rewritten
       under the caret on every key (last-audit UI 01). */
    durationHours: number | null;
    note: string;
    reminderEnabled: boolean;
    reminderHours: number | null;
  };

  const record = recordEditor<WearSession, Editor>({
    blank: () => ({
      kind: latestKind,
      isRunning: false,
      startTimestamp: startOfDayTimestamp(today),
      mode: running ? 'backfill' : 'live',
      day: dateInputValueFromEpochDay(today),
      durationHours: null,
      note: '',
      reminderEnabled: false,
      reminderHours: null
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
        durationHours: session.durationMs !== null ? session.durationMs / 3600000 : null,
        note: session.note ?? '',
        reminderEnabled: reminder !== null,
        reminderHours: reminder ? hoursAfterStart(session.startTimestamp, reminder) : null
      };
    },
    async upsert(draft) {
      /* A running session's only save is Stop, which fills the duration in.
         It goes through here, so the sheet's own busy state and leave guard
         cover it like any other save (after-release 06). */
      if (draft.isRunning) {
        await journal.wearSessions.upsertSession({
          id: draft.id,
          kind: draft.kind,
          startTimestamp: draft.startTimestamp,
          durationMs: Date.now() - draft.startTimestamp,
          note: draft.note.trim() || null,
          reminderHoursAfterStart: reminderHoursOf(draft),
          reminderTitle: wearReminderTitle(draft.kind)
        });
        return;
      }
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
        durationMs: Math.round(Number(draft.durationHours) * 3600000),
        note,
        reminderHoursAfterStart,
        reminderTitle: wearReminderTitle(draft.kind)
      });
    },
    saved: (draft) => (draft.isRunning ? m.wear_session_stopped() : m.saved()),
    remove: (id) => undoable((j) => j.wearSessions.deleteSession(id)),
    findById: (id) => sessions.find((s) => s.id === id) ?? (running?.id === id ? running : undefined)
  });

  /* Stop on the running row itself, worded as Home's wear tile words it
     (after-release 28, audit UI-08: a bare square here, a labelled Stop
     there). The same write the tile makes, then the same confirmation the
     sheet's Stop gives. */
  const cardIn = (_node: Element) => fadeOnly(crossfadeDuration());
  const stopper = writer();
  async function stopRunning() {
    const session = running;
    if (!session) return;
    const stopped = await stopper.run(
      () =>
        journal.wearSessions.upsertSession({
          id: session.id,
          kind: session.kind,
          startTimestamp: session.startTimestamp,
          durationMs: Date.now() - session.startTimestamp,
          note: session.note
        }),
      m.write_failed()
    );
    if (stopped) toast(m.wear_session_stopped(), { kind: 'record-saved' });
  }

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
    if (!isWeb && draft.reminderEnabled && !Number.isFinite(draft.reminderHours)) return false;
    if (draft.isRunning) return true;
    if (draft.mode === 'live' && !draft.id) return true;
    const hours = draft.durationHours;
    return hours !== null && Number.isFinite(hours) && hours > 0;
  }

  /* undefined leaves an existing reminder row untouched; null deletes it
     (wearSessions.reconcileReminder). Web has no way to change the
     reminder, so it must always send undefined - never re-derive null from
     an editor.reminderEnabled that a hidden toggle left at its prefilled
     value (ticket 32). Stop is the one save canSave does not gate, so an
     enabled reminder whose hours were cleared also sends undefined there:
     the reminder already set stays, rather than being deleted with the
     toggle still on. */
  const reminderHoursOf = (editor: Editor): number | null | undefined =>
    isWeb ? undefined : editor.reminderEnabled ? (editor.reminderHours ?? undefined) : null;


  const fmtDayLong = (epochDay: number) => fmtDay(epochDay, { day: 'numeric', month: 'long', year: 'numeric' });

  let range = $state(30);
  let trendFrom = $derived(today - range + 1);
  let fromWeek = $derived(trendFrom - weekdayOfEpochDay(trendFrom));
  let toWeek = $derived(today - weekdayOfEpochDay(today));
  let wearTrendQuery = liveList((j) => j.stats.weeklyWearHours(trendFrom, today, nowTick));
  let wearTrend = $derived(wearTrendQuery.rows.map((point) => ({
    ...point,
    label: m.wear_week_hours({
      date: fmtDay(point.weekStart, { day: 'numeric', month: 'short' }),
      hours: String(Math.round(point.hours * 10) / 10)
    })
  })));
  let fromWeekLabel = $derived(fmtDay(fromWeek, { day: 'numeric', month: 'short' }));
  let toWeekLabel = $derived(fmtDay(toWeek, { day: 'numeric', month: 'short' }));

  /* Latched: a reserve must not put its placeholder back (ux-carpet ticket 205). */
  let wearRevealed = $state(false);
  $effect.pre(() => {
    if (!wearRevealed && (!loading)) wearRevealed = true;
  });
  const wearEstimate = readReserve('wear');
  const wearRemember = (px: number) => rememberReserve('wear', px);
</script>

<div class="screen">
  <ScreenHeader title={m.wear_log()} back="/more" subtitle={m.wear_log_intro()}>
    {#snippet actions()}
      <button class="icon-btn press" data-add aria-label={wearAddAria(latestKind)} onclick={() => record.openEditor(null)}>
        <Icon name="plus" size={22} />
      </button>
    {/snippet}
  </ScreenHeader>

  <!-- Held at last visit's height until the reads answer, then faded in (ux-carpet ticket 205): a page-level skeleton swap cut this in at full opacity. -->
  <ReadReserve ready={wearRevealed} estimate={wearEstimate} onrest={wearRemember}>
      <!-- What is true now, before what was true before (rule 16): the week
           as a strip, and the session that is actually running under it. -->
      {#if earliest !== null}
        <DayStrip
          {today}
          markOf={(day) => markOf(day)}
          labelOf={(day, mark) =>
            m.strip_day_state({
              day: fmtDayLong(day),
              state: dayTotal(day) ?? (mark === 'logged' ? runningWords : m.adherence_nothing_logged())
            })}
          {earliest}
          onPick={openSessionFor}
          role={roleAt(activeFlag.roles, SECTION_ROLE.strip)}
          bind:weeksBack
        />
      {/if}

      <!-- Stopping from the row (or starting from the sheet) swaps one card
           for the other in place: the old one fades out of flow over the new
           one fading in, so neither is painted at full strength in a frame
           the other still owns, and the wrapper travels the difference in
           height (a running card with its cue line is taller than Today). -->
      <div class="wear-now" use:resize>
      {#if running}
        <div in:cardIn out:crossfade>
        <ListCard role={roleAt(activeFlag.roles, SECTION_ROLE.sessions)}>
          <ListRow
            key="running"
            data-wear-running
            icon="watch"
            title={wearRunningCardTitle(running.kind)}
            subtitle={runningElapsed
              ? `${m.wear_session_running_since({ time: fmtTime(running.startTimestamp) })} · ${m.wear_session_duration_hm({ hours: String(runningElapsed.hours), minutes: String(runningElapsed.minutes) })}`
              : m.wear_session_running_since({ time: fmtTime(running.startTimestamp) })}
            chevron={false}
            onclick={() => record.openEditor(running)}
            action={{
              text: m.wear_session_stop_action(),
              label: m.wear_session_stop_action(),
              onclick: () => stopRunning(),
              attrs: { 'data-wear-stop': '' }
            }}
          />
          <!-- The cue (ADR-0064). A line inside the card the running row
               already sits in, rather than anything that interrupts: the
               row keeps its stop control, and nothing about Stop or Save
               changes when this appears. -->
          {#if showCue}
            <p class="muted small wear-cue" data-wear-duration-cue transition:disclose>{m.wear_session_cue()}</p>
          {/if}
        </ListCard>
        </div>
      {:else if earliest !== null}
        <!-- Nothing running, so what is true now is what today came to. -->
        <div in:cardIn out:crossfade>
        <ListCard role={roleAt(activeFlag.roles, SECTION_ROLE.sessions)}>
          <ListRow
            key="wear-today"
            data-wear-today
            icon="watch"
            title={m.today()}
            subtitle={fmtDayLong(today)}
            onclick={() => openSessionFor(today)}
          >
            {#snippet trailing()}
              {dayTotal(today) ?? m.adherence_nothing_logged()}
            {/snippet}
          </ListRow>
        </ListCard>
        </div>
      {/if}
      </div>

      {#if earliest === null && !running}
        <Notice
          icon="watch"
          key="wear-empty"
          role={roleAt(activeFlag.roles, SECTION_ROLE.sessions)}
          title={m.wear_session_empty_title()}
          text={m.wear_session_empty_body()}
          action={{ label: m.wear_session_empty_action(), primary: true, onclick: () => record.openEditor(null) }}
        />
      {:else}
        {#if weekSessions.length === 0}
          <!-- Its own words rather than a day's answer stretched over
               seven, the same line dilation's empty week carries. -->
          <p class="muted small" data-strip-week-empty>{m.strip_week_nothing()}</p>
        {:else}
          <ListCard role={roleAt(activeFlag.roles, SECTION_ROLE.sessions)}>
            <!-- A session joins the list when it is stopped, now in place from
                 the running row rather than under a sheet, so it opens its own
                 height instead of pushing the rows under it in one frame. -->
            {#each weekSessions as session (session.id)}
              {@const parts = hoursMinutesOf(session.durationMs ?? 0)}
              <div class="rows-divide" transition:collapse>
              <ListRow
                key={session.id}
                data-wear-session={session.id}
                icon="watch"
                title={`${wearKindLabel(session.kind)} · ${m.wear_session_duration_hm({ hours: String(parts.hours), minutes: String(parts.minutes) })}`}
                subtitle={session.note
                  ? `${fmtDayLong(dayOf(session))} · ${session.note}`
                  : fmtDayLong(dayOf(session))}
                chevron={false}
                onclick={() => record.openEditor(session)}
              />
              </div>
            {/each}
          </ListCard>
        {/if}
      {/if}

      <Segmented
        name={m.stats_range_group()}
        options={dayRangeOptions(RANGES)}
        value={String(range)}
        onChange={(v) => (range = Number(v))}
        compact
        key="wear-range"
      />
      <ChartCard level={2}
        heading={m.wear_session_trend_title()}
        kind="wear-trend"
        role={roleAt(activeFlag.roles, SECTION_ROLE.chart)}
      >
        {#if wearTrend.length}
          <div transition:slideMonit>
            <WearTrendChart
              points={wearTrend}
              {fromWeek}
              {toWeek}
              firstLabel={fromWeekLabel}
              lastLabel={toWeekLabel}
              ariaLabel={m.wear_session_trend_title()}
            />
          </div>
        {:else}
          <ChartEmpty>{m.not_enough_data()}</ChartEmpty>
        {/if}
      </ChartCard>

      <ListCard>
        <div class="kit-row" data-wear-cue-switch>
          <span class="kit-row-text">
            <span class="kit-row-title">{m.wear_duration_cue_toggle()}</span>
            <span class="kit-row-sub">{m.wear_duration_cue_sub()}</span>
          </span>
          <span class="kit-row-trail">
            <Switch
              checked={prefs.wearDurationCueEnabled}
              label={m.wear_duration_cue_toggle()}
              onChange={(v) => { prefs.wearDurationCueEnabled = v; }}
            />
          </span>
        </div>
      </ListCard>

    <!-- Saying you are done with this area (phase 8 features ticket 04). -->
    <AreaFinish group="wear" />
  </ReadReserve>

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
                  step="any"
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
          <textarea autocomplete={journalTextAutocomplete()} class="input" {id} name="wear-note" placeholder={m.wear_session_note_placeholder()} bind:value={editor.note}
          ></textarea>
        {/snippet}
      </Field>

      <!-- The facts (ticket 50 section 4). Always here, for every kind, and
           never gated by the duration cue's toggle: these are about method
           rather than duration, and each block names its source. -->
      <!-- One slot that travels between the three sets rather than snapping
           to a new height, the same pairing the range control above uses:
           `resize` on the box, `crossfade` on the block leaving it. -->
      <div use:resize>
        {#key editor.kind}
          {@const safety = wearSafetyFacts(editor.kind)}
          <div class="wear-facts" data-wear-facts={editor.kind} out:crossfade>
            <p class="wear-facts-title">{m.wear_facts_title()}</p>
            <ul class="muted small wear-facts-list">
              {#each safety.facts as fact (fact.text)}
                <li>{fact.text}</li>
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
                  step="any"
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
        <button class="btn btn-primary" data-stop-wear-session onclick={record.save}>
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
  /* Always mounted, so a first session growing it from nothing and a last
     one taking it away both travel. The block gap under the card is the
     card's own padding rather than the wrapper's margin, so it is part of
     the height `resize` travels and leaves with the card instead of
     snapping when the wrapper empties. */
  .wear-now {
    margin-bottom: 0;
  }
  .wear-now > div {
    padding-bottom: var(--space-5);
  }
</style>
