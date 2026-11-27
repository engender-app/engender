<script lang="ts">
  import { undoable } from '$lib/stores/deleteUndo';
  import { journalTextAutocomplete } from '$lib/platform';
  /* Edit the single taper schedule inline and log sessions through
     recordEditor and RecordSheet. The week strip opens a session
     sheet for a date. Today has its own full-size section. Other
     days in the visible week list their logged and expected sessions.

     A stage can set an interval of days or several sessions a day.
     Draw one row per slot, with its ordinal on a multi-session day.
     A gap uses adherence_nothing_logged and opens the sheet for
     that date (ADR-0010). A logged row opens its record. The strip
     indicates whether a day has a session. Expected sessions stay
     out of the calendar's day-ahead marks. */
  import ReadReserve from '$lib/components/kit/ReadReserve.svelte';
  import { readReserve, rememberReserve } from '$lib/data/homeReserve';
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
  import { currentDay } from '$lib/stores/today.svelte';
  import { dilationEligible, expectedSessionDays, sessionSlots, sessionsExpectedOn, sessionsPerDay, stageOn, stagesFromInput } from '$lib/data/taperSchedule';
  import type { TaperSession, TaperStage } from '$lib/data/types';
  import { crossfade, disclose, resize } from '$lib/motion/reveal';
  import { fadeOnly, motionDuration } from '$lib/motion/tokens';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';
  import { writer } from '$lib/stores/attempt.svelte';

  /* The strip's fill is a colour carrying a value, so it takes role 0
     (roles.ts) rather than the sessions' own stripe. Index 2 is
     trans' achromatic middle band, and a logged day filled in white on a
     near-white page is a day drawn as nothing - the same rule the calendar
     states for its own three readings of a day. */
  const SECTION_ROLE = { strip: 0, schedule: 1, sessions: 2 };

  const dayLong = (epochDay: number) => fmtDay(epochDay, { day: 'numeric', month: 'long', year: 'numeric' });
  const today = $derived(currentDay());

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

  /* A day's sessions in the order they were logged (getSessions reads by
     day, then id), since a times-a-day stage puts several on one day. */
  let sessionsByDay = $derived(
    sessions.reduce((byDay, s) => byDay.set(s.epochDay, [...(byDay.get(s.epochDay) ?? []), s]), new Map<number, TaperSession[]>())
  );
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
  let startDayInput = $state(dateInputValueFromEpochDay(todayEpochDay()));
  /* One number field for how often, read by the stage's kind: "every 2
     days" or "3 times a day". Switching the kind keeps the
     number where it is and changes only the words beside it, so nothing in
     the row is swapped out under the person's thumb. */
  type StageKind = 'every' | 'perDay';
  type StageInput = { kind: StageKind; frequency: string; days: string };
  let stagesInput = $state<StageInput[]>([]);

  const stageInputOf = (s: TaperStage): StageInput =>
    s.timesPerDay !== undefined
      ? { kind: 'perDay', frequency: String(s.timesPerDay), days: String(s.days) }
      : { kind: 'every', frequency: String(s.everyNDays), days: String(s.days) };

  function openScheduleEditor() {
    selectedProcedureId = taper?.procedureId ?? (eligibleProcedures.length === 1 ? eligibleProcedures[0].id : null);
    startDayInput = dateInputValueFromEpochDay(taper?.startEpochDay ?? today);
    stagesInput = (taper?.stages ?? []).map(stageInputOf);
    if (stagesInput.length === 0) stagesInput = [{ kind: 'every', frequency: '', days: '' }];
    editingSchedule = true;
  }

  function addStage() {
    stagesInput = [...stagesInput, { kind: 'every', frequency: '', days: '' }];
  }

  function removeStage(index: number) {
    stagesInput = stagesInput.filter((_, i) => i !== index);
  }

  /* A frequency of 0 is a real stage - a rest stretch a surgeon writes into
     the plan, expecting nothing for its days (taperSchedule.ts) - so
     stagesFromInput only rules out a negative or missing one, never zero. */
  let stagesToSave = $derived(
    stagesFromInput(
      stagesInput.map((s) =>
        s.kind === 'perDay'
          ? { everyNDays: 1, timesPerDay: s.frequency, days: s.days }
          : { everyNDays: s.frequency, days: s.days }
      )
    )
  );
  let scheduleCanSave = $derived(selectedProcedureId !== null && stagesToSave !== null);

  /* One save per tap (UI 17): a first schedule has no id yet, so a double
     tap used to store two. A failed save keeps the editor open and says so,
     and so does a save the fields changed under while it ran, so the newer
     values are still there to save. */
  const scheduleWrite = writer();
  const scheduleDraft = () => JSON.stringify([selectedProcedureId, startDayInput, stagesInput]);
  async function saveSchedule() {
    const procedureId = selectedProcedureId;
    const stages = stagesToSave;
    if (!procedureId || !stages) return;
    const sent = scheduleDraft();
    const saved = await scheduleWrite.run(
      () =>
        journal.taper.upsertTaper({
          id: taper?.id,
          procedureId,
          startEpochDay: epochDayFromDateInputValueOrToday(startDayInput),
          stages
        }),
      m.write_failed()
    );
    if (saved && scheduleDraft() === sent) editingSchedule = false;
  }

  /* The session log. An ordinary recordEditor/RecordSheet pair. */
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
    remove: (id) => undoable((j) => j.taper.deleteSession(id)),
    findById: (id) => sessions.find((s) => s.id === id)
  });

  /* What the strip and the rows both read a day off. One
     answer for the two surfaces, so a cell and the row under it can never
     disagree about the same day. */
  let expectedSet = $derived(new Set(expectedDays));
  let markOf = $derived(
    (epochDay: number): DayMark =>
      sessionsByDay.has(epochDay) ? 'logged' : expectedSet.has(epochDay) ? 'expected' : 'off'
  );
  /* How many sessions a day the schedule expected: its stage's
     count on an expected day, none on any other. */
  let expectedOn = $derived((epochDay: number) => (taper && expectedSet.has(epochDay) ? sessionsExpectedOn(taper, epochDay) : 0));
  /* A day's rows: one per expected session, filled in the order sessions
     were logged, and one more for each session past the count. */
  let slotsOn = $derived((epochDay: number) => sessionSlots(sessionsByDay.get(epochDay) ?? [], expectedOn(epochDay)));
  /* Today always has its row, even on a day the schedule expects nothing:
     it is where today's session is logged from. */
  let todaySlots = $derived(slotsOn(today).length > 0 ? slotsOn(today) : [{ session: null, slot: null }]);
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
      .flatMap((epochDay) => slotsOn(epochDay).map((slot, i) => ({ epochDay, i, ...slot })))
  );

  let todayMark = $derived(markOf(today));

  const numbered = (slot: { index: number; count: number } | null) =>
    slot ? m.dilation_session_numbered({ index: slot.index, count: slot.count }) : undefined;

  /* A paged week's rows arrive as a whole and fade in over the outgoing
     week's fade-out, while the box under them travels to its new height
     (cycle-events/+page.svelte draws its week the same way). The first
     week the screen shows is simply there. */
  /* The arriving half of a word swap: the leaving words go through
     crossfade, which lifts them out of flow, and these fade in over the
     same --dur-fast in the place they keep. Not in:crossfade, which
     feature-screens.test.ts keeps off a route's markup. */
  const wordsIn = (_node: Element) => fadeOnly(motionDuration('--dur-fast'));

  let weekShown = false;
  function revealWeek(_node: Element) {
    const duration = weekShown || weeksBack > 0 ? motionDuration('--dur-fast') : 0;
    weekShown = true;
    return fadeOnly(duration);
  }

  /** A tap on a row: its own session if one is logged there, or a blank
      draft for that day if none is. */
  function openSlot(epochDay: number, logged: TaperSession | null) {
    if (logged) session.openEditor(logged);
    else session.editor = { date: dateInputValueFromEpochDay(epochDay), note: '' };
  }

  /** A tap on a strip cell: a blank draft while the day still has an
      expected session with nothing logged against it, and otherwise the
      day's latest session. */
  function openSessionFor(epochDay: number) {
    const logged = sessionsByDay.get(epochDay) ?? [];
    openSlot(epochDay, logged.length < Math.max(1, expectedOn(epochDay)) ? null : logged[logged.length - 1]);
  }

  /** The stage the schedule is in today, in words for the schedule row. */
  function stageWords(stage: TaperStage | null): string | undefined {
    if (!stage) return undefined;
    // The count the schedule reads, not the raw field: an archive can carry
    // a count the editor never wrote (sessionsPerDay clamps it).
    if (stage.timesPerDay !== undefined) return m.dilation_stage_now_times({ count: sessionsPerDay(stage) });
    if (stage.everyNDays < 1) return m.dilation_stage_now_rest();
    return m.dilation_stage_now_every({ count: stage.everyNDays });
  }

  /* Latched: a reserve must not put its placeholder back. */
  let dilationRevealed = $state(false);
  $effect.pre(() => {
    if (!dilationRevealed && (!taperQuery.loading && !proceduresQuery.loading && (!taperQuery.value || !sessionsQuery.loading))) dilationRevealed = true;
  });
  const dilationEstimate = readReserve('dilation');
  const dilationRemember = (px: number) => rememberReserve('dilation', px);
</script>

<!-- A row's state words: logged or not, crossfaded in place when a
     session is logged or deleted rather than swapped in one frame. -->
{#snippet trailWord(word: string)}
  <span class="dilation-trail-word">
    {#key word}<span in:wordsIn out:crossfade>{word}</span>{/key}
  </span>
{/snippet}

<div class="screen">
  <ScreenHeader title={m.dilation()} back="/health/surgery">
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
  <!-- Held at last visit's height until the taper, the procedures and the sessions have answered, then faded in: the body used to cut in at full opacity when they did. -->
  <ReadReserve ready={dilationRevealed} estimate={dilationEstimate} onrest={dilationRemember}>
    {#if !taper && eligibleProcedures.length === 0}
      <!-- A schedule names the procedure it follows (audit item 7), so with
           none to name there is nothing to type in yet - and the editor would
           open on a save it could never enable. Says so, and sends the person
           to the screen that fixes it. -->
      <div class="screen-part">
        <Notice
          icon="repeat"
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
          icon="repeat"
          key="dilation-schedule-empty"
          role={roleAt(activeFlag.roles, SECTION_ROLE.schedule)}
          title={m.dilation_schedule_empty_title()}
          text={m.dilation_schedule_empty_body()}
          action={{ label: m.dilation_schedule_empty_action(), primary: true, onclick: openScheduleEditor }}
        />
      </div>
    {:else if editingSchedule}
      <div class="screen-part">
        <SectionHeading text={m.schedule_title()} />
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
            <div class="kit-row is-static dilation-stage" data-stage={index}>
              <span class="kit-row-text dilation-stage-fields">
                <Segmented
                  name={m.dilation_stage_kind_label()}
                  key={`stage-kind-${index}`}
                  options={[
                    { value: 'every', label: m.dilation_stage_kind_every() },
                    { value: 'perDay', label: m.dilation_stage_kind_per_day() }
                  ]}
                  value={stage.kind}
                  onChange={(v) => (stage.kind = v as StageKind)}
                />
                <label class="dilation-stage-line">
                  <!-- The one thing the kind changes, so the one thing that
                       crossfades; the field beside it keeps its number. -->
                  <span class="dilation-stage-words">
                    {#key stage.kind}
                      <span in:wordsIn out:crossfade>
                        {stage.kind === 'perDay' ? m.dilation_stage_times_aria() : m.dilation_stage_frequency_aria()}
                      </span>
                    {/key}
                  </span>
                  <input
                    class="input"
                    type="number"
                    min={stage.kind === 'perDay' ? 1 : 0}
                    inputmode="numeric"
                    data-stage-frequency={index}
                    bind:value={stage.frequency}
                  />
                </label>
                <label class="dilation-stage-line">
                  <span class="dilation-stage-words">{m.dilation_stage_duration_aria()}</span>
                  <input
                    class="input"
                    type="number"
                    min="1"
                    inputmode="numeric"
                    data-stage-duration={index}
                    bind:value={stage.days}
                  />
                </label>
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
          <button class="btn btn-primary" data-save-schedule disabled={!scheduleCanSave || scheduleWrite.busy} onclick={saveSchedule}>
            <span>{m.save_schedule()}</span>
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
            icon="repeat"
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
            <!-- One row per session today expects. A row each
                 owns its height, so a session logged past the count opens
                 under the others rather than appearing in one frame. The
                 day is named once, on its first row; the rows under it are
                 titled by their number, so "Today" is not said three times.
                 A session past the count has no number and keeps the day. -->
            {#each todaySlots as { session: logged, slot }, i (i)}
              <div class="rows-divide" transition:disclose>
                <ListRow
                  key={i === 0 ? 'dilation-today' : `dilation-today-${i}`}
                  data-dilation-today={i}
                  title={i > 0 && slot ? numbered(slot) : m.today()}
                  subtitle={i > 0 && slot ? logged?.note : todaySlots.length > 1 ? [numbered(slot), logged?.note] : logged?.note || dayLong(today)}
                  onclick={() => openSlot(today, logged)}
                >
                  {#snippet trailing()}
                    <!-- Suppressed once the note is already saying it, the same
                         rule the week's rows below follow: "Logged" beside a note
                         about the session is the row saying it twice. -->
                    {@render trailWord(
                      !logged
                        ? stateWords(slot || todayMark === 'expected' ? 'expected' : todayMark)
                        : logged.note
                          ? ''
                          : m.dilation_session_logged()
                    )}
                  {/snippet}
                </ListRow>
              </div>
            {/each}
          </ListCard>
        </div>

        <div class="screen-part">
          <SectionHeading text={m.dilation_sessions_heading()} />
          <div class="dilation-week" use:resize={shownWeek.first}>
          {#key shownWeek.first}
          <div class="dilation-week-content" in:revealWeek out:crossfade>
          {#if weekRows.length === 0}
            <!-- Its own words rather than a day's answer stretched over
                 seven: "Nothing expected" is what one cell says. -->
            <p class="muted small" data-strip-week-empty>{m.strip_week_nothing()}</p>
          {:else}
            <ListCard role={roleAt(activeFlag.roles, SECTION_ROLE.sessions)}>
              {#each weekRows as { epochDay, i, session: logged, slot } (`${epochDay}-${i}`)}
                <div class="rows-divide" transition:disclose>
                  <ListRow
                    key={i === 0 ? String(epochDay) : `${epochDay}-${i}`}
                    data-session-day={epochDay}
                    data-session-slot={i}
                    title={i > 0 && slot ? numbered(slot) : dayLong(epochDay)}
                    subtitle={i > 0 && slot ? logged?.note : [numbered(slot), logged?.note]}
                    onclick={() => openSlot(epochDay, logged)}
                  >
                    {#snippet trailing()}
                      {@render trailWord(!logged ? m.adherence_nothing_logged() : logged.note ? '' : m.dilation_session_logged())}
                    {/snippet}
                  </ListRow>
                </div>
              {/each}
            </ListCard>
          {/if}
          </div>
          {/key}
          </div>
        </div>
      {/if}

      <!-- The schedule itself, under the reading of it rather than over: it
           is where the taper is edited, not what a person opens this screen
           to find out (rule 16, and the same lesson ticket 54 took on the
           roadmap - open on where you are, not on the pack's provenance). -->
      <div class="screen-part">
        <SectionHeading text={m.schedule_title()} />
        <ListCard role={roleAt(activeFlag.roles, SECTION_ROLE.schedule)}>
          <ListRow
            key="dilation-schedule"
            data-schedule
            icon="repeat"
            title={m.dilation_schedule_edit_action()}
            subtitle={[
              followedProcedure?.name,
              followedProcedure?.surgeryEpochDay != null
                ? dayLong(followedProcedure.surgeryEpochDay)
                : m.no_date_yet(),
              stageWords(stageOn(taper, today))
            ]}
            fadeSwap
            onclick={openScheduleEditor}
          />
        </ListCard>
      </div>

      <!-- Saying you are done dilating (ADR-0052) -
           the finish control lives on `taperSessions`, never on the schedule:
           a taper ending is the normal outcome this ticket exists to name. -->
      <AreaFinish group="dilation" />
    {/if}
  </ReadReserve>

  <RecordSheet
    record={session}
    handle="dilation-session"
    newTitle={m.dilation_session_new_sheet()}
    editTitle={m.dilation_session_edit_sheet()}
    saveLabel={m.save()}
    deleteLabel={m.delete()}
    canSave={() => true}
    confirm={{
      title: m.dilation_session_delete_sheet(),
      question: (r) => m.dilation_session_delete_q({ date: dayLong(r.epochDay) }),
      hint: () => m.delete_undo_hint(),
      confirmLabel: m.delete(),
      cancelLabel: m.keep_it()
    }}
  >
    {#snippet fields(editor)}
      <Field label={m.date_label()} id="dilation-session-date">
        {#snippet children(id)}
          <DatePicker name="dilation-session-date" max={dateInputValueFromEpochDay(today)} bind:value={editor.date} {id} />
        {/snippet}
      </Field>
      <Field label={m.note_label()} id="dilation-session-note">
        {#snippet children(id)}
          <input autocomplete={journalTextAutocomplete()}
            class="input"
            {id}
            name="dilation-session-note"
            placeholder={m.optional_placeholder()}
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

  /* A stage reads top to bottom as the sentence a surgeon's sheet uses:
     how often, then for how long. Words on the left, the number on the
     right, so a long Polish label never squeezes a field. */
  .dilation-stage {
    align-items: flex-start;
  }
  .dilation-stage-fields {
    display: grid;
    gap: var(--space-2);
    padding-block: var(--space-2);
  }
  .dilation-stage-line {
    display: grid;
    grid-template-columns: 1fr 6rem;
    align-items: center;
    gap: var(--space-3);
  }
  /* The leaving words are taken out of flow by crossfade, so this is
     what they stay positioned against. */
  .dilation-stage-words,
  .dilation-trail-word {
    position: relative;
  }
  /* crossfade pins the leaving words at the width they measured; a block
     measures the column, and the trailing words never wrap, so neither
     re-lays its text out in the frame it starts to fade. */
  .dilation-stage-words > span {
    display: block;
  }
  .dilation-trail-word > span {
    white-space: nowrap;
  }

  .dilation-week {
    position: relative;
    isolation: isolate;
    display: flow-root;
  }
  .dilation-week > .dilation-week-content {
    display: flow-root;
  }
</style>
