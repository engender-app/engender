<script lang="ts">
  /* Dilation: a taper typed in, its session log, and the chart against day
     since surgery (phase 8 features ticket 12, CONTEXT: "Taper").

     Two records, one screen, the same split doses.ts draws between a
     schedule and what was actually logged against it. The schedule is
     edited inline rather than through a RecordSheet - there is one of it,
     never a list to pick from - while sessions use the ordinary
     recordEditor/RecordSheet pair the rest of the kit's logs do.

     Expected-but-not-logged renders as a gap, copying doses/+page.svelte's
     adherence rows exactly (ADR-0010): a static row naming the day, and
     either what was logged or `adherence_nothing_logged`, reused from the
     dose log's own row rather than a synonym key for the same words - no
     count,
     no streak, no colour. Tapping a gap opens the session sheet for that
     day; tapping a logged row edits it.

     Phase 10 redesign ticket 44 kept that row and cut how many of them
     there are. `expectedSessionDays` puts a session on nearly every day of
     a taper that runs months, and one 60px row each captured this screen
     at 4505px on a demo build with every feature filled - the arithmetic
     was wrong, not the copy. The app had already made the same argument
     about the calendar: `DAY_AHEAD_OPT_OUTS` refuses this schedule a mark
     because an expected session on nearly every day is not information.

     So the screen opens on a week as a strip with today under it at full
     size (DIRECTION.md rule 16), and the gap rows run under that for the
     week the strip is showing, today excepted because it is already drawn
     above them. Tapping a cell opens the same sheet tapping a gap row
     opens, so the write path is the one that was already here. */
  import { m } from '$lib/paraglide/messages';
  import DatePicker from '$lib/components/DatePicker.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import AreaFinish from '$lib/components/AreaFinish.svelte';
  import DayStrip from '$lib/components/DayStrip.svelte';
  import { stripWindow, type DayMark } from '$lib/components/dayStrip';
  import AreaChart from '$lib/components/kit/AreaChart.svelte';
  import ChartCard from '$lib/components/kit/ChartCard.svelte';
  import ChartEmpty from '$lib/components/kit/ChartEmpty.svelte';
  import Field from '$lib/components/kit/Field.svelte';
  import FieldGroupHeading from '$lib/components/kit/FieldGroupHeading.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import ListRow from '$lib/components/kit/ListRow.svelte';
  import Notice from '$lib/components/kit/Notice.svelte';
  import { recordEditor } from '$lib/components/kit/recordEditor.svelte';
  import RecordSheet from '$lib/components/kit/RecordSheet.svelte';
  import SectionHeading from '$lib/components/kit/SectionHeading.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';
  import { journal, liveList, liveQuery } from '$lib/data/live/journal.svelte';
  import { plotDaySeriesGroup } from '$lib/charts/dayAxis';
  import { dayAxisEnds, dayAxisScrubLabel } from '$lib/components/kit/dayAxisLabel';
  import { fmtDay } from '$lib/data/dates';
  import { dateInputValueFromEpochDay, epochDayFromDateInputValueOrToday, todayEpochDay } from '$lib/data/epochDay';
  import { expectedSessionDays } from '$lib/data/taperSchedule';
  import type { TaperSession } from '$lib/data/types';
  import { crossfade } from '$lib/motion/reveal';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';

  /* `chart` takes 0, the only index guaranteed to be a colour on every
     palette (roles.ts) - the data line must never land on trans' achromatic
     middle stripe the way index 2 would. */
  const SECTION_ROLE = { chart: 0, strip: 0, schedule: 1, sessions: 2 };

  /* The strip's fill is a colour carrying a value, so it takes role 0 with
     the chart rather than the sessions' own stripe (ticket 44). Index 2 is
     trans' achromatic middle band, and a logged day filled in white on a
     near-white page is a day drawn as nothing - the same rule the calendar
     states for its own three readings of a day. */

  const dayLong = (epochDay: number) => fmtDay(epochDay, { day: 'numeric', month: 'long', year: 'numeric' });
  const today = todayEpochDay();

  let taperQuery = liveQuery((j) => j.taper.getTaper());
  let taper = $derived(taperQuery.value ?? null);

  let sessionsQuery = liveList((j) => j.taper.getSessions());
  let sessions = $derived(sessionsQuery.rows);

  let sessionsByDay = $derived(new Map(sessions.map((s) => [s.epochDay, s])));
  let expectedDays = $derived(taper ? expectedSessionDays(taper, today) : []);

  /** One point per day a session was logged, value the count that day - so
      a rare double session shows rather than collapsing into the same "a
      session happened" as a single one. Days with none are absent rather
      than zero: an average over a folded range should read from the days
      that did have a session, not be pulled down by the empty ones
      `expectedDays` already renders as gaps elsewhere on this screen. */
  let sessionSeries = $derived.by(() => {
    const perDay = new Map<number, number>();
    for (const s of sessions) perDay.set(s.epochDay, (perDay.get(s.epochDay) ?? 0) + 1);
    return [...perDay].map(([day, value]) => ({ day, value, count: 1 }));
  });

  /* Folded through the same mechanism the other re-keyed charts use
     (dayAxis.ts, ticket 16), rather than one raw point per day: a taper
     runs for months, and a card sized for thirty marks should not be asked
     to draw two hundred. */
  let plot = $derived(
    taper
      ? plotDaySeriesGroup(
          [sessionSeries],
          { type: 'anchored', anchorEpochDay: taper.surgeryEpochDay, todayEpochDay: today },
          Math.max(1, today - taper.surgeryEpochDay + 1)
        )[0]
      : undefined
  );
  let chartMax = $derived(Math.max(1, ...(plot?.points.map((p) => p.y) ?? [])));

  /* The schedule editor. Inline rather than a RecordSheet: there is one
     taper, never a list, so there is nothing here for a sheet's own
     new/edit/delete triple to distinguish. */
  let editingSchedule = $state(false);
  let surgeryDayInput = $state(dateInputValueFromEpochDay(today));
  let startDayInput = $state(dateInputValueFromEpochDay(today));
  let stagesInput = $state<{ everyNDays: string; days: string }[]>([]);

  function openScheduleEditor() {
    surgeryDayInput = dateInputValueFromEpochDay(taper?.surgeryEpochDay ?? today);
    startDayInput = dateInputValueFromEpochDay(taper?.startEpochDay ?? today);
    stagesInput = (taper?.stages ?? []).map((s) => ({ everyNDays: String(s.everyNDays), days: String(s.days) }));
    if (stagesInput.length === 0) stagesInput = [{ everyNDays: '', days: '' }];
    editingSchedule = true;
  }

  function addStage() {
    stagesInput = [...stagesInput, { everyNDays: '', days: '' }];
  }

  function removeStage(index: number) {
    stagesInput = stagesInput.filter((_, i) => i !== index);
  }

  /* A frequency of 0 is a real stage - a rest stretch a surgeon writes into
     the plan, expecting nothing for its days (taperSchedule.ts) - so this
     only rules out a negative or blank one, never zero. */
  let scheduleCanSave = $derived(
    stagesInput.length > 0 && stagesInput.every((s) => Number(s.everyNDays) >= 0 && s.everyNDays !== '' && Number(s.days) > 0)
  );

  async function saveSchedule() {
    if (!scheduleCanSave) return;
    await journal.taper.upsertTaper({
      id: taper?.id,
      surgeryEpochDay: epochDayFromDateInputValueOrToday(surgeryDayInput),
      startEpochDay: epochDayFromDateInputValueOrToday(startDayInput),
      stages: stagesInput.map((s) => ({ everyNDays: Number(s.everyNDays), days: Number(s.days) }))
    });
    editingSchedule = false;
  }

  /* The session log. An ordinary recordEditor/RecordSheet pair, the same
     shape body/sizes/+page.svelte uses. */
  const session = recordEditor<TaperSession, { id?: string; date: string; note: string }>({
    blank: () => ({ date: dateInputValueFromEpochDay(today), note: '' }),
    fromRecord: (r) => ({ id: r.id, date: dateInputValueFromEpochDay(r.epochDay), note: r.note }),
    async upsert(draft) {
      await journal.taper.upsertSession({
        id: draft.id,
        epochDay: epochDayFromDateInputValueOrToday(draft.date),
        note: draft.note
      });
    },
    remove: (id) => journal.taper.deleteSession(id),
    findById: (id) => sessions.find((s) => s.id === id)
  });

  /* What the strip and the rows both read a day off (ticket 44). One
     answer for the two surfaces, so a cell and the row under it can never
     disagree about the same day. */
  let expectedSet = $derived(new Set(expectedDays));
  let markOf = $derived(
    (epochDay: number): DayMark =>
      sessionsByDay.has(epochDay) ? 'logged' : expectedSet.has(epochDay) ? 'expected' : 'off'
  );
  const stateWords = (mark: DayMark) =>
    mark === 'logged'
      ? m.dilation_session_logged()
      : mark === 'expected'
        ? m.adherence_nothing_logged()
        : m.dilation_nothing_expected();

  /* Which week the strip is showing, bound out of it so the rows below
     list that same week rather than a second one of their own. */
  let weeksBack = $state(0);
  let shownWeek = $derived(stripWindow(today, weeksBack));

  /* The week's gap rows, newest first, today left out - it is drawn above
     these at full size and a row for it here would be the same day twice.
     A day the schedule expected nothing on says nothing, which is the
     whole reason this is a week of rows and not a week of days. */
  let weekRows = $derived(
    Array.from({ length: shownWeek.last - shownWeek.first + 1 }, (_, i) => shownWeek.first + i)
      .filter((epochDay) => epochDay !== today && markOf(epochDay) !== 'off')
      .reverse()
  );

  let todayMark = $derived(markOf(today));

  /** A tap on any row in the expected-sessions list: the day's own session
      if one is logged, or a blank draft for that day if none is. */
  function openSessionFor(epochDay: number) {
    const existing = sessionsByDay.get(epochDay);
    if (existing) session.openEditor(existing);
    else session.editor = { date: dateInputValueFromEpochDay(epochDay), note: '' };
  }
</script>

<div class="screen">
  <ScreenHeader title={m.dilation()} back="/health/surgery" subtitle={m.dilation_intro()}>
    {#snippet actions()}
      {#if taper}
        <button
          class="icon-btn press"
          data-add-session
          aria-label={m.dilation_session_add_aria()}
          onclick={() => session.openEditor(null)}
        >
          <Icon name="plus" size={22} />
        </button>
      {/if}
    {/snippet}
  </ScreenHeader>

  {#if taperQuery.loading}
    <div class="screen-part" out:crossfade>
      <Skeleton variant="line" count={3} />
    </div>
  {:else if !taper && !editingSchedule}
    <div class="screen-part">
      <Notice
        icon="flask"
        key="dilation-schedule-empty"
        role={roleAt(activeFlag.roles, SECTION_ROLE.schedule)}
        title={m.dilation_schedule_empty_title()}
        text={m.dilation_schedule_empty_body()}
        action={{ label: m.dilation_schedule_empty_action(), primary: true, onclick: openScheduleEditor }}
      />
    </div>
  {:else if editingSchedule}
    <div class="screen-part">
      <SectionHeading text={m.dilation_schedule_heading()} />
      <Field label={m.dilation_surgery_day_label()} id="dilation-surgery-day">
        {#snippet children(id)}
          <DatePicker name="dilation-surgery-day" bind:value={surgeryDayInput} {id} />
        {/snippet}
      </Field>
      <Field label={m.dilation_start_day_label()} id="dilation-start-day">
        {#snippet children(id)}
          <DatePicker name="dilation-start-day" bind:value={startDayInput} {id} />
        {/snippet}
      </Field>
      <p class="muted small">{m.dilation_start_day_hint()}</p>

      <FieldGroupHeading legend={m.dilation_stage_legend()} hint={m.dilation_stage_hint()} />
      <ListCard role={roleAt(activeFlag.roles, SECTION_ROLE.schedule)}>
        {#each stagesInput as stage, index (index)}
          <div class="kit-row is-static">
            <span class="kit-row-text cd-endpoints">
              <span class="field">
                <input
                  class="input"
                  type="number"
                  min="0"
                  inputmode="numeric"
                  data-stage-frequency={index}
                  aria-label={m.dilation_stage_frequency_aria()}
                  bind:value={stage.everyNDays}
                />
              </span>
              <span class="field">
                <input
                  class="input"
                  type="number"
                  min="1"
                  inputmode="numeric"
                  data-stage-duration={index}
                  aria-label={m.dilation_stage_duration_aria()}
                  bind:value={stage.days}
                />
              </span>
            </span>
            <button
              class="kit-row-act press"
              data-delete-stage={index}
              aria-label={m.dilation_stage_delete_aria({ index: index + 1 })}
              onclick={() => removeStage(index)}
            >
              <Icon name="trash" size={18} />
            </button>
          </div>
        {/each}
      </ListCard>
      <button class="btn btn-ghost press" data-add-stage onclick={addStage}>
        <span>{m.dilation_stage_add()}</span>
      </button>

      <div class="stack-3 dilation-schedule-actions">
        <button class="btn btn-primary" data-save-schedule disabled={!scheduleCanSave} onclick={saveSchedule}>
          <span>{m.dilation_schedule_save()}</span>
        </button>
        <button class="btn btn-ghost" onclick={() => (editingSchedule = false)}>
          <span>{m.cancel()}</span>
        </button>
      </div>
    </div>
  {:else if taper}
    <!-- What is true now, before what was true before (rule 16): the week
         as a strip, and today under it at full size with the way to log it
         on the row. -->
    {#if sessionsQuery.loading}
      <div class="screen-part" out:crossfade>
        <Skeleton variant="line" count={3} />
      </div>
    {:else if expectedDays.length === 0}
      <div class="screen-part">
        <Notice
          icon="flask"
          key="dilation-sessions-empty"
          role={roleAt(activeFlag.roles, SECTION_ROLE.sessions)}
          title={m.dilation_sessions_empty_title()}
          text={m.dilation_sessions_empty_body()}
        />
      </div>
    {:else}
      <div class="screen-part">
        <DayStrip
          {today}
          markOf={(day) => markOf(day)}
          labelOf={(day, mark) => m.strip_day_state({ day: dayLong(day), state: stateWords(mark) })}
          earliest={taper.startEpochDay}
          onPick={openSessionFor}
          role={roleAt(activeFlag.roles, SECTION_ROLE.strip)}
          bind:weeksBack
        />
        <ListCard role={roleAt(activeFlag.roles, SECTION_ROLE.sessions)}>
          <ListRow
            key="dilation-today"
            data-dilation-today
            title={m.today()}
            subtitle={sessionsByDay.get(today)?.note || dayLong(today)}
            onclick={() => openSessionFor(today)}
          >
            {#snippet trailing()}
              {stateWords(todayMark)}
            {/snippet}
          </ListRow>
        </ListCard>
      </div>

      <div class="screen-part">
        <SectionHeading text={m.dilation_sessions_heading()} />
        {#if weekRows.length === 0}
          <!-- Its own words rather than a day's answer stretched over
               seven: "Nothing expected" is what one cell says. -->
          <p class="muted small" data-strip-week-empty>{m.strip_week_nothing()}</p>
        {:else}
          <ListCard role={roleAt(activeFlag.roles, SECTION_ROLE.sessions)}>
            {#each weekRows as epochDay (epochDay)}
              {@const logged = sessionsByDay.get(epochDay)}
              <ListRow
                key={String(epochDay)}
                data-session-day={epochDay}
                title={dayLong(epochDay)}
                subtitle={logged?.note || undefined}
                onclick={() => openSessionFor(epochDay)}
              >
                {#snippet trailing()}
                  {#if !logged}
                    {m.adherence_nothing_logged()}
                  {:else if !logged.note}
                    {m.dilation_session_logged()}
                  {/if}
                {/snippet}
              </ListRow>
            {/each}
          </ListCard>
        {/if}
      </div>
    {/if}

    <!-- The schedule itself, under the reading of it rather than over: it
         is where the taper is edited, not what a person opens this screen
         to find out (rule 16, and the same lesson ticket 54 took on the
         roadmap - open on where you are, not on the pack's provenance). -->
    <div class="screen-part">
      <SectionHeading text={m.dilation_schedule_heading()} />
      <ListCard role={roleAt(activeFlag.roles, SECTION_ROLE.schedule)}>
        <ListRow
          key="dilation-schedule"
          data-schedule
          icon="flask"
          title={m.dilation_surgery_day_label()}
          subtitle={dayLong(taper.surgeryEpochDay)}
          aria-label={m.dilation_schedule_edit_aria()}
          onclick={openScheduleEditor}
        />
      </ListCard>
    </div>

    <ChartCard
      heading={m.dilation_chart_title()}
      kind="dilation-sessions"
      role={roleAt(activeFlag.roles, SECTION_ROLE.chart)}
    >
      {#if plot && plot.points.length > 0}
        <AreaChart
          points={plot.points}
          min={0}
          max={chartMax}
          {...dayAxisEnds(plot, plot.points[0].x, plot.points[plot.points.length - 1].x)}
          formatValue={(v) => String(Math.round(v))}
          scrubLabel={dayAxisScrubLabel(plot)}
          ariaLabel={m.dilation_chart_aria()}
        />
      {:else}
        <ChartEmpty>{m.not_enough_data()}</ChartEmpty>
      {/if}
    </ChartCard>

    <!-- Saying you are done dilating (phase 8 features ticket 04, ADR-0052) -
         the finish control lives on `taperSessions`, never on the schedule:
         a taper ending is the normal outcome this ticket exists to name. -->
    <AreaFinish group="dilation" />
  {/if}

  <RecordSheet
    record={session}
    handle="dilation-session"
    newTitle={m.dilation_session_new_sheet()}
    editTitle={m.dilation_session_edit_sheet()}
    saveLabel={m.dilation_session_save()}
    deleteLabel={m.dilation_session_delete()}
    canSave={() => true}
    confirm={{
      title: m.dilation_session_delete_sheet(),
      question: (r) => m.dilation_session_delete_q({ date: dayLong(r.epochDay) }),
      hint: () => m.dilation_session_delete_hint(),
      confirmLabel: m.dilation_session_delete(),
      cancelLabel: m.keep_it()
    }}
  >
    {#snippet fields(editor)}
      <Field label={m.dilation_session_date_label()} id="dilation-session-date">
        {#snippet children(id)}
          <DatePicker name="dilation-session-date" max={dateInputValueFromEpochDay(today)} bind:value={editor.date} {id} />
        {/snippet}
      </Field>
      <Field label={m.dilation_session_note_label()} id="dilation-session-note">
        {#snippet children(id)}
          <input
            class="input"
            {id}
            name="dilation-session-note"
            placeholder={m.dilation_session_note_placeholder()}
            bind:value={editor.note}
          />
        {/snippet}
      </Field>
    {/snippet}
  </RecordSheet>
</div>

<style>
  .dilation-schedule-actions {
    margin-top: var(--space-4);
  }
</style>
