<script lang="ts">
  /* Dilation: a taper typed in and its session log (phase 8 features
     ticket 12, CONTEXT: "Taper").

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
     opens, so the write path is the one that was already here.

     The chart ("Sessions since surgery") is gone (audit item 7): sessions
     since surgery is a count on nearly every day, a flat line at 1 for
     months, and the strip plus today's own row already say everything it
     said. */
  import { m } from '$lib/paraglide/messages';
  import DatePicker from '$lib/components/DatePicker.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import AreaFinish from '$lib/components/AreaFinish.svelte';
  import DayStrip from '$lib/components/DayStrip.svelte';
  import { stripWindow, type DayMark } from '$lib/components/dayStrip';
  import Field from '$lib/components/kit/Field.svelte';
  import FieldGroupHeading from '$lib/components/kit/FieldGroupHeading.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import ListRow from '$lib/components/kit/ListRow.svelte';
  import Notice from '$lib/components/kit/Notice.svelte';
  import Segmented from '$lib/components/Segmented.svelte';
  import { recordEditor } from '$lib/components/kit/recordEditor.svelte';
  import RecordSheet from '$lib/components/kit/RecordSheet.svelte';
  import SectionHeading from '$lib/components/kit/SectionHeading.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';
  import { journal, liveList, liveQuery } from '$lib/data/live/journal.svelte';
  import { fmtDay } from '$lib/data/dates';
  import { dateInputValueFromEpochDay, epochDayFromDateInputValueOrToday, todayEpochDay } from '$lib/data/epochDay';
  import { dilationEligible, expectedSessionDays } from '$lib/data/taperSchedule';
  import type { TaperSession } from '$lib/data/types';
  import { crossfade } from '$lib/motion/reveal';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';

  /* The strip's fill is a colour carrying a value, so it takes role 0
     (roles.ts) rather than the sessions' own stripe (ticket 44). Index 2 is
     trans' achromatic middle band, and a logged day filled in white on a
     near-white page is a day drawn as nothing - the same rule the calendar
     states for its own three readings of a day. */
  const SECTION_ROLE = { strip: 0, schedule: 1, sessions: 2 };

  const dayLong = (epochDay: number) => fmtDay(epochDay, { day: 'numeric', month: 'long', year: 'numeric' });
  const today = todayEpochDay();

  let taperQuery = liveQuery((j) => j.taper.getTaper());
  let taper = $derived(taperQuery.value ?? null);

  let sessionsQuery = liveList((j) => j.taper.getSessions());
  let sessions = $derived(sessionsQuery.rows);

  /* Which procedure the taper follows (audit item 7: it used to carry its
     own "surgery day", a second copy of a date the procedure already
     has, and the audit found the two disagreeing). Read alongside the
     taper rather than joined into it here - `journal.taper.getTaper()`
     already reads the join for `procedureId`, and this list is what a
     picker among more than one eligible procedure needs besides. */
  let proceduresQuery = liveList((j) => j.procedures.getProcedures());
  let procedures = $derived(proceduresQuery.rows);
  let eligibleProcedures = $derived(procedures.filter(dilationEligible));
  let followedProcedure = $derived(procedures.find((p) => p.id === taper?.procedureId) ?? null);

  let sessionsByDay = $derived(new Map(sessions.map((s) => [s.epochDay, s])));
  let expectedDays = $derived(taper ? expectedSessionDays(taper, today) : []);

  /* The schedule editor. Inline rather than a RecordSheet: there is one
     taper, never a list, so there is nothing here for a sheet's own
     new/edit/delete triple to distinguish. */
  let editingSchedule = $state(false);
  /* Which procedure the schedule being edited will follow. Null only while
     more than one is eligible and none has been picked yet - with exactly
     one, there is nothing to ask, and `scheduleCanSave` refuses to save
     around the gap either way. */
  let selectedProcedureId = $state<string | null>(null);
  let startDayInput = $state(dateInputValueFromEpochDay(today));
  let stagesInput = $state<{ everyNDays: string; days: string }[]>([]);

  function openScheduleEditor() {
    selectedProcedureId = taper?.procedureId ?? (eligibleProcedures.length === 1 ? eligibleProcedures[0].id : null);
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
    selectedProcedureId !== null &&
      stagesInput.length > 0 &&
      stagesInput.every((s) => Number(s.everyNDays) >= 0 && s.everyNDays !== '' && Number(s.days) > 0)
  );

  async function saveSchedule() {
    if (!scheduleCanSave || !selectedProcedureId) return;
    await journal.taper.upsertTaper({
      id: taper?.id,
      procedureId: selectedProcedureId,
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

  <!-- Both reads, not the taper's alone: which notice the empty screen owes
       depends on the procedure list, and a screen that answered before it
       arrived would show the wrong one and then swap it. -->
  {#if taperQuery.loading || proceduresQuery.loading}
    <div class="screen-part" out:crossfade>
      <Skeleton variant="line" count={3} />
    </div>
  {:else if !taper && eligibleProcedures.length === 0}
    <!-- A schedule names the procedure it follows (audit item 7), so with
         none to name there is nothing to type in yet - and the editor would
         open on a save it could never enable. Says so, and sends the person
         to the screen that fixes it. -->
    <div class="screen-part">
      <Notice
        icon="flask"
        key="dilation-no-procedure"
        role={roleAt(activeFlag.roles, SECTION_ROLE.schedule)}
        title={m.dilation_no_procedure_title()}
        text={m.dilation_no_procedure_body()}
        action={{ label: m.dilation_no_procedure_action(), primary: true, href: '/health/surgery' }}
      />
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
      {#if eligibleProcedures.length > 1}
        <!-- A picker only where there is a real choice to make (audit item
             7): with exactly one eligible procedure, `openScheduleEditor`
             already selected it and there is nothing here to ask. -->
        <Field label={m.dilation_procedure_label()} legend>
          {#snippet children()}
            <Segmented
              name={m.dilation_procedure_label()}
              options={eligibleProcedures.map((p) => ({ value: p.id, label: p.name }))}
              value={selectedProcedureId ?? eligibleProcedures[0].id}
              onChange={(v) => (selectedProcedureId = v)}
            />
          {/snippet}
        </Field>
      {/if}
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
              <!-- Suppressed once the note is already saying it, the same
                   rule the week's rows below follow: "Logged" beside a note
                   about the session is the row saying it twice. -->
              {#if !sessionsByDay.get(today)?.note}
                {stateWords(todayMark)}
              {/if}
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
          title={m.dilation_schedule_edit_action()}
          subtitle={[
            followedProcedure?.name,
            followedProcedure?.surgeryEpochDay != null
              ? dayLong(followedProcedure.surgeryEpochDay)
              : m.dilation_procedure_date_unset()
          ]}
          onclick={openScheduleEditor}
        />
      </ListCard>
    </div>

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
